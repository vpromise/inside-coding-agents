# s10 · Approval Policy and Exact Authorization

> A model may propose an action, but only the harness can authorize an effect. Approval is a typed decision over one concrete request—not a friendly sentence and not a permanent transfer of control.

## What you will build {#learn}

s09 let memory and skills influence the next model turn. Influence must stop at the action boundary. A skill can recommend a command, retrieved text can suggest a file change, and the model can emit a perfectly valid tool call; none of those facts means the action is permitted.

This chapter inserts an `ApprovalGate` between `tool.request` and `ToolRegistry.execute`. The gate:

- canonicalizes the tool name and arguments into an `ActionRequest`;
- selects the first matching `ApprovalRule`;
- produces `allow`, `ask`, or `deny` policy posture;
- binds a fresh approval to the exact request fingerprint;
- fails closed when an `ask` decision has no approver;
- emits `approval.request` and `approval.decision` before any side effect.

By the end, you should be able to:

- distinguish schema validation, capability exposure, policy evaluation, approval, and execution;
- design rule ordering and a safe default;
- explain why approval must bind arguments, target, scope, and time;
- prevent an approval cache from silently authorizing a different action;
- model headless automation without turning “no human present” into “allow everything”;
- inspect a trace and prove that the tool ran only after authorization.

### Prerequisites

You should understand the tool roundtrip from s03, workspace effects from s04, event ordering from s07, and lazy skills from s09. The model remains scripted and no API key is needed.

---

## The problem: a valid tool call is still only a request {#problem}

A JSON schema answers questions such as “is `path` a string?” It cannot answer “should this path be written now?” A tool registry answers “which implementation owns `write_file`?” It cannot decide whether the current user granted this write.

Conflating those layers creates common failures:

| Mistaken shortcut | What it actually proves | What remains unanswered |
| --- | --- | --- |
| Tool is visible to the model | The model may request it | Whether this invocation is allowed |
| Arguments pass schema | Shape and basic types are valid | Target ownership, sensitivity, intent, blast radius |
| User asked to “fix tests” | A goal was expressed | Whether arbitrary deletion, network, or publish is allowed |
| A skill names `run_command` | The workflow expects a capability | Whether the installed skill or current task may use it |
| A similar call was approved earlier | One prior decision existed | Whether arguments, workspace, session, or policy changed |
| The action is reversible | Recovery might be possible | Whether the action is acceptable in the first place |

An unsafe loop often looks like this:

```text
model tool call
      │
      ├── schema valid? yes
      ▼
execute immediately
```

The missing question is authorization.

> Permission answers what a principal may do. Approval records a decision for a requested action. Neither is equivalent to sandbox enforcement.

### Why a confirmation dialog is not enough

A dialog can display an incomplete summary, then execute changed arguments. A broad “allow shell” button can cover hundreds of materially different commands. An approval remembered by tool name can let `write_file("notes.md")` authorize `write_file("release.sh")`.

The binding must include the action identity. The lesson hashes canonical JSON containing both `tool` and `arguments`. Production systems may also bind workspace identity, resolved resources, executable digest, environment class, network destinations, user/session identity, expiration, and policy revision.

---

## Mental model: proposal, policy, fresh decision, effect {#mental-model}

Use a pipeline with independent responsibilities:

```text
model proposal
    │
    ▼
tool.request ──> schema validation
    │
    ▼
ActionRequest(tool + canonical arguments)
    │
    ▼
ApprovalPolicy ── allow ───────────────┐
    │                                  │
    ├────────── ask ──> fresh approver ├──> approval.decision
    │                                  │
    └────────── deny ──────────────────┘
                                           │
                                  allow? ──┴──> execute
                                           └──> structured denial
```

Each transition is observable. The model cannot forge the policy result because the harness emits it. The tool implementation cannot decide its own permission because the gate runs before dispatch.

### Three policy effects

- `allow` means policy can authorize this class without fresh interaction. It should be narrow and reviewable.
- `ask` means policy requires a new external decision for the exact request.
- `deny` means the action must not run, even if a lower-priority component would like to allow it.

The lesson resolves the first matching rule and defaults to deny. Production precedence may include administrator, organization, user, workspace, session, and tool-specific sources. Whatever the hierarchy, deny semantics and conflict behavior must be explicit.

### Decision and enforcement are different

An approval decision is semantic: “this exact write is allowed.” It does not stop a buggy `write_file` implementation from escaping the workspace. s11 adds an OS enforcement contract. Defense in depth requires both layers.

---

## Build the approval gate step by step {#build}

### Step 1: represent the exact proposal

`ActionRequest` contains a tool name and copied arguments:

```python
@dataclass(frozen=True)
class ActionRequest:
    tool: str
    arguments: JsonObject
```

The copy matters. Policy should not evaluate a mutable object that another component changes before execution.

### Step 2: calculate a canonical fingerprint

Dictionary iteration order or whitespace must not change identity. Serialize with sorted keys and compact separators, then hash:

