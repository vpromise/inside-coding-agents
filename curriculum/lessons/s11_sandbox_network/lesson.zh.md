# s11 · OS Sandbox 与 Network Boundary

> Approval 决定一个动作是否应该发生；Sandbox 限制执行代码实际上能做什么。可靠 Harness 两层都需要，而且绝不能把 policy simulator 写成 kernel enforcement。

## 你将构建什么 {#learn}

s10 在 dispatch 前批准了一个精确工具请求，但这仍然信任工具实现、依赖、child process 与 OS interaction。一个被允许的 package metadata 工具，仍可能有 Bug、跟随恶意 redirect、继承凭证，或启动能访问无关 host 的进程。

本章增加可移植的 enforcement contract：

- `CapabilityRequest` 描述 command、filesystem 与 network 需求；
- `SandboxProfile` 声明最小允许 envelope；
- `SandboxBackendCapabilities` 表示 execution backend 能强制哪些边界；
- `SandboxController.plan()` 在请求或 backend 超出 profile 时 fail closed；
- 精确 `NetworkEndpoint(host, port)` 替代含糊 wildcard 字符串；
- `sandbox.configure` 与 `network.decision` 暴露编译后的边界；
- `SimulatedSandboxBackend` 只证明控制流，不产生 OS 或网络副作用。

最后一点最关键：本章教的是 adapter contract。Simulator 不能证明 native process 被 kernel 隔离；生产结论需要真实 backend 与可观察 enforcement tests。

完成后，你应该能够：

- 分开 semantic permission 与 mandatory isolation；
- 把 tool request 编译为 least-privilege capabilities；
- 在 backend 无法证明所需边界时 fail closed；
- 分析 filesystem、process、environment、network 与 credential channel；
- 识别 DNS、redirect、proxy、child process 与 inherited descriptor 绕过；
- 让 Trace 明确区分 requested、allowed 与 enforced。

### 先修知识

你应理解 s04 的 workspace path boundary 和 s10 的精确 approval。本章不会真实联网，也不会调用模型服务。

---

## 问题：获批代码仍可能超出意图 {#problem}

假设 policy 允许“从 registry Y 获取 package X 的 metadata”。实现代码仍可能：

1. 从 host 读取 credential 或 SSH key；
2. 因 path Bug 写出 workspace；
3. 把 hostname 解析到意外地址；
4. 跟随 redirect 到另一个 origin；
5. 调用权限更宽的 helper process；
6. 继承 open file descriptor、proxy 变量或 cloud credential；
7. 访问 approval 中未展示的 telemetry、update、dependency endpoint。

这不是 Approval 失败，而是 containment 缺失。

| 层 | 核心问题 | 示例结果 |
| --- | --- | --- |
| Tool Schema | 请求结构合法吗？ | `host` 是字符串 |
| Approval Policy | 语义动作应尝试吗？ | 允许 metadata lookup |
| Capability Compiler | 尝试需要哪些 power？ | process + 一个目的地 |
| OS Sandbox | 进程能读、写、执行或 signal 什么？ | workspace 只读、无 device |
| Network Boundary | 哪些流量可以离开？ | 一个 exact host:port、无 redirect |
| Trace/Evidence | 请求、允许和真正强制了什么？ | profile、backend、decision、result |

> Python 内 path check 是有价值的 validation，但不是 Operating-System Sandbox；进程内 hostname allowlist 也一样。

### “放进 Container”为什么不是完整答案

Container、VM、micro-VM、namespace、seatbelt profile、seccomp、capability system 和 platform sandbox 边界不同。挂载 home、host network、Docker socket 或宽权限 credential 的 container，可能比名字看起来更不安全。

Harness 需要 capability contract 和 backend attestation，而不是一个没有定义的 `sandboxed=true`。

---

## 心智模型：把意图编译为 Enforcement Envelope {#mental-model}

s10 decision 保持不变，s11 在它下面再加一层：

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

### Requested、Allowed、Enforced 是不同事实

- **Requested** 来自工具实现声明的需求；
- **Allowed** 是 controller 与 profile 比较的结果；
- **Enforced** 需要 backend 真正成功应用 plan。

Reference Trace 展示前两者，并把 backend 标为 `simulated-no-effects`；它故意不声称 native process 已被强制隔离。

### Negative Capability 也是设计的一部分

Profile 不仅要说有什么，还要说什么没有：无 write path、无额外 host、无 device access、无继承 credential。“允许 package fetch”若没有默认 deny，其定义仍不完整。

---

## 构建 Sandbox 与 Network Contract {#build}

### 第一步：解析精确 Network Endpoint

本章只接受 `host:port`：

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

它拒绝 `/`、`*` 与 `@`，避免 URL、wildcard 或 user-info trick 冒充 host。这个 parser 很小；IPv6、国际化域名、proxy 与 DNS policy 需要更完整的生产类型。

### 第二步：声明 Backend Capability

Backend 报告三个字段：

```python
SandboxBackendCapabilities(
    filesystem_isolation=True,
    network_isolation=True,
    process_isolation=True,
)
```

