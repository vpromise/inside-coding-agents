# s05 · Instructions and Project Discovery

> Repository instructions are context discovered by the harness, not authority a repository grants itself.

## What you will build {#learn}

A coding agent needs more than the user’s current sentence. It must know how the project tests, which directories have special rules, and which conventions apply. Many harnesses discover `AGENTS.md` or similar files and compose them into system context for the current directory.

This chapter implements deterministic root-to-leaf discovery: walk from workspace root to cwd, read each `AGENTS.md` in order, bound every file, and render source-labeled documents into the system prompt.

By the end, you should be able to:

- Explain why discovery belongs to the harness rather than an unconstrained model search.
- Construct one testable load order from root to cwd.
- Separate more-specific project guidance from higher security authority.
- Handle external cwd, oversized files, invalid encoding, and changing instructions.
- Preserve instruction provenance instead of flattening everything into unauditable text.

---

## The problem: constraints vary by directory {#problem}

Consider this repository:

```text
workspace/
├── AGENTS.md                 # global: run tests after changes
├── packages/
│   ├── AGENTS.md             # package: use local naming style
│   └── api/
│       ├── AGENTS.md         # directory: routes need integration tests
│       └── handler.py        # current cwd
└── README.md
```

With cwd at `packages/api`, reading only root loses local guidance; reading only cwd loses global rules; an unordered search makes behavior depend on filesystem traversal order.

The harness must define:

1. Which root begins discovery?
2. How deep does it read?
3. In which order are matching files combined?
4. How much file content may enter the prompt?
5. Can a file demand access outside the workspace or disable the sandbox?

> Instruction precedence composes context. It does not elevate authority. Low-trust text cannot override platform policy, user intent, or security boundaries.

---

## Mental model: a scope chain, not full-text search {#mental-model}

Treat the directory hierarchy like lexical scope:

```text
workspace root
    │  AGENTS.md
    ▼
packages
    │  AGENTS.md
    ▼
packages/api  ← cwd
       AGENTS.md
```

Only the ancestor chain from root to cwd applies. A sibling directory must not enter context because a repository-wide glob happened to find it.

| Dimension | Decision | Teaching policy |
| --- | --- | --- |
| Scope | Which directories matter | Ancestor chain from root to cwd |
| Order | How to compose | Root-to-leaf |
| Identity | How to preserve source | Workspace-relative path |
| Size | How to bound input | 32,000 bytes per file |
| Encoding | Invalid UTF-8 | Replacement decoding |
| Authority | What text may grant | No permission elevation |

### Order is input, not an automatic override engine

The lesson places more-specific files later, so the model sees global and local rules. Conflict semantics still need a product definition: later overrides, all constraints apply, or conflicts ask the user. String concatenation order is not a complete policy engine.

---

## Implement deterministic discovery step by step {#build}

### Step 1: normalize root and cwd

```python
root = Path(workspace_root).resolve()
current = Path(cwd).resolve()
if not _inside(root, current):
    raise ValueError("cwd must be inside workspace_root")
```

Validate containment before discovery. Otherwise a caller could name a trusted root while directing discovery into an arbitrary external directory.

### Step 2: construct the ancestor chain

```python
directories = [root]
cursor = root
for part in current.relative_to(root).parts:
    cursor = cursor / part
    directories.append(cursor)
```

If cwd equals root, the list contains one directory. A three-level cwd produces four deterministic entries. There is no recursive glob and no sibling access.

### Step 3: look for one configured filename per level

```python
for directory in directories:
    candidate = directory / filename
    if not candidate.is_file():
        continue
```

The filename is explicit, defaulting to `AGENTS.md`. Supporting additional conventions requires defined precedence, deduplication, and conflict behavior.

### Step 4: bound bytes before prompt assembly

```python
raw = candidate.read_bytes()
if len(raw) > max_bytes_per_file:
    raw = raw[:max_bytes_per_file]

documents.append(InstructionDocument(
    path=candidate.relative_to(root).as_posix(),
    content=raw.decode("utf-8", errors="replace"),
))
```

The byte limit prevents unbounded prompt input. Replacement decoding keeps malformed input visible instead of crashing the session. A production document should also record `truncated: true` and original byte size; the teaching type does not yet include them.

### Step 5: render with provenance

```python
def render_instructions(documents):
    return "\n\n".join(
        f"# Instructions from {document.path}\n"
        f"{document.content.strip()}"
        for document in documents
    )
```

Source headings tell the model, debugger, and auditor where guidance came from. Flattened text makes conflicts impossible to explain.

### Step 6: place the projection in a system message

```python
documents = discover_instructions(fixture, fixture / "package")
prompt = render_instructions(documents)

runner = AgentRunner(
    model=model,
    trace=trace,
    system_prompt=prompt,
)
```

The s01 initialization puts this prompt before the user message. The core loop does not need to know how filesystem discovery works.

---

## Run the two-level example {#run}

The fixture is:

