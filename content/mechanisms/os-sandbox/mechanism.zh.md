# 操作系统沙箱

语义 policy 可以决定某个命令只能读取一个 workspace、联系一个 endpoint。操作系统 sandbox 是更低的一层，使 child process、其后代及它们可触达的资源难以或无法超出这个包络。

`s11-sandbox-network` 在不冒充真实隔离的前提下教授契约：它使用 `SimulatedSandboxBackend`，不发起任何真实网络请求，并把每个结果明确标记为 simulation。评估真实 backend 应从这种诚实边界开始。

## L0 · 定义与边界 {#definition}

OS sandbox 把 capability request 转换成受约束的执行环境。它可以限制 filesystem、process creation、network destination、environment variable、device、IPC、system call、resource consumption 与 inherited handle——准确范围取决于平台和 backend。

> Policy 写着“network denied”只是意图；经过验证的 kernel 或 virtualization boundary 才是 enforcement。

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

| 层 | 示例职责 | 单独无法证明什么 |
| --- | --- | --- |
| Tool schema | command 字段合法 | 动作已获授权 |
| Approval policy | 用户接受准确动作 | 进程无法逃逸 |
| Sandbox profile | 声明期望 capability | backend 确实执行 |
| OS/backend | 技术上限制 capability | 用户希望这个动作 |
| Trace | 记录 plan 与 outcome | 无 attestation 的隐藏 host state |

### “Sandbox”不是统一保证

Container、namespace、seatbelt profile、seccomp filter、restricted token、VM、micro-VM、remote worker、application-level path check 的 threat model 完全不同。必须注明 backend、platform、configuration 与已知缺口；一个笼统的 `sandbox: true` 不是充分证据。

### Fail-closed 规则

如果 policy 要求的 restriction 无法由所选 backend enforce，controller 必须拒绝执行或路由到其他 backend。先无约束运行、之后补一条 warning，违反契约。

> 不支持的 enforcement 是一个 decision outcome，不是静默削弱 profile 的理由。

## L1 · 可运行参考 {#reference}

运行确定性课程并验证 Golden Trace：

```bash
python3 -m curriculum.lessons.s11_sandbox_network.demo
python3 -m curriculum.golden verify s11-sandbox-network
```

Profile 允许一个合成 command 与唯一 endpoint `packages.example.invalid:443`。`.invalid` 顶级域和 simulated backend 确保课程不发出真实网络请求。

```python
SandboxProfile(
    id="dependency-readonly",
    allowed_commands=("fetch-package-metadata",),
    network_allowlist=(
        NetworkEndpoint.parse("packages.example.invalid:443"),
    ),
)
```

Handler 把已验证 arguments 转成类型化 `CapabilityRequest`，请 controller 生成 plan，记录 `sandbox.configure` 与 `network.decision`，最后通过获准 plan 执行一个模拟 payload。

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

### Simulation 为什么有用

它让边界逻辑在任意开发机上可测试：准确 endpoint parsing、capability matching、backend 缺 capability 时拒绝、plan immutability 与 Trace shape；也避免教程命令联系第三方。

Simulation 必须保持可见。Trace payload 写明 `backend: simulated-no-effects`；返回数据来自课程本身，不是 endpoint 响应。

### 把 Trace 读成两个决定

`approval.decision` 表示语义 tool capability 获准；`sandbox.configure` 表示选择哪个 enforcement profile 与 backend；`network.decision` 表示 plan 接受哪些规范化 destination。三者全部完成后才出现 `tool.result`。

```text
approval.decision
  └── sandbox.configure
        └── network.decision
              └── tool.result (simulated)
```

### 验证教学边界

```bash
python3 -m unittest curriculum.tests.test_vertical_slice
python3 -m curriculum.golden verify s11-sandbox-network
```

测试应同时断言 allowed 与 rejected plan，但绝不能把 simulation 表述成 kernel-enforced reproduction。

## L2 · 工程化隔离 {#engineering}

生产 sandbox 设计从 threat model 与 backend capability matrix 开始，不能假定同一 profile 跨操作系统可移植。

### 用正向方式描述 capability

优先最小 allowlist，而不是无限 denylist：

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

Endpoint 匹配前要规范化。DNS name、resolved address、redirect、proxy、Unix socket、IPv6 表达和 port range 都会改变“一个 destination”的含义。Policy 要明确绑定 name、address、certificate identity，还是它们的组合，并记录结果。

### Child process 与 inherited authority

限制必须跟随后代。获准 shell 如果可以启动 unrestricted child，profile 就形同虚设。需要审查 inherited file descriptor、socket、credential、environment variable、working-directory handle 与 agent-control channel。Parent 已经交付 descriptor 时，process 无需重新 open 也能访问资源。

### Filesystem 语义

Path allowlist 需要 canonical workspace identity、symlink policy、mount behavior、case sensitivity、special file、temporary directory 与 rename semantics。Application-level `resolve().is_relative_to(root)` 是有价值的 defense，但对 hostile child process 而言不等价于 OS boundary。

