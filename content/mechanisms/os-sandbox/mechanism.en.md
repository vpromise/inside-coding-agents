# Operating-System Sandbox

A semantic policy can decide that a command should only read one workspace and contact one endpoint. An operating-system sandbox is the lower layer that makes exceeding that envelope difficult or impossible for the child process, its descendants, and the resources they can reach.

The `s11-sandbox-network` lesson teaches the contract without claiming real isolation: it uses a `SimulatedSandboxBackend`, performs no network request, and labels every result as simulation. That honesty is the starting point for evaluating real backends.

## L0 · Definition and boundary {#definition}

An OS sandbox transforms a capability request into an enforced execution environment. It can constrain filesystem access, process creation, network destinations, environment variables, devices, IPC, system calls, resource consumption, and inherited handles—depending on platform and backend.

> A policy saying “network denied” is an intention. A verified kernel or virtualization boundary is enforcement.

```text
validated action + semantic permission
                 │
                 ▼
          capability request
                 │
                 ▼
       sandbox profile + backend
                 │
          configure / attest
                 ▼
       child process and descendants
                 │
                 ▼
         normalized result + evidence
```

| Layer | Example responsibility | What it cannot prove alone |
| --- | --- | --- |
| Tool schema | command has valid fields | command is authorized |
| Approval policy | user accepts exact action | process cannot escape |
| Sandbox profile | desired capabilities are declared | backend enforced them |
| OS/backend | capabilities are technically limited | user intended the action |
| Trace | plan and outcome are recorded | hidden host state without attestation |

### “Sandbox” is not one universal guarantee

A container, namespace, seatbelt profile, seccomp filter, restricted token, VM, micro-VM, remote worker, and application-level path check have different threat models. Name the backend, platform, configuration, and known gaps. A generic `sandbox: true` field is not sufficient evidence.

### The fail-closed rule

If policy requires a capability restriction that the selected backend cannot enforce, the controller must reject execution or route to another backend. Running unwrapped and attaching a warning afterward violates the contract.

> Unsupported enforcement is a decision outcome, not a reason to silently weaken the profile.

## L1 · Runnable reference {#reference}

Run the deterministic lesson and verify its Golden Trace:

```bash
python3 -m curriculum.lessons.s11_sandbox_network.demo
python3 -m curriculum.golden verify s11-sandbox-network
```

The profile allows one synthetic command and one exact endpoint, `packages.example.invalid:443`. The `.invalid` top-level domain and simulated backend ensure that the lesson makes no real network request.

```python
SandboxProfile(
    id="dependency-readonly",
    allowed_commands=("fetch-package-metadata",),
    network_allowlist=(
        NetworkEndpoint.parse("packages.example.invalid:443"),
    ),
)
```

The handler turns validated arguments into a typed `CapabilityRequest`, asks the controller for a plan, records `sandbox.configure` and `network.decision`, then executes a simulated payload through that accepted plan.

```python
request = CapabilityRequest(
    command="fetch-package-metadata",
    network_destinations=(endpoint,),
)
plan = controller.plan(request)
return controller.execute(
    plan,
    {"package": package, "status": "metadata-only"},
)
```

### Why the simulation is useful

It makes boundary logic testable on any development machine: exact endpoint parsing, capability matching, missing-backend capability rejection, plan immutability, and trace shape. It also prevents a tutorial command from contacting a third party.

Simulation must remain visible. The Trace payload says `backend: simulated-no-effects`; the returned data is supplied by the lesson, not received from the endpoint.

### Read the trace as two decisions

`approval.decision` says the semantic tool capability is permitted. `sandbox.configure` says which enforcement profile and backend were selected. `network.decision` says which normalized destinations the plan accepted. Only after all three does `tool.result` appear.

```text
approval.decision
  └── sandbox.configure
        └── network.decision
              └── tool.result (simulated)
```

### Verify the teaching boundary

```bash
python3 -m unittest curriculum.tests.test_vertical_slice
python3 -m curriculum.golden verify s11-sandbox-network
```

The tests should assert both allowed and rejected plans. They must never present the simulation as a kernel-enforced reproduction.

## L2 · Engineering isolation {#engineering}

Production sandbox design starts with a threat model and a backend capability matrix. The same profile cannot be assumed portable across operating systems.

### Describe requested capabilities positively

Prefer a minimal allowlist over an endless denylist:

```python
CapabilityRequest(
    executable="package-inspector",
    argv=("metadata", "reference-harness"),
    read_paths=(workspace / "lockfile",),
    write_paths=(),
    network_destinations=(Endpoint("registry.example", 443),),
    environment=("LANG",),
    max_runtime_seconds=20,
)
```

Normalize endpoints before matching. DNS names, resolved addresses, redirects, proxies, Unix sockets, IPv6 forms, and port ranges can all change what “one destination” means. Decide whether policy binds the name, address, certificate identity, or some combination, and record the result.

### Child processes and inherited authority