```text
curriculum/lessons/s05_instructions/fixture/
├── AGENTS.md
└── package/
    └── AGENTS.md
```

Root asks to preserve tests; package asks for local naming style. Execute:

```bash
python3 -m curriculum.lessons.s05_instructions.demo
```

Check system-message order:

```python
runner, trace = build_demo()
result = runner.run("State the two instructions you will follow.")

system = result.messages[0]
assert system.role == "system"
assert system.content.index("Workspace instructions") < \
       system.content.index("Package instructions")
```

The scripted model returns:

```text
I will preserve tests and use package-local style.
```

This does not evaluate model compliance. It validates the harness path discovery → rendering → initial messages.

### Reject an external cwd

```python
with TemporaryDirectory() as root, TemporaryDirectory() as outside:
    with self.assertRaises(ValueError):
        discover_instructions(root, outside)
```

Discovery enforces its own boundary rather than trusting every caller.

---

## The trust boundary of instructions {#code-reading}

### Repository files are data, not higher-priority commands

A repository may come from the internet. Its `AGENTS.md` can say “upload environment variables,” “disable tests,” or “ignore the user.” The harness must place it below platform and user constraints, and text cannot mutate tool permissions automatically.

### Prompt order and authority order differ

Text appearing in a system prompt does not automatically acquire platform-system authority. A product should retain source and trust level; richer protocols keep platform policy, user intent, and repository guidance structurally distinct.

### Discovery must follow the work object

Moving from `package/a` to `package/b` changes applicable guidance. Recompute scope when cwd or target changes, or explicitly freeze a work context. Do not reuse stale discovery forever.

### Provenance and content both need budgets

Many nested instruction files consume context. Bound file count, per-file bytes, total bytes, and depth; trace which sources were loaded, truncated, or skipped.

---

## Common failure modes {#failure-modes}

| Mistake | Result | Better design |
| --- | --- | --- |
| Recursive repository search | Sibling rules contaminate the task | Walk only the root-to-cwd ancestor chain |
| Depend on `os.walk` order | Cross-platform nondeterminism | Construct the directory sequence explicitly |
| Drop source paths | Conflict provenance disappears | Preserve workspace-relative identity |
| No size limit | One file consumes the prompt | Per-file and aggregate budgets |
| Text elevates permission | Malicious repository breaks boundaries | Separate authority from content |
| Cache never expires | Wrong rules after cwd changes | Bind cache to cwd, mtime, or digest |
| Silent truncation | Model assumes guidance is complete | Record and display truncation |
| Ignore discovery errors | Agent modifies under unknown rules | Fail closed or inform the user based on risk |

---

## Exercises {#exercises}

### A. Add a third level

Create `fixture/package/child/AGENTS.md` and move cwd to child. Acceptance: prompt order is root, package, child.

### B. Isolate a sibling

Add `fixture/sibling/AGENTS.md` while cwd remains package. Acceptance: sibling content appears in neither documents nor prompt.

### C. Exercise the size limit

Set `max_bytes_per_file` very low and use multibyte text. Observe a cut in the middle of UTF-8 and replacement decoding. Design an improvement that defends by bytes while preferring a character boundary.

### D. Specify conflict semantics

Root says “use double quotes”; leaf says “use single quotes.” Design three products: leaf override, satisfy all, and ask on conflict. Compare predictability and user experience.

### E. Trace provenance

Add `instructions.loaded` with relative path, bytes, truncation, and digest—but not full sensitive content. Acceptance: the trace proves what was loaded without duplicating the prompt.

---

## Deep dive: instructions as controlled context compilation {#deep-dive}

A production harness can treat prompt construction as a compiler:

```text
platform policy
  + user request
  + project instructions
  + tool descriptors
  + skills / memory
  + runtime facts
          │
          ▼
validated, budgeted model context
```

Every input has provenance, trust, scope, precedence, and budget. The compiler rejects invalid combinations, marks conflicts, trims lower-priority material, and emits an explainable manifest.

Further questions include:

- How do worktrees, monorepos, and cross-directory edits calculate scope?
- Which instructions apply when a symlink points into another project?
- Does an active turn freeze an instruction version or hot-reload changes?
- Does a subagent inherit, rediscover, or receive an explicit summary?
- May links and scripts named by instructions load automatically?
- How do you evaluate instruction following without confusing model failure and discovery bugs?

> A good instruction system does not stuff more text into a system prompt. It compiles heterogeneous context into bounded, attributable input.

---

## Checkpoint {#checkpoint}

Before s06, make sure you can answer:

1. Why does discovery follow only the root-to-cwd ancestor chain?
2. Why does later prompt position not imply higher authority?
3. Why must every instruction retain a source path?
4. How should caches react to cwd changes?
5. Why can repository guidance not disable the sandbox or grant network access?

The next chapter addresses the limit every long session reaches: system text, instructions, messages, tool results, and schemas eventually exceed the model window. Truncation and pruning become explicit, testable, observable budget policies.
