# Memory Retrieval

An agent cannot keep every useful project fact in every model request. Memory retrieval stores selected, source-attributed records outside immediate context, then retrieves only candidates relevant to the current turn. The difficult part is not persistence; it is deciding what is worth remembering, what is still true, and how retrieved text may influence action.

The `s09-memory-skills` lesson provides the runnable baseline. It deliberately separates memory records from skills: memory supplies project facts, while a skill supplies procedural instructions and an allowed tool set.

## L0 · Definition and boundary {#definition}

Memory retrieval is a pipeline with four decisions: write, index, select, and inject. A file named `memory.md` implements persistence, but it does not by itself define any of those policies.

> Memory is not “more context.” It is a provenance-bearing source from which the harness may construct context.

```text
observed event ──► write policy ──► scoped memory record
                                         │
current intent ──► query/retriever ───────┤
                                         ▼
                               ranked candidates
                                         │
                                  admission policy
                                         ▼
                               model-visible context
```

| Layer | Core question | Evidence to retain |
| --- | --- | --- |
| Write | What deserves persistence? | author, source, scope, reason |
| Index | How can it be found? | index version and searchable fields |
| Select | Why did this record match? | query, score/filter, candidate IDs |
| Inject | Where can it influence the turn? | trust label, slot, admitted IDs |
| Invalidate | What made it stale or false? | superseding record or tombstone |

### Memory is not session history

The session event log answers what happened. Memory is a curated projection intended for future reuse. Keeping them separate prevents a retrieval optimization from rewriting audit history and prevents every incidental statement from becoming durable project truth.

### Memory is not a skill

A memory such as “run the focused test before the full suite” records a workspace policy with a source. A skill such as `test-first` contains a reusable procedure and a capability declaration. Both may be loaded on demand, but their authority, lifecycle, and review rules differ.

> Retrieval relevance never upgrades an untrusted record into an instruction that can authorize effects.

## L1 · Runnable reference {#reference}

Run the deterministic lesson and its Golden Trace check:

```bash
python3 -m curriculum.lessons.s09_memory_skills.demo
python3 -m curriculum.golden verify s09-memory-skills
```

The demo creates one source-attributed `MemoryRecord` and one `SkillDefinition`. Neither is inserted into the initial prompt. The scripted model must explicitly call `memory_search` and `load_skill`.

```python
memory.remember(
    MemoryRecord(
        id="project-test-policy",
        content="Run the focused test before the full suite.",
        scope="workspace",
        source="AGENTS.md#testing",
    )
)
```

The skill descriptor is registered separately:

```python
skills.register(
    SkillDefinition(
        id="test-first",
        description="Choose focused checks before broad regression tests.",
        instructions="Run the smallest relevant test, inspect failure, then widen coverage.",
        tool_names=("run_command",),
    )
)
```

This shape demonstrates progressive disclosure: small descriptors and explicit tools are visible first; full records enter context only after selection.

### Retrieval must emit provenance

`memory_search` emits `memory.read` with the query, matching record IDs, and source locators. `load_skill` emits `skill.load` with the skill ID and declared tools. The tool result returns the same source alongside the memory content.

```python
trace.emit(
    "memory.read",
    payload={
        "query": query,
        "match_ids": [record.id for record in matches],
        "sources": [record.source for record in matches],
    },
)
```

The source is not decoration. It lets a reader verify the record, lets the harness detect changed policy, and prevents a retrieved sentence from appearing context-free.

### What the Golden Trace proves

It proves that explicit retrieval occurs before the second model turn, that record and skill loading are distinguishable events, that source metadata survives normalization, and that the final scripted response uses the retrieved testing rule. It does not prove semantic ranking quality or durable storage across processes.

```bash
python3 -m unittest curriculum.tests.test_vertical_slice
python3 -m curriculum.golden verify s09-memory-skills
```

## L2 · Engineering memory {#engineering}

Production memory needs a lifecycle, not only CRUD. Records should be created from reviewed observations, scoped to an identity, retrieved under a declared strategy, and invalidated when their source changes.

### Use a typed record envelope

```python
MemoryRecord(
    id=stable_id,
    content=normalized_fact,
    scope="workspace",
    source="AGENTS.md#testing",
    source_revision=commit_or_hash,
    created_at=timestamp,
    trust="project-policy",
    expires_at=None,
    supersedes=older_id,
)
```

Separate content from metadata. Search can use content and tags, while authorization and freshness decisions use scope, trust, source revision, and invalidation state.

### Write policy comes first

Automatic “remember everything” stores secrets, transient failures, model speculation, and contradicted facts. Define allowlisted record kinds, redact before persistence, and prefer user-visible writes for durable preferences or policies. A model proposal to remember something is only a candidate until policy accepts it.

### Retrieval is a two-stage decision

