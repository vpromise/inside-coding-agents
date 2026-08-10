# s11 · OS Sandboxes and Network Boundaries

> Approval decides whether an action should happen. A sandbox limits what the executing code can actually do. A robust harness needs both, and it must never label a policy simulator as kernel enforcement.

## What you will build {#learn}

s10 authorized one exact tool request before dispatch. That decision still trusts the tool implementation, its dependencies, child processes, and operating system interactions. A permitted package-metadata tool could contain a bug, follow a malicious redirect, inherit credentials, or spawn a process that reaches an unrelated host.

This chapter adds a portable enforcement contract:

- `CapabilityRequest` describes command, filesystem, and network needs;
- `SandboxProfile` declares the smallest allowed envelope;
- `SandboxBackendCapabilities` says what an execution backend can enforce;
- `SandboxController.plan()` fails closed when the request or backend exceeds the profile;
- exact `NetworkEndpoint(host, port)` values replace ambiguous wildcard strings;
- `sandbox.configure` and `network.decision` expose the compiled boundary;
- a `SimulatedSandboxBackend` proves control flow without performing any OS or network effect.

The final point is essential: the lesson teaches an adapter contract. Its simulator does not establish that a native process was kernel-confined. A production claim requires an actual backend plus observable enforcement tests.

By the end, you should be able to:

- separate semantic permission from mandatory isolation;
- compile a tool request into least-privilege capabilities;
- fail closed when a backend cannot attest a required boundary;
- reason about filesystem, process, environment, network, and credential channels;
- identify DNS, redirect, proxy, child-process, and inherited-descriptor bypasses;
- design traces that distinguish requested, allowed, and enforced capabilities.

### Prerequisites

You should understand workspace path boundaries from s04 and exact approval from s10. This lesson makes no real network call and does not invoke a model service.

---

## The problem: authorized code can still exceed intent {#problem}

Suppose policy allows “fetch metadata for package X from registry Y.” The code that implements this action may still:

1. read credentials or SSH keys from the host;
2. write outside the workspace through a path bug;
3. resolve a hostname to an unexpected address;
4. follow a redirect to another origin;
5. invoke a helper process with broader permissions;
6. inherit open file descriptors, proxy variables, or cloud credentials;
7. contact telemetry, update, or dependency endpoints not shown in the approval.

Approval did not fail; containment was missing.

| Layer | Primary question | Example outcome |
| --- | --- | --- |
| Tool schema | Is the request structurally valid? | `host` is a string |
| Approval policy | Should this semantic action be attempted? | allow metadata lookup |
| Capability compiler | What powers does the attempt require? | process + one destination |
| OS sandbox | What can the process read, write, execute, or signal? | read-only workspace, no devices |
| Network boundary | Which traffic can leave? | one exact host:port, no redirects |
| Trace/evidence | What was requested and demonstrably enforced? | profile, backend, decision, result |

> A path check inside Python is useful validation, but it is not an operating-system sandbox. The same is true for an in-process hostname allowlist.

### Why “run in a container” is not a complete answer

Containers, VMs, micro-VMs, namespaces, seatbelt profiles, seccomp, capability systems, and platform sandboxes have different boundaries. A container with a mounted home directory, host network, Docker socket, or broad credentials may be less isolated than its label suggests.

The harness needs a capability contract and backend attestation, not a boolean named `sandboxed`.

---

## Mental model: compile intent into an enforcement envelope {#mental-model}

The s10 decision stays in place. s11 adds another gate below it:

```text
tool.request
    │
    ▼
approval.decision = allow
    │
    ▼
CapabilityRequest
  command / read paths / write paths / network destinations
    │
    ▼
SandboxProfile + BackendCapabilities
    │
    ├── mismatch or unavailable ──> deny before backend.run
    │
    └── compatible ──> immutable SandboxPlan
                              │
                              ▼
                     enforcement backend
                              │
                              ▼
                         tool.result
```

### Requested, allowed, and enforced are different facts

- **Requested** comes from the tool implementation's declared needs.
- **Allowed** is the controller's comparison against policy.
- **Enforced** requires the backend to apply the plan successfully.

The reference Trace shows the first two and identifies its backend as `simulated-no-effects`. It deliberately does not claim the third for a native process.

### Negative capability is part of the design

A profile should say what is absent: no write paths, no extra hosts, no device access, no inherited credentials. “Allow package fetch” is incomplete unless the default for everything else is deny.

---

## Build the sandbox and network contract {#build}

### Step 1: parse an exact network endpoint

The lesson accepts only `host:port`:

```python
@dataclass(frozen=True, order=True)
class NetworkEndpoint:
    host: str
    port: int

    @classmethod
    def parse(cls, value: str):
        host, separator, raw_port = value.lower().rpartition(":")
        ...
```

It rejects `/`, `*`, and `@` so a URL, wildcard, or user-info trick cannot masquerade as a host. This parser is intentionally small: IPv6 literals, internationalized names, proxies, and DNS policy require a richer production type.

### Step 2: declare backend capabilities

A backend reports three booleans:

