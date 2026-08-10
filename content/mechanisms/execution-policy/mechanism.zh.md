# 执行策略与权限

模型提出 tool call 之后，Harness 必须判断这个准确动作能否运行。Execution policy 把动作分类为允许、需要新决定、拒绝；把任何 approval 绑定到精确请求；再把获准工作交给独立 enforcement boundary。

这就是 v0.2 路线图中的 Permissions 机制。`s10-approval-policy` 实现语义决定层，`s11-sandbox-network` 则展示为什么语义 permission 与操作系统 enforcement 必须分离。

## L0 · 定义与边界 {#definition}

Execution policy 回答：**在当前 identity、scope 与 state 下，这个准确副作用是否被允许？** 它不证明进程在技术上无法越界，后一个保证属于 sandbox 与 network enforcement。

> Approval 表达 authority；sandbox 限制 capability。可靠 Agent 必须区分两者，即使某个部署有意只提供其中一个。

```text
模型提出工具动作
       │
       ▼
schema validation ──► canonical action fingerprint
       │
       ▼
policy resolution: allow / ask / deny
       │                    │
       │ ask                └──► 显式 refusal event
       ▼
新的人工/政策决定
       │
       ▼
sandboxed executor ──► normalized result
```

| 边界 | 问题 | 缺失后的风险 |
| --- | --- | --- |
| Validation | 请求格式是否明确？ | 参数歧义或注入 |
| Policy | 这类副作用可否运行？ | 一切默认可执行 |
| Approval | 授权者是否接受这一准确动作？ | 同意被扩展到其他动作 |
| Enforcement | 进程能否超出包络？ | 绕过策略后触达 host |
| Audit | 提议、决定、执行了什么？ | 事故无法重建 |

### Decision outcome 不是 UI 状态

`allow`、`ask`、`deny` 必须是 interactive、headless、replay 环境都能处理的 runtime state。确认对话框只是 `ask` 的一种 frontend，不是 policy engine 本身。

### 精确性是核心不变量

批准后执行的 action 必须就是展示并计算 fingerprint 的 action。Tool name、规范化 arguments、workspace identity、相关 environment、policy version 都可能属于绑定内容。

> “批准一次写入”太宽泛；“一次性批准这个 canonical write”才是可审核陈述。

## L1 · 可运行参考 {#reference}

运行 approval 课程并验证 Golden Trace：

```bash
python3 -m curriculum.lessons.s10_approval_policy.demo
python3 -m curriculum.golden verify s10-approval-policy
```

Policy 有三条显式规则：workspace read 允许；write 需要新决定；command execution 拒绝。没有匹配的动作 fail closed，因为不存在 permissive default。

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

Approver 只接受一份准确 argument object。Gate 会 deep-copy 参数、计算 canonical SHA-256 fingerprint、询问，并在执行前检查内容没有变化。

```python
def approve_exact_write(request, rule):
    return request.arguments == {
        "path": "approved.txt",
        "content": "bounded change\n",
    }
```

### Runtime 顺序决定安全性

`AgentRunner` 先发出 proposed tool call，完成 validation，再请求 approval、记录 decision，最后才调用 handler。One-shot grant 随后被消费；review 与 execution 之间发生 mutation 时，旧决定不会被继承。

关键 Trace 关系是：

```text
tool.call
  └── approval.request (fingerprint + rule + exact arguments)
        └── approval.decision (allowed/denied + reason)
              └── tool.result or tool.error
```

### 课程证明什么

它证明这些规则的确定性 precedence、一条准确 write 的 fresh approval、deny 作为一等结果，以及连接 proposal 和 decision 的 Trace。它不创建 OS sandbox，不认证远端 approver，也不把临时目录冒充生产安全边界。

```bash
python3 -m unittest curriculum.tests.test_vertical_slice
python3 -m curriculum.golden verify s10-approval-policy
```

## L2 · 工程化 permission {#engineering}

生产 policy 需要 canonical request、确定性 precedence、显式 default、经过认证的 decision maker、revocation，以及 cancellation/concurrency 兼容性。

### Policy matching 前先 canonicalize

相对路径应基于可信 workspace 解析，host/port 需要规范化，tool alias 要展开，未知字段要拒绝，同时保留可审核 display form。Approval 之后不能再 canonicalize 成更宽动作。

```python
action = ActionRequest.from_validated_call(
    tool_name=call.name,
    arguments=deepcopy(validated_arguments),
    workspace=trusted_workspace_identity,
)
decision = policy.resolve(action)
```

Canonicalization 本身不能产生副作用。若路径 resolver 在 review 时跟随攻击者控制的链接，它可能变成原本只应描述的动作。

### 让 precedence 可解释

规则冲突不可避免。Engine 可以采用显式 priority、specificity 与 deny-overrides，只要返回 winning rule ID 和 reason。隐藏在配置文件顺序里的 precedence 很难审计。

### Scope 与 lifetime