```python
wire = json.dumps(
    {"tool": self.tool, "arguments": self.arguments},
    ensure_ascii=False,
    sort_keys=True,
    separators=(",", ":"),
)
fingerprint = hashlib.sha256(wire.encode("utf-8")).hexdigest()
```

This is an identity binding, not a secrecy mechanism. Do not publish sensitive arguments merely because they were hashed elsewhere; traces still need redaction policy.

### Step 3: declare rules as data

Each rule has a stable ID, exact tool names, an effect, and an explanation:

```python
ApprovalRule(
    id="ask-before-write",
    tool_names=("write_file",),
    effect="ask",
    reason="A fresh decision is required for each exact write.",
)
```

Stable rule IDs let traces, tests, policy reviews, and incident reports refer to the same decision source. A display label is not enough.

### Step 4: make rule order deterministic

`ApprovalPolicy.evaluate()` selects the first matching rule. If none matches, it synthesizes `default-deny`:

```python
for rule in self.rules:
    if rule.matches(request):
        return rule
return ApprovalRule(
    id="default-deny",
    tool_names=(),
    effect="deny",
    reason="No explicit approval rule matched the requested tool.",
)
```

A production matcher may inspect resolved paths, operation class, destination, repository state, or command AST. Matching raw shell substrings is fragile; the lesson deliberately uses a simple exact tool boundary.

### Step 5: separate request from resolution

The gate has two operations:

```python
pending = gate.request(call.name, call.arguments)
decision = gate.resolve(pending)
```

This split gives the harness a point to emit `approval.request` before consulting a UI, policy service, or headless decision provider.

### Step 6: fail closed when no approver exists

For `ask`, absence is denial:

```python
if self.approver is None:
    return ApprovalDecision(
        outcome="deny",
        source="fail-closed",
        grant_scope="none",
        ...,
    )
```

Headless automation should use an explicit noninteractive policy profile. It should not reinterpret “cannot ask” as “approved.”

### Step 7: bind the grant to one request

The scripted approver accepts only this argument object:

```python
return request.arguments == {
    "path": "approved.txt",
    "content": "bounded change\n",
}
```

The resulting decision records `grant_scope="once"`. Changing content produces another fingerprint and another decision. The demo intentionally does not implement a persistent approval cache.

### Step 8: emit the two decision events

`approval.request` records the tool, call ID, fingerprint, rule, and policy effect. `approval.decision` adds outcome, source, reason, and grant scope. Neither event contains hidden reasoning.

```python
self._emit("approval.request", payload={...})
decision = self.approval_gate.resolve(pending)
self._emit("approval.decision", payload={...})
```

The fingerprint in both events must match. That invariant prevents a UI from approving one request while the runtime executes another.

### Step 9: deny before dispatch

When the decision is deny, the runtime appends a structured tool result with `error_type="ApprovalDenied"` and continues the loop. It never calls `ToolRegistry.execute`.

```python
if not decision.allowed:
    payload = {
        "ok": False,
        "error_type": "ApprovalDenied",
        "error": decision.reason,
    }
```

Returning a tool result lets the model explain the denial or choose a safer alternative. It must not pressure the user repeatedly or mutate the request invisibly.

### Step 10: execute only after allow

The ordinary registry path remains unchanged after the gate. Authorization is a wrapper around effects, not a second tool implementation.

---

## Run and inspect the authorization trace {#run}

Run the lesson:

```bash
python3 -m curriculum.lessons.s10_approval_policy.demo
```

The 11-event Golden Trace contains this central sequence:

```text
tool.request write_file
approval.request  effect=ask  fingerprint=409c…
approval.decision outcome=allow source=approver scope=once
tool.result write_file ok=true
```

Verify the committed trace:

```bash
python3 -m curriculum.golden verify s10-approval-policy
```

### Inspect the exact binding

Both approval events carry the same 64-character fingerprint. The event after them writes only `approved.txt` with 15 characters. No decision appears after the side effect.

### Inspect the message history

The second model request receives the normal tool result. Approval metadata stays in the trace rather than being disguised as a model message. A product may show the decision to the model, but should keep authoritative policy state outside model-editable text.

### Try a denial without touching a file

Construct an `ApprovalGate` with `default_effect="ask"` and no approver. Resolving any request yields `source="fail-closed"`, `outcome="deny"`, and `grant_scope="none"`.

---

## Failure modes and safety boundaries {#failure-modes}

