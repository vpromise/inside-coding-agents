# s04 · File, Shell, and Edit Tools

> Define the workbench boundary before giving an agent hands. Path containment is a first guardrail, not a complete sandbox.

## What you will build {#learn}

s03’s `echo` had no side effects. A coding agent must read, write, edit, and run commands; from this point, a mistake can become data loss, boundary escape, or arbitrary execution rather than a bad string.

This chapter builds a small `Workspace` with `read_file`, `write_file`, `replace_text`, and `run_command`. The default demo exposes reads only. Writes and commands must be enabled explicitly when the registry is created.

By the end, you should be able to:

- Reject absolute paths and `../` escapes using normalized path containment.
- Explain why containment, approval, and OS sandboxing are separate layers.
- State the security benefit and remaining risk of argv execution versus a shell string.
- Design an exact-one-match edit contract.
- Write positive, escape, and failure tests for filesystem and command tools.

---

## The problem: side effects amplify mistakes {#problem}

Consider four model requests:

```text
read_file("README.md")
read_file("../../.ssh/config")
replace_text("app.py", "return 1", "return 2")
run_command(["python3", "script.py"])
```

All four may be valid JSON. A schema can confirm that `path` is a string and `argv` is an array; it cannot know whether a path escapes, a command is approved, a target is trusted, or a child process stays inside system boundaries.

Side-effecting tools therefore need at least four layers:

| Layer | Question | Implemented here? |
| --- | --- | --- |
| Input validation | Are arguments structurally correct? | Yes |
| Workspace boundary | Does the target stay inside the project? | Yes, teaching grade |
| Policy / approval | Is this exact request allowed? | Static allowlist demonstration only |
| OS sandbox | Which system resources can execution actually reach? | No |

> Never translate “the path did not escape” into “the tool is safe.” Accurately stating the boundary is part of security engineering.

---

## Mental model: stronger capabilities need more decision points {#mental-model}

```text
ToolCall
   │
   ├─ validate schema
   ├─ resolve workspace target
   ├─ decide policy / approval
   ├─ execute with timeout + minimal environment
   ├─ bound output
   └─ record result + provenance
```

File and command tools share a registry protocol but have different threat models:

| Tool | Main input | Main risk | Key invariant |
| --- | --- | --- | --- |
| Read | Relative path | Escape, secret leak, huge file | Resolved path stays under root; output is bounded |
| Write | Path + content | Overwrite or malicious config | Explicitly enabled; path remains bounded |
| Edit | Path + old + new | Ambiguous or repeated mutation | Old text appears exactly once |
| Command | argv | Arbitrary execution, network, process escape | Executable allowlist, no shell, timeout |

### Default capability should be minimal

`workspace_tool_registry(workspace)` registers only `read_file`. `allow_writes=True` adds writing and editing; a non-empty `allowed_commands` adds command execution. Reduce capability before descriptors reach the model instead of exposing everything and hoping runtime rejection is enough.

---

## Build the workspace boundary step by step {#build}

### Step 1: pin and normalize the root

```python
class Workspace:
    def __init__(self, root: str | Path) -> None:
        self.root = Path(root).resolve()
```

An absolute, normalized root is stable even if the caller’s cwd changes. Production code must also decide whether the root may contain symlinks or be replaced during a run.

### Step 2: accept relative paths only

```python
def resolve(self, relative_path: str) -> Path:
    if not relative_path or Path(relative_path).is_absolute():
        raise ToolValidationError("path must be non-empty and relative")

    candidate = (self.root / relative_path).resolve()
    try:
        candidate.relative_to(self.root)
    except ValueError as exc:
        raise ToolValidationError("path escapes the workspace") from exc
    return candidate
```

Do not merely search the string for `..`. `a/../README.md` may be valid, while encoding, separators, and symlinks defeat string-only checks. Resolve first, then compare with path semantics.

### Step 3: bound read results

```python
def read_file(self, relative_path: str, *, max_chars: int = 20_000):
    path = self.resolve(relative_path)
    content = path.read_text(encoding="utf-8")
    return {
        "path": relative_path,
        "content": content[:max_chars],
        "truncated": len(content) > max_chars,
    }
```

A safe path can still return unsafe volume. Truncation must be explicit so the model does not mistake a preview for a complete file.

### Step 4: reject ambiguous edits

```python
occurrences = content.count(old)
if occurrences != 1:
    raise ToolExecutionError(
        f"expected exactly one match, found {occurrences}"
    )
updated = content.replace(old, new, 1)
```

Zero matches means the file changed or the model quoted it incorrectly. Multiple matches mean the edit lacks context. Both should stop with structured failure rather than “change something.”

### Step 5: execute argv without a shell

```python
if not argv or argv[0] not in allowed_commands:
    raise ToolValidationError("command is not in the lesson allowlist")

completed = subprocess.run(
    argv,
    cwd=self.root,
    env={"PATH": os.environ.get("PATH", ""), "LANG": "C.UTF-8"},
    capture_output=True,
    text=True,
    timeout=timeout_seconds,
    check=False,
)
```

Passing an argv list means `;`, `$()`, and redirection do not automatically gain shell semantics. The allowed executable may still be general purpose—`python3 -c ...` can do almost anything—so an executable allowlist is a demonstration, not a complete command policy.