### Backend attestation

Controller 应返回哪些 restriction 被 enforce、由哪个 backend primitive 实现、哪些维度不支持。包含 required unsupported dimension 的 plan 必须拒绝。

```text
requested capability set
       ├── enforced set
       ├── unsupported required set  → deny
       └── unsupported optional set  → explicit degraded status
```

### 失败模式 {#failure-modes}

| 失败 | 后果 | 控制手段 |
| --- | --- | --- |
| Simulation 标成 sandbox | 虚假安全结论 | UI/Trace 展示 backend identity |
| Backend 不可用仍运行 | 无限制副作用 | fail closed |
| Parent 受限、child 自由 | 轻易逃逸 | descendant inheritance test |
| 仅 hostname allowlist | DNS/redirect 歧义 | 显式 resolution/redirect policy |
| Workspace 可写范围过大 | source/config 被篡改 | 精确 mount/path，默认 read-only |
| Credential 继承 | 绕过网络边界或泄密 | 最小 environment/descriptor |
| 无资源限制 | denial of service | CPU、memory、process、output、time bound |

### 安全与可靠性 {#safety}

Sandboxing untrusted command 能保护 host，但不能让它的输出自动可信。Stdout、生成文件与网络响应返回模型前仍要 normalize 并标记来源。Sandbox 限制 effect，不验证 claim。

Network access 应有独立 event，因为 destination 对 reviewer 有意义，并且可能在 redirect/proxy 时改变。记录 requested/effective destination，同时避免泄露 credential 或敏感 query string。

隔离也是可靠性工具。确定性 fixture、有界资源与干净环境能减少测试 flakiness、提升 reproduction；但“可复现 simulated backend”与“安全 production backend”是两种成就。

## L3 · 架构与 Agent 对照 {#comparison}

当前 `os-sandbox` 节点没有直接 Agent 实现通过 Atlas 的 `Snapshot + Claim` 门槛。一些已审核 execution-policy Claim 会谈到邻接产品如何区分 permission 和 sandbox，但项目不会在缺少直接映射时把这些 Claim 复制进本机制。

### Snapshot 所需证据

每个 Agent 至少需要固定并研究：

1. sandbox backend 与支持平台；
2. default mode 与 unavailable fallback；
3. filesystem read/write/mount semantics；
4. process 与 child-process confinement；
5. network 与 DNS/redirect behavior；
6. environment、credential、device、IPC exposure；
7. 用户可配置 profile 与 bypass path；
8. emitted event 或 diagnostic；
9. 独立复现的 escape/denial fixture。

Official documentation 能建立设计意图，source map 能定位实现，Native controlled experiment 能证明一个固定环境下的行为；任何单项都不能证明普遍 containment。

### 比较保证，不比较标签

两个 Agent 都写“sandboxed”，其中一个可能用 host kernel restriction，另一个用远端 disposable environment；第三个可能明确要求 operator 自己提供 container。这些是架构选择，不是同一个 feature checkbox。

## L4 · 研究与测量 {#research}

Sandbox 实验应在 disposable environment 中直接测试 denied effect。它们需要谨慎授权，绝不能把用户真实 workspace、credential 或 network 当靶场。

### 建议的 backend conformance suite

对每个固定 platform/backend，使用 Controlled fixture 尝试：

- 读取 allowed file 与相邻 denied file；
- 写 allowed temp path 与 denied path；
- 通过 symlink 跨越边界；
- 启动 child 重复每项尝试；
- 打开 allowed endpoint 与 denied endpoint；
- 从 allowed endpoint redirect 到 denied endpoint；
- 读取故意植入的 dummy credential；
- 超过 process、output、memory 与 time limit；
- backend primitive 不可用时运行。

所有 fixture 使用合成数据和 reserved destination。记录 profile、backend version、platform、canonical request、enforced capability、exit status、observed effect 与 cleanup status。只看到 denial message 不够，还要检查目标 state。

### 练习与验收 {#exercise}

```bash
python3 -m curriculum.lessons.s11_sandbox_network.demo
python3 -m curriculum.golden verify s11-sandbox-network
python3 -m unittest curriculum.tests.test_course_contract
```

1. 请求 `other.example.invalid:443`，断言 plan denied；
2. 移除一个 required backend capability，证明 execution 从未发生；
3. 添加第二个 exact endpoint，检查规范化顺序；
4. 断言每个模拟结果都带 simulation label；
5. 设计但不要运行一个含 cleanup 和 authorization gate 的真实 backend fixture。

当你能区分 desired policy、generated profile、active backend enforcement、effective child capability 与 observed-effect evidence 时，才算理解本机制。

### 研究检查点

> “没有报错”不是 sandbox 证据；有用结果应展示尝试了哪个 forbidden effect，并验证目标 state 没有变化。

当前没有正式 OS-sandbox experiment。现有课程有意产生零个真实网络或 sandbox effect。
