# Execution Policy

Once a model proposes a tool call, the harness must decide whether that exact action may run. Execution policy classifies actions as allowed, requiring a fresh decision, or denied; it binds any approval to a precise request; and it hands permitted work to a separate enforcement boundary.

This is the “Permissions” mechanism in the v0.2 roadmap. The `s10-approval-policy` lesson implements the semantic decision layer, while `s11-sandbox-network` demonstrates why semantic permission and operating-system enforcement must remain separate.

## L0 · Definition and boundary {#definition}

Execution policy answers **may this exact requested effect proceed under the current identity, scope, and state?** It does not prove that the process is technically unable to exceed that decision. That second guarantee belongs to sandbox and network enforcement.

> Approval expresses authority. A sandbox limits capability. Reliable agents need both concepts even when a deployment intentionally provides only one.

```text
model tool proposal
        │
        ▼
schema validation ──► canonical action fingerprint
        │
        ▼
policy resolution: allow / ask / deny
        │                    │
        │ ask                └──► explicit refusal event
        ▼
fresh human/policy decision
        │
        ▼
sandboxed executor ──► normalized result
```

| Boundary | Question | Failure if omitted |
| --- | --- | --- |
| Validation | Is the request well-formed? | ambiguous or injected arguments |
| Policy | Is this class of effect permitted? | everything defaults to executable |
| Approval | Did an authorized actor accept this exact action? | consent broadens across actions |
| Enforcement | Can the process exceed the envelope? | policy bypass reaches the host |
| Audit | What was proposed, decided, and executed? | incident cannot be reconstructed |

### Decision outcomes are not UI states

`allow`, `ask`, and `deny` must be runtime states that work in interactive, headless, and replay contexts. A confirmation dialog is one possible frontend for `ask`; it is not the policy engine itself.

### Exactness is the central invariant

The action executed after approval must be the action that was displayed and fingerprinted. Tool name, normalized arguments, workspace identity, relevant environment, and policy version may all be part of that binding.

> “Approved a write” is too broad. “Approved this canonical write once” is a reviewable statement.

## L1 · Runnable reference {#reference}

Run the approval lesson and verify the Golden Trace:

```bash
python3 -m curriculum.lessons.s10_approval_policy.demo
python3 -m curriculum.golden verify s10-approval-policy
```

The policy has three explicit rules: workspace reads are allowed; writes require a fresh decision; command execution is denied. Anything unmatched fails closed because there is no permissive default.

```python
ApprovalPolicy((
    ApprovalRule(
        id="read-without-prompt",
        tool_names=("read_file",),
        effect="allow",
        reason="Workspace reads are allowed by this lesson policy.",
    ),
    ApprovalRule(
        id="ask-before-write",
        tool_names=("write_file",),
        effect="ask",
        reason="A fresh decision is required for each exact write.",
    ),
    ApprovalRule(
        id="deny-command",
        tool_names=("run_command",),
        effect="deny",
        reason="Command execution is outside the s10 capability set.",
    ),
))
```

The approver accepts only one exact argument object. The gate deep-copies arguments, computes a canonical SHA-256 fingerprint, asks, and checks that nothing changed before execution.

```python
def approve_exact_write(request, rule):
    return request.arguments == {
        "path": "approved.txt",
        "content": "bounded change\n",
    }
```

### The runtime ordering matters

The `AgentRunner` emits the proposed tool call, validates it, requests approval, records the decision, and only then invokes the handler. One-shot grants are consumed. A mutation between review and execution is rejected instead of inheriting the prior decision.

The key Trace relationship is:

```text
tool.call
  └── approval.request (fingerprint + rule + exact arguments)
        └── approval.decision (allowed/denied + reason)
              └── tool.result or tool.error
```

### What the lesson proves

It proves deterministic precedence for these rules, fresh approval of one exact write, denial as a first-class outcome, and a trace that links proposal to decision. It does not create an OS sandbox, authenticate a remote approver, or make a temporary directory a production security boundary.

```bash
python3 -m unittest curriculum.tests.test_vertical_slice
python3 -m curriculum.golden verify s10-approval-policy
```

## L2 · Engineering permissions {#engineering}

A production policy needs canonical requests, deterministic precedence, explicit defaults, authenticated decision makers, revocation, and compatibility with cancellation and concurrency.

### Canonicalize before policy matching

Resolve relative paths against a trusted workspace, normalize host/port pairs, expand tool aliases, reject unknown fields, and preserve a reviewed display form. Do not canonicalize into a broader action after approval.

```python
action = ActionRequest.from_validated_call(
    tool_name=call.name,
    arguments=deepcopy(validated_arguments),
    workspace=trusted_workspace_identity,
)
decision = policy.resolve(action)
```

Canonicalization itself must not perform effects. A path resolver that follows attacker-controlled links during review can become the action it was supposed to describe.

### Make precedence explainable