### Step 6: project capabilities from configuration

```python
registry = workspace_tool_registry(
    workspace,
    allow_writes=False,
    allowed_commands=(),
)
```

The demo exposes only `read_file`. An absent capability is not advertised to the model; a fabricated name is still rejected by the s03 registry.

---

## Run the bounded read {#run}

Execute:

```bash
python3 -m curriculum.lessons.s04_workspace_tools.demo
```

The demo root is fixed:

```text
curriculum/lessons/s04_workspace_tools/fixture/
└── README.md
```

The model requests `read_file({"path": "README.md"})`. Confirm the successful tool event:

```python
runner, trace = build_demo()
result = runner.run("Read the fixture README and summarize it.")

tool_result = next(
    event for event in result.events
    if event["type"] == "tool.result"
)
assert tool_result["payload"]["ok"] is True
assert tool_result["payload"]["tool"] == "read_file"
```

### Verify escape rejection directly

Use a temporary directory:

```python
from tempfile import TemporaryDirectory
from curriculum.harness import Workspace
from curriculum.harness.tools import ToolValidationError

with TemporaryDirectory() as directory:
    workspace = Workspace(directory)
    try:
        workspace.resolve("../outside.txt")
    except ToolValidationError as error:
        assert str(error) == "path escapes the workspace"
```

The important acceptance condition is that rejection occurs before any read or write.

---

## Four boundaries to describe precisely {#code-reading}

### Path containment is not a sandbox

`Workspace.resolve()` constrains paths that pass through it. It cannot stop an allowed subprocess from reading elsewhere, using the network, forking, or invoking system APIs.

### An allowlist is not semantic analysis

Allowing `git` does not make every subcommand safe. Allowing `python3` approaches general program execution. Production policy often examines executable, subcommand, flags, cwd, environment, and project trust.

### Writes are not atomic here

`write_text()` overwrites directly. Interruption can leave partial state and concurrent writers can race. A stronger implementation writes a neighboring temporary file, flushes it, and atomically renames within the same filesystem.

### Resolve and use have a time window

Between checking a candidate and opening it, an attacker may swap a symlink or directory. This is TOCTOU. High-threat environments need descriptor-based safe open patterns or OS isolation, not another string check.

---

## Common failure modes {#failure-modes}

| Mistake | Why it looks reasonable | Actual risk |
| --- | --- | --- |
| `path.startswith(root)` | Simple containment | `/work/project-evil` may also match |
| Reject only literal `..` | Seems to stop traversal | Encoding, symlinks, normalization bypass it |
| `shell=True` on model text | Pipes and redirects work | Injection surface expands dramatically |
| Replace the first edit match | Always makes progress | Mutates the wrong location silently |
| Return complete stdout | Maximum information | Context overflow and secret leakage |
| Enable writes by default | Convenient | Unnecessary side-effect surface |
| Inherit the full environment | Easy setup | Credentials leak into child processes |

---

## Exercises {#exercises}

### A. Path matrix

Test `README.md`, `./README.md`, `folder/../README.md`, `../outside`, and an absolute path. Write the expected accept/reject table before running assertions.

### B. Exact edit

Create a temporary fixture containing two `TODO` strings and call `replace_text`. Acceptance: content remains unchanged and the error reports `found 2`. Add unique surrounding context and verify one replacement.

### C. Command allowlist

Create a registry that permits only `python3`, then request `git status`. Acceptance: `ToolValidationError` occurs before process start. Explain why permitted `python3` is still high risk.

### D. Timeout

Run an allowed test program with a very short timeout. Design the conversion from `TimeoutExpired` to `ToolExecutionError`, ensuring the trace does not mislabel it as validation failure.

### E. Atomic-write design

Before implementing, draw the sequence: neighboring temp file → write → flush/fsync → permissions → atomic replace → cleanup. Mark recovery behavior for each failure point.

---

## Deep dive: production side-effect governance {#deep-dive}

Production coding agents combine layers:

- **Project trust** so instructions and scripts from an untrusted repository do not gain authority.
- **Capability policy** classifying read, write, network, and destructive actions.
- **Argument-aware approval** for an exact command or path range, not a vague tool name.
- **OS sandboxing** with containers, namespaces, seatbelt, seccomp, or platform isolation.
- **Network policy** covering domains, ports, DNS, proxies, and credential injection.
- **Resource limits** for CPU, memory, file size, process count, and wall time.
- **Audit trail** for requests, decisions, results, and redaction without secret leakage.
- **Rollback** through version control, backups, or transactions.

Security is a chain of inspectable decisions, not one boolean. Collapsing every layer into `safe=True` is especially dangerous because it hides an incomplete boundary.

> Least privilege means more than rejecting dangerous actions. It also means not advertising capabilities that the current task does not need.

---

## Checkpoint {#checkpoint}

Before s05, make sure you can answer:

1. Why is `candidate.startswith(root)` not reliable containment?
2. Which risks disappear without a shell, and which remain?
3. Why must edit require exactly one old-text match?
4. What are the separate jobs of a path boundary and an OS sandbox?
5. Why should write tools be opt-in?

The next chapter handles another boundary: repository `AGENTS.md` files tell an agent how to work, but they are also untrusted input. We will define discovery scope, root-to-leaf ordering, size limits, and authority limits.