Approval scope 可以是一条 call、稳定 action fingerprint、单 turn capability、workspace session，或限时 grant。越宽 scope 需要越强 disclosure 与 revoke 能力。Cached approval 绝不能跨 workspace identity，也不能静默穿过 policy 变更。

### Headless 执行

当 `ask` 无法联系认证 approver 时，安全结果是 deny 或 pause，不能重解释为 allow。Automation 应用窄 capability 的预声明 policy，而不是自动接受所有询问的 flag。

### 失败模式 {#failure-modes}

| 失败 | 后果 | 控制手段 |
| --- | --- | --- |
| 只按 tool name 批准 | consent 后参数变化 | canonical action fingerprint |
| unmatched 默认允许 | 新工具绕过 review | 显式 default deny |
| 全局缓存 approval | authority 跨项目泄漏 | identity/policy-bound scope |
| 对话框少展示内容 | 用户无法知情决定 | 精确、有界 display |
| 隐藏规则冲突 | 结果不可解释 | winning rule + precedence trace |
| Headless `ask` 变 allow | 无人值守 escalation | fail closed 或窄预授权 |
| 把 policy 当 sandbox | bypass 直接到 OS | 独立 enforcement layer |

### 安全与可靠性 {#safety}

Policy input 是安全敏感状态。展示前复制 tool argument；包含相关路径、destination、command form 与预期副作用；state 变化后拒绝 stale decision。跨进程做决定时，应认证 approver identity 与 channel。

不能让模型 prose 创建 grant。只有 policy engine 能消费类型化 decision record。Tool result 即使写着“permission granted”，仍是不可信输出，除非认证 approval channel 产生相应决定。

Retry 需要特别处理。重复 read 可能无害，重复 write 或类似支付的 effect 会产生双重动作。Approval consumption 与 idempotency policy 应绑定 attempt；参数实质变化后必须重新请求。

## L3 · 架构与 Agent 对照 {#comparison}

Atlas 已有 Codex、Pi、Reasonix 与 Claude Code 固定 snapshot 的 reviewed evidence，但各条证据支持的事实不同，准确措辞与源码定位以下方 ledger 为准。

- 固定 Codex 源码把 approval resolution 与 sandbox transformation 分开，并表达多种 policy outcome；
- 固定 Pi 文档/源码确认一个负边界：它不提供进程内 permission system 或 built-in sandbox，隔离需外部提供；
- 固定 Reasonix 源码区分 approval posture 与 OS shell confinement，并记录 enforced confinement 不可用时 fail closed；
- Claude Code 捕获的官方文档区分 permission rule 与 OS-level Bash filesystem/network enforcement，并描述 defense in depth。

这不是四条“功能等价”结论。其中一条主要证明能力缺省边界，一条是 official-doc 而非 source map；所有陈述都绑定 snapshot。

### 可比维度

比较 policy vocabulary、default outcome、rule precedence、approval scope、headless behavior、action fingerprinting、sandbox handoff、用户可见解释与 emitted event。同时要记录证据看不到什么：CLI surface 可能隐藏 server-side policy，源码也不证明具体 deployment configuration。

### 避免 capability 打分

弹窗更多不必然更安全，弹窗更少也不必然更自主。应评价规则是否匹配真实 effect、enforcement 是否支撑承诺、decision 是否可理解，以及 Trace 能否重建动作。

## L4 · 研究与测量 {#research}

Permission 实验应先用 adversarial request mutation 和确定性预期结果，再引入模型。模型可以提出 call，但被测试 policy 必须独立可观察。

### 建议的 policy matrix

准备只相差一个字段的 call：

- 相同 write path 与相同 content；
- approval 后同路径但 content 改变；
- 拼写不同但 canonicalize 后相同的路径；
- 逃出 trusted workspace 的路径；
- 藏在 tool alias 后的 denied command；
- policy revision 后的旧 allowed action；
- headless run 中的 `ask`；
- 重放已消费的 one-shot decision。

记录 proposed/canonical action、fingerprint、matched rule、decision maker、state revision、sandbox plan ID、execution outcome，以及是否发生任何 effect。主要指标是 unauthorized-effect count，必须为零；prompt 数只是次要指标。

### 练习与验收 {#exercise}

```bash
python3 -m curriculum.lessons.s10_approval_policy.demo
python3 -m curriculum.golden verify s10-approval-policy
python3 -m unittest curriculum.tests.test_course_contract
```

1. approver 返回后修改 `content`，断言请求被拒；
2. 提交 `run_command`，确认 deny 后没有 handler event；
3. 添加 unmatched tool，证明 default deny；
4. 尝试复用成功 write 的 decision；
5. 把 policy revision 加入 fingerprint，使旧 decision 失效。

当 proposal、canonical action、decision、authority、enforcement plan 与 observed effect 构成一条可追溯链时，才算理解本机制。

### 研究检查点

> 永远分开问两个问题：“这个动作是否获授权？”以及“进程能否超出获授权的包络？”

当前还没有注册正式 permission experiment。Reference exercise 只验证语义 policy；OS enforcement 由独立 sandbox 机制覆盖。