```python
SandboxBackendCapabilities(
    filesystem_isolation=True,
    network_isolation=True,
    process_isolation=True,
)
```

Production attestation needs more than booleans—backend/version, profile digest, operating system, fallback behavior, broker configuration, and failure status—but explicit fields are already safer than an undocumented assumption.

### Step 3: define a least-privilege profile

The demo profile permits one abstract command and one destination:

```python
SandboxProfile(
    id="dependency-readonly",
    allowed_commands=("fetch-package-metadata",),
    network_allowlist=(
        NetworkEndpoint.parse("packages.example.invalid:443"),
    ),
)
```

There are no filesystem writes. The hostname uses `.invalid`, so even accidental native resolution cannot reach a real service.

### Step 4: derive capabilities inside the trusted harness

The tool handler maps structured arguments to a `CapabilityRequest`:

```python
request = CapabilityRequest(
    command="fetch-package-metadata",
    network_destinations=(endpoint,),
)
```

Do not let the model directly submit an arbitrary sandbox profile. The harness owns the mapping from semantic action to required powers.

### Step 5: validate filesystem paths before planning

When paths are requested, the controller requires nonempty relative values without `..`. That prevents obvious ambiguity before the backend sees the plan.

```python
path = PurePosixPath(value)
valid = bool(value) and not path.is_absolute() and ".." not in path.parts
```

This remains input validation, not OS confinement. A production backend must resolve mounts, links, case normalization, device paths, and race conditions within its own boundary.

### Step 6: compare destinations exactly

The controller uses set difference:

```python
denied = sorted(set(request.network_destinations) - allowed_endpoints)
if denied:
    reasons.append("network destination is not allowlisted: ...")
```

Exact matching is easy to audit. Suffix rules such as `*.example.com` need careful label boundaries; string `endswith` checks are insufficient.

### Step 7: require the backend to enforce every requested class

If a request needs network and `network_isolation` is false, the plan is denied even when the destination is allowlisted. Likewise for process and filesystem isolation.

```python
if request.network_destinations and not capabilities.network_isolation:
    reasons.append("backend cannot attest network isolation")
```

This is the fail-closed handoff. “Sandbox unavailable” must not silently become direct execution when the profile requires enforcement.

### Step 8: create an immutable plan

`SandboxPlan` records profile ID, original capability request, outcome, reasons, and required capability classes. Execution accepts only a plan belonging to the controller's profile.

### Step 9: emit configuration and network decisions

The handler emits:

```python
trace.emit("sandbox.configure", payload={
    "profile_id": plan.profile_id,
    "backend": "simulated-no-effects",
    "required_capabilities": ["process", "network"],
    "allowed": plan.allowed,
})
trace.emit("network.decision", payload={
    "destinations": ["packages.example.invalid:443"],
    "allowed": plan.allowed,
    "reasons": [],
})
```

The backend label prevents a reader from mistaking a teaching trace for native enforcement evidence.

### Step 10: execute through the backend only

`SandboxController.execute()` rejects a denied or foreign-profile plan, then calls the backend. The simulator records the plan and returns deterministic metadata without creating a process, opening a socket, or changing a file.

```python
return {
    "backend": "simulated-no-effects",
    "command": plan.request.command,
    "network": [...],
    "payload": dict(payload),
}
```

Replacing this backend with a real adapter should not change lesson-level semantics; it should strengthen the evidence available for enforcement.

---

## Run and inspect the bounded attempt {#run}

Run:

```bash
python3 -m curriculum.lessons.s11_sandbox_network.demo
```

The central 13-event sequence is:

```text
tool.request fetch_package_metadata
approval.request / approval.decision allow
sandbox.configure profile=dependency-readonly backend=simulated-no-effects
network.decision destination=packages.example.invalid:443 allowed=true
tool.result backend=simulated-no-effects
```

Verify it:

```bash
python3 -m curriculum.golden verify s11-sandbox-network
```

### Inspect defense in depth

The approval decision says the semantic action is allowed. A separate event then says which process/network envelope was planned. Removing either event makes the trace incomplete.

### Challenge the destination

Plan a request for `evil.example:443`. The plan becomes `allowed=False`; calling `execute()` raises `SandboxDenied`; `SimulatedSandboxBackend.calls` does not grow. The denial happens before the backend boundary.

### Challenge backend availability

Provide a backend reporting `network_isolation=False`. Even the allowlisted host must be denied. This verifies that policy does not pretend unavailable enforcement exists.

---

## Failure modes and boundary bypasses {#failure-modes}