生产 attestation 需要更多信息：backend/version、profile digest、OS、fallback、broker configuration 与 failure status。但明确字段已比隐含假设更安全。

### 第三步：定义 Least-Privilege Profile

Demo 只允许一个抽象 command 与一个目的地：

```python
SandboxProfile(
    id="dependency-readonly",
    allowed_commands=("fetch-package-metadata",),
    network_allowlist=(
        NetworkEndpoint.parse("packages.example.invalid:443"),
    ),
)
```

没有 filesystem write。Hostname 使用 `.invalid`，即使代码误走 native resolution 也不会访问真实服务。

### 第四步：在可信 Harness 内派生 Capability

Tool handler 把结构化参数映射为 `CapabilityRequest`：

```python
request = CapabilityRequest(
    command="fetch-package-metadata",
    network_destinations=(endpoint,),
)
```

不要让模型直接提交任意 sandbox profile。语义动作到 power 的映射归 Harness 所有。

### 第五步：Planning 前验证 Filesystem Path

当请求 path 时，Controller 要求非空 relative path 且没有 `..`：

```python
path = PurePosixPath(value)
valid = bool(value) and not path.is_absolute() and ".." not in path.parts
```

这仍是 input validation，不是 OS confinement。生产 backend 必须在自己的边界内处理 mount、link、大小写、device path 与 race。

### 第六步：精确比较 Destination

Controller 使用集合差：

```python
denied = sorted(set(request.network_destinations) - allowed_endpoints)
if denied:
    reasons.append("network destination is not allowlisted: ...")
```

Exact match 易于审查。`*.example.com` 一类 suffix rule 需要正确 label boundary，简单 `endswith` 不够。

### 第七步：要求 Backend 强制每种请求类别

请求 network 而 `network_isolation=false` 时，即使 host 已 allowlist，也必须 deny；process 与 filesystem 同理。

```python
if request.network_destinations and not capabilities.network_isolation:
    reasons.append("backend cannot attest network isolation")
```

这就是 fail-closed handoff。Profile 要求 enforcement 时，“Sandbox 不可用”不能静默变成裸执行。

### 第八步：创建 Immutable Plan

`SandboxPlan` 记录 profile ID、原始 capability request、outcome、reasons 与 required capability classes。Execute 只接受属于本 controller profile 的 plan。

### 第九步：发出 Configuration 与 Network Decision

Handler 记录：

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

Backend label 防止读者把教学 Trace 误认成 native enforcement evidence。

### 第十步：只通过 Backend 执行

`SandboxController.execute()` 会拒绝 denied plan 或其他 profile 的 plan，然后才调用 backend。Simulator 只记录 plan 并返回确定性 metadata，不创建进程、不打开 socket、不修改文件。

```python
return {
    "backend": "simulated-no-effects",
    "command": plan.request.command,
    "network": [...],
    "payload": dict(payload),
}
```

未来替换为真实 adapter，不应改变 lesson-level semantics，只应增强能为 enforcement 提供的证据。

---

## 运行并检查 Bounded Attempt {#run}

运行：

```bash
python3 -m curriculum.lessons.s11_sandbox_network.demo
```

13 事件中心顺序：

```text
tool.request fetch_package_metadata
approval.request / approval.decision allow
sandbox.configure profile=dependency-readonly backend=simulated-no-effects
network.decision destination=packages.example.invalid:443 allowed=true
tool.result backend=simulated-no-effects
```

校验：

```bash
python3 -m curriculum.golden verify s11-sandbox-network
```

### 检查 Defense in Depth

Approval decision 表示语义动作获准；另一个事件说明规划了什么 process/network envelope。少任何一个事件，Trace 都不完整。

### 攻击 Destination

为 `evil.example:443` 建 plan。结果 `allowed=False`；调用 `execute()` 抛出 `SandboxDenied`；`SimulatedSandboxBackend.calls` 数量不增加。拒绝发生在 backend boundary 之前。

### 攻击 Backend Availability

提供 `network_isolation=False` 的 backend。即使 host 在 allowlist 中也必须 deny，证明 policy 不会伪装不存在的 enforcement。

---

## 失败模式与边界绕过 {#failure-modes}

| 失败 | 后果 | 更安全的设计 |
| --- | --- | --- |
| 把 Approval 当 Sandbox | 工具 Bug 超出批准意图 | 强制 lower enforcement layer |
| 把进程内 path check 称为 OS isolation | Child process 绕过语言层 guard | Kernel/platform backend + 负向测试 |
| Sandbox unavailable fallback | 受保护动作裸执行 | Fail closed 并暴露状态 |
| 宽泛 host wildcard | Lookalike 或 delegated subdomain 获准 | Exact endpoint 或 label-aware policy |
| DNS rebinding | 批准名称解析到 forbidden address | Resolution policy、IP class、pinning |
| 自动跟随 Redirect | 数据被送往另一 origin | 每个 origin 重新授权或禁用 redirect |
| 继承 Proxy Environment | 流量通过隐藏 route | 清理 environment，显式控制 proxy |
| Child Process 逃逸 | Helper 获得更宽权力 | 全 process tree 继承 confinement |
| 继承 Open Descriptor | 进程访问预打开文件/socket | close-on-exec 与 descriptor allowlist |
| Credential 全局挂载 | 允许 host 可诱导凭证滥用 | Per-action credential broker |
| 忽略 Telemetry/Update | 工具访问未披露服务 | 默认 deny、观察所有 egress |
| Simulator 冒充 Native Proof | 读者高估安全 | Evidence label、backend identity、enforcement test |