Candidate generation may use exact match, lexical search, embeddings, graph links, or hybrid ranking. Admission then applies scope, trust, freshness, privacy, and budget. Keeping stages separate makes it possible to ask whether a relevant record was never found or was found and intentionally rejected.

```text
candidate recall metrics  ≠  context admission metrics
```

### Invalidation and contradiction

Source-bound records should become stale when the source revision changes. A new record may supersede an old one without erasing history. Contradictory records should not be silently averaged; surface the conflict, prefer the authoritative/current scope under policy, and preserve both IDs in the decision trace.

### Failure modes {#failure-modes}

| Failure | Result | Control |
| --- | --- | --- |
| Memory has no source | unverifiable “fact” | require provenance for durable records |
| Wrong workspace scope | cross-project leakage | bind to canonical workspace identity |
| Stale policy retrieved | obsolete command or convention | revision check and invalidation |
| Similar but irrelevant hit | context pollution | separate candidate and admission traces |
| Model speculation stored | false fact becomes persistent | reviewed write policy |
| Secret persisted | long-lived disclosure | redaction and record-kind allowlist |
| Retrieved text treated as authority | prompt injection persists | trust labels survive injection |

### Safety and reliability {#safety}

Memory crosses time and often crosses sessions, so its blast radius can exceed one tool result. Bind every store and query to a canonical user/workspace/project identity. Never rely on a path string supplied by the model as the identity boundary.

Retrieved records are data unless a higher-level instruction compiler recognizes their source and type. An external webpage remembered yesterday remains external content today. Relevance scores must not decide permission, tool access, approval, or trust.

Deletion deserves explicit semantics. “Forget” may mean stop retrieving, tombstone a record, remove encrypted storage, or request deletion from a remote service. The product should state which operation occurred and what backups or traces remain.

## L3 · Architecture and Agent comparison {#comparison}

This mechanism currently has no Agent implementation that satisfies the Atlas `Snapshot + Claim` threshold. The Agent matrix below intentionally exposes five unknowns. Product memory features, instruction files, chat history, and skills cannot be treated as the same mechanism without source or reproduction evidence.

### Research dimensions for each snapshot

Map the following independently:

1. storage location and ownership;
2. workspace, user, organization, and global scopes;
3. write authority and user visibility;
4. source attribution and revision pinning;
5. retrieval algorithm and query producer;
6. ranking versus final admission policy;
7. context slot and trust label after injection;
8. invalidation, export, and deletion;
9. telemetry and remote data handling.

Do not infer implementation from a command named “memory.” It may expose a flat instruction file, a server-side profile, vector retrieval, session summaries, or a completely different boundary.

### Reference harness evidence boundary

The lesson demonstrates exact search over an in-memory store and explicit skill loading. It is useful because every record and event is inspectable. It does not implement embeddings, durable encryption, multi-user isolation, cross-session persistence, or vendor behavior. Those omissions are part of the teaching boundary, not hidden capabilities.

## L4 · Research and measurement {#research}

Memory experiments should separate write precision, candidate recall, admission precision, freshness, and downstream task effect. A single “did the agent remember?” score combines too many failure points.

### Proposed freshness and isolation scenario

Prepare two workspace identities with similar vocabulary but conflicting test policies. In workspace A, store a source-pinned policy. Update the source to supersede it, then issue queries before and after invalidation. In workspace B, ask the same question and verify that no A record appears.

Publish:

- record envelopes with sensitive content replaced by deterministic fixtures;
- write, query, candidate, admission, and invalidation events;
- index/retriever version;
- workspace identity derivation;
- expected relevant and prohibited record IDs;
- the exact model-visible injected block.

Measure relevant-record recall, irrelevant admission, stale admission, cross-scope leakage, provenance survival, and deterministic behavior for exact fixtures. If a model generates queries or judges memories, run repetitions and report that variance separately.

### Exercise and acceptance {#exercise}

```bash
python3 -m curriculum.lessons.s09_memory_skills.demo
python3 -m curriculum.golden verify s09-memory-skills
python3 -m unittest curriculum.tests.test_course_contract
```

1. add a second record whose words match but whose scope is different;
2. make `MemoryStore.search` return candidates, then add a separate scope admission step;
3. attach a source revision and mark the first record stale after a simulated change;
4. preserve both candidate IDs and admitted IDs in the Trace;
5. demonstrate that a loaded skill's `tool_names` declaration does not grant permission by itself.

The mechanism is understood when you can explain who wrote a record, why it matched, why it was admitted, which request received it, and how it becomes stale or disappears.

### Research checkpoint

> A memory without scope, source, and invalidation is merely persistent text—and persistent mistakes are harder to debug than temporary ones.

No formal experiment is registered for this mechanism. Until one is reviewed, the exercises establish only the deterministic reference contract.