| Failure | Consequence | Safer design |
| --- | --- | --- |
| Approval used as sandbox | Buggy tool can exceed approved intent | Mandatory lower enforcement layer |
| In-process path check labeled OS isolation | Child process bypasses language guard | Kernel/platform backend plus tests |
| Sandbox unavailable fallback | Protected action runs unconfined | Fail closed and expose status |
| Broad host wildcard | Lookalike or delegated subdomain allowed | Exact endpoint or label-aware policy |
| DNS rebinding | Approved name resolves to forbidden address | Resolution policy, IP class checks, pinning |
| Redirect following | Allowed origin forwards data elsewhere | Reauthorize each origin or disable redirects |
| Proxy environment inherited | Traffic leaves through hidden route | Scrub environment and control proxy explicitly |
| Child process escapes profile | Helper gains broader rights | Inherit confinement across process tree |
| Open descriptors inherited | Process accesses pre-opened files/sockets | Close-on-exec and explicit descriptor allowlist |
| Credentials mounted globally | Allowed host can trigger credential misuse | Per-action credential broker and scope |
| Telemetry/update endpoints omitted | Tool contacts undisclosed services | Default deny and observe all egress |
| Simulator reported as native proof | Readers overestimate safety | Evidence label, backend identity, enforcement test |

> Network “off” is not one switch. DNS, loopback, Unix sockets, proxies, IPC brokers, browser helpers, and parent processes can all become communication channels.

### Filesystem boundary details

Read-only does not always mean harmless: source code, `.env`, SSH configuration, browser profiles, and cloud metadata may be sensitive. Writable temp directories can become executable or influence later build steps. Mount inventory and path semantics belong in the profile.

### Process boundary details

An allowlisted executable can load configuration, plugins, dynamic libraries, startup files, or interpreters. Bind executable identity and sanitize environment; do not assume `argv[0]` fully describes behavior.

---

## Exercises with acceptance criteria {#exercises}

### A. Deny an unlisted host

Use `evil.example:443`. Acceptance: plan contains a clear reason, backend call count is unchanged, and no network primitive is invoked.

### B. Deny a wildcard endpoint

Parse `*.example.invalid:443`. Acceptance: parsing fails before policy matching; wildcard semantics cannot enter by accident.

### C. Require filesystem isolation

Add `read_paths=("vendor/manifest.json",)`. Acceptance: the plan lists `filesystem`; a backend without filesystem attestation is denied.

### D. Model redirect policy

Extend the request with `redirects="deny"` or an explicit redirect chain contract. Acceptance: a new origin requires a new decision and cannot inherit the original endpoint silently.

### E. Scrub environment capabilities

Design an environment allowlist containing only locale and an isolated path. Acceptance: proxy, cloud, package-manager, and credential variables do not pass by default.

### F. Add a native-backend evidence test plan

Pre-register attempts to read outside a mount, write a read-only file, connect to a denied endpoint, and spawn a child. Acceptance: expected failures are observable and backend/version is recorded. Do not run against a real workspace.

Run the focused test:

```bash
python3 -m unittest \
  curriculum.tests.test_vertical_slice.VerticalSliceTests.test_s11_denies_unlisted_network_before_backend_execution -v
```

---

## Deep dive: from adapter contract to OS enforcement {#deep-dive}

### Backend-specific translation

Portable profiles need adapters for platform concepts: mounts and namespaces, macOS sandbox profiles, Windows tokens/job objects, seccomp filters, VM shares, egress proxies, or remote execution services. Translation should be deterministic and produce a digestable resolved profile for audit.

### Attestation and startup failure

The harness should know whether confinement was actually installed before user code runs. A backend process exiting early, a missing kernel feature, or a profile parse warning must not be treated as success. Record start status and fail before dispatch.

### DNS and destination identity

Hostname authorization can occur before resolution, after resolution, or both. Each choice has tradeoffs for CDNs, rotating addresses, private ranges, rebinding, and SNI. A production network broker may enforce DNS, destination IP class, TLS hostname, port, protocol, redirects, and byte/data limits together.

### Credential brokering

Network allowlisting does not decide which credentials can be sent. Prefer a broker that injects a scoped token only for an approved request and destination. Keep long-lived secrets outside the sandbox filesystem and environment.

### Observability versus privacy

Record destination identity, decision, profile, byte counts, and failures without logging tokens, private URLs, query parameters, or response bodies unnecessarily. Public traces may need redacted endpoint classes rather than full enterprise hostnames.

### Testing containment

Unit tests prove the planner. Integration tests must challenge the real boundary from inside the sandbox. Include negative cases and preserve failures. A successful normal command is not evidence that denied operations are blocked.

### Agent evidence boundary

Pinned Codex, Reasonix, Pi, and Claude Code claims establish different relationships between semantic policy and external or built-in isolation. They do not prove that a sandbox was active in any unobserved run. This lesson's simulator is reference behavior only; a Native claim needs versioned execution evidence.

### Why s12 moves back to inputs

Sandboxing limits effects after a request exists. Prompt injection changes which requests are proposed. The next chapter binds trust to workspace identity and keeps external/tool text in a data class that cannot silently become project policy.

---

## Checkpoint {#checkpoint}

Before continuing, answer:

1. What does approval decide that a sandbox does not?
2. Why must an unavailable required backend capability deny the plan?
3. Why is a Python path check not OS isolation?
4. What ambiguity does exact `host:port` remove, and what risks remain?
5. Which event field makes the Golden Trace honest about simulation?
6. How would you test a real backend's negative boundaries?

You now have both semantic authorization and an enforcement contract. s12 addresses the other side of the system: which repository and tool inputs are trusted enough to influence instructions before the model proposes an action.