| Failure | Consequence | Safer contract |
| --- | --- | --- |
| Default allow | Newly added tools execute before policy review | Default deny and explicit rollout |
| Match by tool name only | One approval covers unrelated targets | Bind canonical arguments and resolved resources |
| Broad “always allow shell” | Arbitrary command language bypasses intent | Capability-specific profiles and narrow scopes |
| Approval after execution starts | User decision is ceremonial | Gate before dispatch and child-process creation |
| Mutable arguments | Approved request differs from executed request | Freeze/copy arguments and verify fingerprint |
| Missing approver means allow | Headless jobs escalate silently | Fail closed or use explicit automation policy |
| Permanent approval cache | Old intent survives context and policy changes | Scope by action/workspace/session/time and revoke |
| Lower layer overrides deny | Managed restrictions become advisory | Define precedence where stronger deny wins |
| Secret-rich approval UI | Trace or screen leaks credentials | Structured redacted summaries and protected details |
| Repeated ask loop | Model pressures user until accepted | Rate limit, surface denial, require material change |

> Approval reduces ambiguity about intent. It cannot make a dangerous implementation safe, prevent kernel-level escape, or undo an external side effect.

### Confused deputies

The harness often has credentials and filesystem access that the model does not. A tool request can trick it into using those powers for an untrusted document or dependency. Policy needs to identify the requesting principal, the authority source, the target, and the credential scope—not just the tool function.

### Time-of-check to time-of-use

A path may resolve differently after approval because of symlinks, repository changes, mounts, or branch switches. Production authorization should either execute against an immutable resolved target or revalidate the binding immediately before the effect.

---

## Exercises with acceptance criteria {#exercises}

### A. Deny an unlisted tool

Request `replace_text` without adding a rule. Acceptance: `approval.decision` uses `default-deny`, the file does not change, and `tool.result.error_type` is `ApprovalDenied`.

### B. Reject changed content

Change only the proposed content. Acceptance: the fingerprint changes and the scripted approver denies the new request.

### C. Add a session-scoped cache

Design a cache key containing request fingerprint, workspace fingerprint, policy revision, user identity, and expiry. Acceptance: any changed field causes a miss; deny decisions are never silently converted into grants.

### D. Test rule precedence

Add a broad allow rule and a narrower deny rule. State and test the precedence model. Acceptance: the outcome is deterministic and a policy reviewer can explain which rule won.

### E. Redact sensitive arguments

Add a tool with a secret-like argument. Acceptance: policy evaluates the actual value inside the trusted process, while public trace and UI summaries redact it consistently.

### F. Model noninteractive execution

Create a headless profile that allows only `read_file` under a fixture. Acceptance: `ask` remains deny, writes remain deny, and no call path imports an interactive fallback.

Run the focused contract:

```bash
python3 -m unittest \
  curriculum.tests.test_vertical_slice.VerticalSliceTests.test_s10_binds_approval_to_the_exact_action -v
```

---

## Deep dive: production approval architecture {#deep-dive}

### Policy inputs

A real decision may depend on tool identity, normalized arguments, resolved path, operation type, workspace trust, current Git state, network endpoint, executable identity, environment, user role, organization policy, prior decisions, and whether the run is interactive. Capture the inputs needed to reproduce the decision without placing secrets in public telemetry.

### Capability design beats command parsing

`run_command(["git", "status"])` and `run_command(["curl", ...])` share one tool but represent different powers. Smaller typed capabilities—read repository status, fetch one approved URL, run one test target—are easier to authorize and sandbox. General shell remains useful, but it needs stronger parsing, isolation, and review.

### Approval UX as a security surface

The user needs the exact target, operation, reason, data flow, network destination, credentials involved, and grant scope. Truncated commands, hidden redirects, misleading path display, or a preselected “always allow” option weaken the decision. Accessibility matters: a keyboard or screen-reader user must receive the same material details.

### Policy changes and revocation

Long-running sessions can outlive policy updates. Include policy revision in grants, invalidate on stronger deny, and make revocation observable. A branch or resumed session should not inherit grants by accident.

### Hooks and extensions

Extensions may add pre-tool hooks, but an extension-level allow must not override a stronger platform or managed deny. Hooks themselves belong to the trust boundary because they can rewrite arguments, add tools, or suppress events. Evaluate the final immutable request after authorized transforms.

### Agent evidence boundary

The linked claims establish that Codex, Reasonix, and Claude Code separate aspects of policy/approval from execution or sandboxing, while Pi explicitly leaves permissions and isolation outside its minimal core. They do not prove identical rule syntax, precedence, caching, or UI behavior. Compare only the surfaces each pinned snapshot supports.

### What s11 adds

Even perfect approval evaluates intent, not containment. The next chapter compiles an allowed action into filesystem, process, and network capabilities and requires an enforcement backend to attest that it can confine them.

---

## Checkpoint {#checkpoint}

Before continuing, answer:

1. Why is schema validity not authorization?
2. Which fields must an approval fingerprint bind?
3. What should happen when policy says `ask` but no approver exists?
4. Why is `grant_scope="once"` safer than a tool-wide cache?
5. Where must approval events appear relative to `tool.result`?
6. Why can approval never replace an OS sandbox?

You now have a fail-closed semantic decision boundary. s11 keeps that boundary and adds containment: the approved action still receives only the filesystem, process, and network powers its sandbox profile explicitly grants.