> Network “关闭”不是一个开关。DNS、loopback、Unix socket、proxy、IPC broker、browser helper 与 parent process 都可能成为通信通道。

### Filesystem 边界细节

Read-only 也不代表无害：源码、`.env`、SSH 配置、浏览器 profile 与 cloud metadata 可能敏感。Writable temp 可能被执行或影响后续 build。Mount inventory 与 path semantics 都应进入 profile。

### Process 边界细节

Allowlisted executable 仍会读取 config、plugin、dynamic library、startup file 或 interpreter。应绑定 executable identity 并清理 environment；`argv[0]` 不能完整描述行为。

---

## 练习与验收条件 {#exercises}

### A. 拒绝未列出的 Host

使用 `evil.example:443`。验收：plan 有清晰 reason，backend 调用计数不变，没有网络 primitive 被调用。

### B. 拒绝 Wildcard Endpoint

解析 `*.example.invalid:443`。验收：policy matching 前就失败，wildcard 语义不能意外进入。

### C. 要求 Filesystem Isolation

增加 `read_paths=("vendor/manifest.json",)`。验收：plan 列出 `filesystem`；不能证明 filesystem isolation 的 backend 被拒绝。

### D. 建模 Redirect Policy

为 request 增加 `redirects="deny"` 或显式 redirect chain contract。验收：新 origin 需要新 decision，不能静默继承原 endpoint。

### E. 清理 Environment Capability

设计只包含 locale 与 isolated path 的 env allowlist。验收：proxy、cloud、package-manager 和 credential 变量默认不传入。

### F. 设计 Native Backend Evidence Test

预注册越界读取、只读写入、连接 denied endpoint 与 spawn child 尝试。验收：预期失败可观察，记录 backend/version；不得在真实 workspace 上执行。

运行聚焦测试：

```bash
python3 -m unittest \
  curriculum.tests.test_vertical_slice.VerticalSliceTests.test_s11_denies_unlisted_network_before_backend_execution -v
```

---

## 深入：从 Adapter Contract 到 OS Enforcement {#deep-dive}

### Backend-specific Translation

Portable profile 需要翻译成平台概念：mount/namespace、macOS sandbox profile、Windows token/job object、seccomp、VM share、egress proxy 或 remote execution service。翻译应确定，并产出可计算 digest 的 resolved profile 供审计。

### Attestation 与 Startup Failure

Harness 必须在用户代码运行前知道 confinement 是否真的安装。Backend 过早退出、kernel feature 缺失或 profile parse warning 都不能当成功；应记录 startup status 并在 dispatch 前失败。

### DNS 与 Destination Identity

Hostname authorization 可发生在 resolution 前、后或两处。CDN、轮换地址、private range、rebinding、SNI 各有取舍。生产 broker 可以同时强制 DNS、destination IP class、TLS hostname、port、protocol、redirect 与 byte/data limit。

### Credential Brokering

Network allowlist 不决定能发送哪些凭证。最好由 broker 只为获批 request/destination 注入 scoped token，把 long-lived secret 留在 sandbox filesystem 与 env 之外。

### Observability 与 Privacy

记录 destination identity、decision、profile、byte count 与 failure，但避免日志化 token、private URL、query 参数和 response body。公开 Trace 可能应展示脱敏 endpoint class，而不是企业 hostname。

### 测试 Containment

Unit test 只能证明 planner；integration test 必须从真实 sandbox 内攻击边界，包含 negative case 并保留失败。普通命令成功，不能证明被禁止动作确实失败。

### Agent Evidence Boundary

固定 Codex、Reasonix、Pi 与 Claude Code Claim 证明 semantic policy 与内置/外部 isolation 存在不同关系，却不证明某次未观察运行真的启用了 sandbox。本章 simulator 只是 reference behavior；Native claim 需要版本化执行证据。

### 为什么 s12 回到输入侧

Sandbox 限制请求产生后的副作用；Prompt Injection 改变的是模型会提出什么请求。下一章会把 trust 绑定到 workspace identity，并让 external/tool text 保持 data class，不能静默升级成 project policy。

---

## 检查点 {#checkpoint}

继续前请回答：

1. Approval 决定了什么，而 Sandbox 没决定什么？
2. Required backend capability 不可用时，为什么必须 deny？
3. 为什么 Python path check 不是 OS isolation？
4. Exact `host:port` 消除了什么歧义，又留下哪些风险？
5. Golden Trace 哪个字段诚实标识 simulation？
6. 你会如何测试真实 backend 的 negative boundary？

你现在同时拥有 semantic authorization 与 enforcement contract。s12 转向系统另一端：在模型提出动作前，哪些 repository/tool input 具有成为 instruction 的可信资格。