Restrictions must follow descendants. An allowed shell that launches an unrestricted child defeats the profile. Review inherited file descriptors, sockets, credentials, environment variables, working directory handles, and agent-control channels. A process may access a resource without opening it if the parent already handed it a descriptor.

### Filesystem semantics

Path allowlists need canonical workspace identity, symlink policy, mount behavior, case sensitivity, special files, temporary directories, and rename semantics. Application-level `resolve().is_relative_to(root)` checks are valuable defense, but they are not equivalent to an OS boundary against a hostile child process.

### Backend attestation

The controller should return which requested restrictions were enforced, which backend primitive implemented them, and any unsupported dimensions. Refuse plans with required unsupported dimensions.

```text
requested capability set
       ├── enforced set
       ├── unsupported required set  → deny
       └── unsupported optional set  → explicit degraded status
```

### Failure modes {#failure-modes}

| Failure | Consequence | Control |
| --- | --- | --- |
| Simulation labeled as sandbox | false security claim | backend identity in UI and Trace |
| Backend unavailable, run anyway | unrestricted effect | fail closed |
| Parent restricted, child free | trivial escape | descendant inheritance tests |
| Hostname-only allowlist | DNS/redirect ambiguity | explicit resolution and redirect policy |
| Writable workspace too broad | source or config tampering | exact mounts/paths and read-only defaults |
| Credentials inherited | network boundary bypass or secret leak | minimal environment/descriptors |
| No resource limits | denial of service | CPU, memory, process, output, and time bounds |

### Safety and reliability {#safety}

Sandboxing untrusted commands protects the host, but it does not make their outputs trustworthy. Normalize and label stdout, generated files, and network responses before returning them to the model. A sandbox contains effects; it does not validate claims.

Network access deserves a separate event because destinations are meaningful to reviewers and can change during redirects or proxying. Record requested and effective destinations without leaking credentials or sensitive query strings.

Isolation is also a reliability tool. Deterministic fixtures, bounded resources, and clean environments reduce test flakiness and improve reproducibility. But a reproducible simulated backend and a secure production backend are different achievements.

## L3 · Architecture and Agent comparison {#comparison}

The `os-sandbox` node currently has no direct Agent implementation that clears the Atlas `Snapshot + Claim` threshold. Some reviewed execution-policy Claims discuss how adjacent products separate permissions and sandboxing, but the project intentionally does not copy those Claims into this mechanism without a direct mapping.

### Required snapshot evidence

For each Agent, research should pin:

1. sandbox backend and supported platforms;
2. default mode and fallback when unavailable;
3. filesystem read/write/mount semantics;
4. process and child-process confinement;
5. network and DNS/redirect behavior;
6. environment, credential, device, and IPC exposure;
7. user-configurable profiles and bypass paths;
8. emitted events or diagnostics;
9. independently reproduced escape and denial fixtures.

Official documentation can establish intended behavior. Source maps can establish implementation paths. A Native controlled experiment can establish behavior for one pinned environment. None alone proves universal containment.

### Compare guarantees, not labels

Two Agents may both say “sandboxed” while one uses host kernel restrictions and the other launches a remote disposable environment. A third may explicitly require the operator to supply a container. Those are architectural choices, not a single feature checkbox.

## L4 · Research and measurement {#research}

Sandbox experiments should test denied effects directly in a disposable environment. They require careful authorization and must not target the user's real workspace, credentials, or network.

### Proposed backend conformance suite

For each pinned platform/backend, attempt controlled fixtures for:

- reading an allowed file and a neighboring denied file;
- writing an allowed temporary path and a denied path;
- following a symlink across the boundary;
- spawning a child that repeats each attempt;
- opening an allowed endpoint and a denied endpoint;
- following a redirect from allowed to denied;
- reading a deliberately planted dummy credential;
- exceeding process, output, memory, and time limits;
- running when the backend primitive is unavailable.

Every fixture uses synthetic data and reserved destinations. Record profile, backend version, platform, canonical request, enforced capabilities, exit status, observed effects, and cleanup status. A denial message alone is insufficient; inspect the target state.

### Exercise and acceptance {#exercise}

```bash
python3 -m curriculum.lessons.s11_sandbox_network.demo
python3 -m curriculum.golden verify s11-sandbox-network
python3 -m unittest curriculum.tests.test_course_contract
```

1. request `other.example.invalid:443` and assert the plan is denied;
2. remove one required backend capability and prove execution never occurs;
3. add a second exact endpoint and inspect normalized ordering;
4. assert every simulated result carries the simulation label;
5. design—but do not run—a real backend conformance fixture with cleanup and authorization gates.

The mechanism is understood when you can distinguish desired policy, generated profile, active backend enforcement, effective child capabilities, and evidence of the observed effect.

### Research checkpoint

> “No error occurred” is not sandbox evidence. A useful result shows which forbidden effect was attempted and verifies that target state did not change.

No formal OS-sandbox experiment is registered. The current lesson intentionally performs zero real network or sandbox effects.