Conflicting rules are inevitable. A robust engine can use explicit priority, specificity, and deny-overrides semantics, but whichever model it chooses must return the winning rule ID and reason. File order hidden inside configuration is difficult to audit.

### Scope and lifetime

Approval scope can be one call, a stable action fingerprint, a capability within one turn, a workspace session, or a time-limited grant. Broader scopes need stronger disclosure and revocation. A cached approval must never cross workspace identity or silently survive a policy change.

### Headless execution

When `ask` cannot reach an authenticated approver, the safe result is deny or pause—not reinterpretation as allow. Automation should use a predeclared policy with narrow capabilities rather than a flag that auto-accepts every prompt.

### Failure modes {#failure-modes}

| Failure | Consequence | Control |
| --- | --- | --- |
| Approve by tool name only | arguments change after consent | canonical action fingerprint |
| Permissive unmatched default | new tools bypass review | explicit default deny |
| Approval cached globally | authority leaks across projects | identity- and policy-bound scope |
| Dialog says less than request | user cannot make informed choice | exact, bounded display |
| Rule conflict is hidden | outcome cannot be explained | winning rule and precedence trace |
| Headless `ask` becomes allow | unattended escalation | fail closed or pre-authorize narrowly |
| Policy equals sandbox | bypass reaches OS | independent enforcement layer |

### Safety and reliability {#safety}

Policy input is security-sensitive state. Copy tool arguments before presenting them; include relevant paths, destinations, command form, and expected side effects; reject stale decisions when state changes. The approver identity and channel should be authenticated when the decision crosses a process boundary.

Do not let model prose create a grant. Only the policy engine consumes typed decision records. A tool result that says “permission granted” remains untrusted output unless an authenticated approval channel produced the corresponding decision.

Retries require special care. Retrying a read may be harmless; retrying a write or payment-like effect can duplicate action. Bind approval consumption and idempotency policy to the attempt, and emit a new request when material arguments change.

## L3 · Architecture and Agent comparison {#comparison}

The Atlas has reviewed evidence for pinned Codex, Pi, Reasonix, and Claude Code snapshots, but the supported facts differ. The ledger below provides exact wording and source locators.

- The pinned Codex source separates approval resolution from sandbox transformation and represents multiple policy-dependent outcomes.
- The pinned Pi documentation/source establishes a negative boundary: it does not provide an in-process permission system or built-in sandbox, so isolation must be supplied externally.
- The pinned Reasonix source separates approval posture from OS shell confinement and documents fail-closed behavior when enforced confinement is unavailable.
- Claude Code's captured official documentation separates permission rules from OS-level Bash filesystem/network enforcement and describes defense in depth.

These are not four claims of feature equivalence. One is partly a documented absence, one is official-document evidence rather than a source map, and every statement is snapshot-scoped.

### Comparable dimensions

Compare policy vocabulary, default outcome, rule precedence, approval scope, headless behavior, action fingerprinting, sandbox handoff, user-visible explanation, and emitted events. Also record what the evidence cannot see: a CLI surface may hide server-side policy, and source may not prove a particular deployment configuration.

### Avoid capability scoring

More prompts are not automatically safer; fewer prompts are not automatically more autonomous. Evaluate whether rules match real effects, whether enforcement supports the promise, whether decisions are understandable, and whether the trace can reconstruct the action.

## L4 · Research and measurement {#research}

Permission experiments should use adversarial request mutations and deterministic expected outcomes before involving a model. The model can propose calls, but the policy under test must be independently observable.

### Proposed policy matrix

Prepare calls that differ by one field:

- same write path and same content;
- same path with changed content after approval;
- path with equivalent spelling that canonicalizes identically;
- path escaping the trusted workspace;
- denied command hidden behind a tool alias;
- allowed action after policy revision;
- `ask` in a headless run;
- replay of a consumed one-shot decision.

Record proposed and canonical actions, fingerprints, matched rules, decision makers, state revisions, sandbox plan IDs, execution outcomes, and whether any effect occurred. The primary metric is unauthorized-effect count, which must be zero; prompt count is secondary.

### Exercise and acceptance {#exercise}

```bash
python3 -m curriculum.lessons.s10_approval_policy.demo
python3 -m curriculum.golden verify s10-approval-policy
python3 -m unittest curriculum.tests.test_course_contract
```

1. mutate `content` after the approver returns and assert rejection;
2. submit `run_command` and verify no handler event exists after deny;
3. add an unmatched tool and prove default deny;
4. attempt to reuse the successful write decision;
5. add a policy revision to the fingerprint and invalidate an old decision.

The mechanism is understood when the proposal, canonical action, decision, authority, enforcement plan, and observed effect form one traceable chain.

### Research checkpoint

> Ask two separate questions: “Was this action authorized?” and “Could the process exceed the authorized envelope?”

No formal permission experiment is registered yet. The reference exercise validates semantic policy behavior only; OS enforcement is covered by the separate sandbox mechanism.
