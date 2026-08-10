# s10 · Approval Policy 与精确授权

> 模型可以提出动作，但只有 Harness 能授权副作用。Approval 是针对一个具体请求的类型化决策，不是一句“看起来可以”，更不是把控制权永久交出去。

## 你将构建什么 {#learn}

s09 让 memory 与 skill 影响下一轮模型输入，但这种影响必须止步于动作边界。skill 可以建议运行命令，检索内容可以建议修改文件，模型也可以生成完全符合 Schema 的 tool call；这些事实都不等于“允许执行”。

本章在 `tool.request` 与 `ToolRegistry.execute` 之间插入 `ApprovalGate`。它会：

- 把工具名和参数规范化为 `ActionRequest`；
- 按稳定顺序选择第一条匹配的 `ApprovalRule`；
- 得到 `allow`、`ask` 或 `deny` 策略姿态；
- 把新鲜授权绑定到精确请求 fingerprint；
- 在 `ask` 却没有 approver 时 fail closed；
- 在任何副作用之前发出 `approval.request` 与 `approval.decision`。

完成后，你应该能够：

- 区分 Schema 校验、能力暴露、策略求值、人工授权和真实执行；
- 设计可审查的规则顺序与安全默认值；
- 解释授权为何必须绑定参数、目标、作用域和时间；
- 防止 approval cache 把旧决定偷换成另一个动作的许可；
- 设计 headless 自动化，而不是把“无人可问”解释成“全部允许”；
- 从 Trace 证明工具只在获得授权后运行。

### 先修知识

你应理解 s03 的 tool roundtrip、s04 的工作区副作用、s07 的事件顺序和 s09 的按需 skill。模型仍为 Scripted Model，不需要 API Key。

---

## 问题：合法的 Tool Call 仍然只是请求 {#problem}

JSON Schema 能回答“`path` 是否为字符串”，却不能回答“现在是否应该写这个路径”。Tool Registry 能回答“哪个实现负责 `write_file`”，却不能决定当前用户是否授予了本次写入权限。

混淆这些层，会产生以下典型错误：

| 错误捷径 | 它真正证明了什么 | 尚未回答什么 |
| --- | --- | --- |
| 工具对模型可见 | 模型可以请求它 | 本次调用是否允许 |
| 参数通过 Schema | 形状与基础类型合法 | 目标归属、敏感性、意图与影响范围 |
| 用户说“修好测试” | 用户表达了目标 | 是否允许任意删除、联网或发布 |
| Skill 声明 `run_command` | 工作流期望某能力 | 安装包和当前任务能否使用它 |
| 类似调用以前通过 | 曾经存在一次决定 | 参数、workspace、session、policy 是否已变化 |
| 动作可回滚 | 可能存在恢复手段 | 动作本身是否应该发生 |

不安全循环通常长这样：

```text
模型提出 tool call
      │
      ├── Schema 合法？是
      ▼
立即执行
```

中间缺失的问题就是 authorization。

> Permission 描述某个 principal 可以做什么；Approval 记录对一次请求的决定；两者都不等于 Sandbox 强制执行。

### 为什么弹一个确认框还不够

确认框可能展示简化摘要，却执行变化后的参数；“永远允许 Shell”可能覆盖几百种完全不同的命令；只按工具名缓存授权，会让 `write_file("notes.md")` 间接批准 `write_file("release.sh")`。

绑定必须覆盖动作身份。本章对包含 `tool` 与 `arguments` 的 canonical JSON 做 SHA-256。生产系统还应绑定 workspace identity、解析后的资源、可执行文件 digest、环境类别、网络目的地、用户与 session、过期时间和策略版本。

---

## 心智模型：提案、策略、新鲜决定、副作用 {#mental-model}

把职责拆成独立流水线：

```text
model proposal
    │
    ▼
tool.request ──> Schema validation
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

每次转换都可观察。模型不能伪造策略结果，因为事件由 Harness 发出；工具实现也不能自己批准自己，因为 Gate 在 dispatch 之前运行。

### 三种策略效果

- `allow`：策略可以直接批准这一类动作，应保持狭窄且可审查。
- `ask`：策略要求外部主体对这一个精确请求做新决定。
- `deny`：动作不得运行，即使低优先级组件想允许也不行。

本章按顺序选择第一条规则，并默认 deny。生产系统可能同时有管理员、组织、用户、workspace、session 与工具规则；无论层次多复杂，都必须明确 deny 优先级和冲突语义。

### 决策与强制执行并不相同

Approval 是语义决定：“允许这次精确写入”。它不能阻止有 Bug 的 `write_file` 逃逸工作区。s11 会增加 OS enforcement contract；真正的 defense in depth 需要两层同时存在。

---

## 逐步构建 Approval Gate {#build}

### 第一步：表示精确提案

`ActionRequest` 保存工具名与复制后的参数：

```python
@dataclass(frozen=True)
class ActionRequest:
    tool: str
    arguments: JsonObject
```

复制很重要。策略不能审查一个随后会被别的组件修改的可变对象。

### 第二步：计算 canonical fingerprint

字典迭代顺序或空格不能改变身份。先按 key 排序、紧凑序列化，再哈希：

```python
wire = json.dumps(
    {"tool": self.tool, "arguments": self.arguments},
    ensure_ascii=False,
    sort_keys=True,
    separators=(",", ":"),
)
fingerprint = hashlib.sha256(wire.encode("utf-8")).hexdigest()
```

它是身份绑定，不是保密措施。参数在别处被哈希，不代表可以把原始 secret 放进公开 Trace；仍然需要独立脱敏策略。

### 第三步：把规则写成数据

每条规则都有稳定 ID、精确工具集合、effect 与解释：

```python
ApprovalRule(
    id="ask-before-write",
    tool_names=("write_file",),
    effect="ask",
    reason="A fresh decision is required for each exact write.",
)
```

稳定 Rule ID 让 Trace、测试、策略审查和事故报告指向同一个来源。仅有 UI 文案是不够的。

### 第四步：让匹配顺序确定

`ApprovalPolicy.evaluate()` 选择第一条匹配规则；没有匹配时合成 `default-deny`：

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

生产 matcher 可以查看解析后的 path、操作类别、目的地、Git 状态或 command AST。直接匹配 Shell 字符串非常脆弱；本章故意只实现精确工具边界。

### 第五步：分开 request 与 resolve

Gate 暴露两个阶段：

```python
pending = gate.request(call.name, call.arguments)
decision = gate.resolve(pending)
```

这样 Harness 可以先发 `approval.request`，再调用 UI、策略服务或 headless decision provider。

### 第六步：没有 Approver 时 Fail Closed

对于 `ask`，缺席就是拒绝：

```python
if self.approver is None:
    return ApprovalDecision(
        outcome="deny",
        source="fail-closed",
        grant_scope="none",
        ...,
    )
```

Headless 自动化应使用明确的非交互策略 profile，而不是把“问不了”重新解释成“已同意”。

### 第七步：把 Grant 绑定到一次请求

脚本化 approver 只接受下面的参数对象：

```python
return request.arguments == {
    "path": "approved.txt",
    "content": "bounded change\n",
}
```

最终 decision 记录 `grant_scope="once"`。只要内容变化，就会得到另一个 fingerprint 与另一次决定。Demo 故意不实现永久缓存。

### 第八步：记录成对决策事件

`approval.request` 记录 tool、call ID、fingerprint、rule 与 policy effect；`approval.decision` 再加入 outcome、source、reason 和 grant scope。两者都不包含隐藏推理。

```python
self._emit("approval.request", payload={...})
decision = self.approval_gate.resolve(pending)
self._emit("approval.decision", payload={...})
```

两个事件中的 fingerprint 必须相同。这个不变量能阻止 UI 批准 A、Runtime 却执行 B。

### 第九步：在 Dispatch 前拒绝

如果 decision 为 deny，Runtime 会追加 `error_type="ApprovalDenied"` 的结构化 tool result，并继续循环，但绝不调用 `ToolRegistry.execute`。

```python
if not decision.allowed:
    payload = {
        "ok": False,
        "error_type": "ApprovalDenied",
        "error": decision.reason,
    }
```

把拒绝返回给模型，有利于解释或选择更安全的替代方案；模型不应反复施压，也不能偷偷改写请求后复用旧授权。

### 第十步：只有 Allow 之后才执行

通过 Gate 后仍走原有 Registry 路径。Authorization 是副作用外层的边界，不是另一份工具实现。

---

## 运行并检查授权 Trace {#run}

运行：

```bash
python3 -m curriculum.lessons.s10_approval_policy.demo
```

11 个事件的 Golden Trace 中心顺序是：

```text
tool.request write_file
approval.request  effect=ask  fingerprint=409c…
approval.decision outcome=allow source=approver scope=once
tool.result write_file ok=true
```

校验提交的 Trace：

```bash
python3 -m curriculum.golden verify s10-approval-policy
```

### 检查精确绑定

两个 approval 事件都带相同的 64 位 fingerprint；其后的副作用只写 `approved.txt`，长度为 15。任何 decision 都没有出现在副作用之后。

### 检查消息历史

第二次 model request 收到普通 tool result。Approval metadata 留在 Trace 中，而不是伪装成可由模型改写的权威消息。产品可以把决定告知模型，但权威 policy state 应保持在模型文本之外。

### 无需触碰文件即可测试拒绝

创建 `default_effect="ask"` 且没有 approver 的 Gate。任何请求都会得到 `source="fail-closed"`、`outcome="deny"`、`grant_scope="none"`。

---

## 失败模式与安全边界 {#failure-modes}

| 失败 | 后果 | 更安全的合同 |
| --- | --- | --- |
| 默认 Allow | 新工具未审查便开始执行 | 默认 Deny、显式上线 |
| 只按工具名匹配 | 一次授权覆盖无关目标 | 绑定 canonical arguments 与 resolved resources |
| “永远允许 Shell” | 任意命令语言绕过原始意图 | 能力型 profile 与狭窄 scope |
| 执行后才请求授权 | 用户决定沦为装饰 | Dispatch 与 child process 之前 Gate |
| 参数可变 | 批准请求与执行请求不同 | 冻结/复制参数并核对 fingerprint |
| 无人审批就允许 | Headless job 静默升级 | Fail closed 或显式 automation policy |
| 永久授权缓存 | 旧意图跨上下文与策略存活 | 按 action/workspace/session/time 设 scope 与撤销 |
| 低层 Allow 覆盖 Deny | 管理策略变成建议 | 定义更强 Deny 获胜的 precedence |
| Approval UI 泄露 Secret | 屏幕或 Trace 暴露凭证 | 结构化脱敏摘要与受保护详情 |
| 反复 Ask | 模型持续施压直至用户同意 | 限频、保留 deny、要求实质变更 |

> Approval 减少的是“用户意图是否允许”的歧义。它不能修复危险实现、阻止内核级逃逸，也不能撤销外部副作用。

### Confused Deputy

Harness 往往拥有模型没有的凭证与文件权限。不可信文档或 dependency 可以诱导工具借用这些权力。Policy 需要识别请求主体、authority 来源、目标与 credential scope，而不只是函数名。

### TOCTOU

批准后，symlink、repository 切换、mount 或并发修改可能让 path 指向不同资源。生产授权要么绑定不可变的 resolved target，要么在副作用前立即重新校验。

---

## 练习与验收条件 {#exercises}

### A. 拒绝未列出的工具

请求 `replace_text`，但不增加规则。验收：`approval.decision` 使用 `default-deny`，文件不变化，`tool.result.error_type` 为 `ApprovalDenied`。

### B. 拒绝变化后的内容

只修改 proposed content。验收：fingerprint 改变，脚本化 approver 拒绝新请求。

### C. 增加 Session-scoped Cache

设计包含 request fingerprint、workspace fingerprint、policy revision、user identity 与 expiry 的 cache key。验收：任一字段变化都 miss，deny 永不被静默升级为 grant。

### D. 测试 Rule Precedence

增加一条 broad allow 与一条 narrow deny，明确并测试 precedence。验收：结果确定，策略审查者能解释哪条规则获胜。

### E. 对敏感参数脱敏

增加带 secret-like 参数的工具。验收：可信进程内策略使用真实值求值；公开 Trace 与 UI 摘要一致脱敏。

### F. 建模非交互执行

创建只允许 fixture 内 `read_file` 的 headless profile。验收：`ask` 仍然 deny，write 仍然 deny，代码不导入交互式兜底。

运行聚焦合同：

```bash
python3 -m unittest \
  curriculum.tests.test_vertical_slice.VerticalSliceTests.test_s10_binds_approval_to_the_exact_action -v
```

---

## 深入：生产级 Approval Architecture {#deep-dive}

### Policy Input

真实决定可能依赖工具身份、规范化参数、resolved path、操作类型、workspace trust、Git 状态、network endpoint、executable identity、environment、用户角色、组织策略、历史决定和是否交互。需要记录足够输入以复现决定，但不能把 secret 放进公开 telemetry。

### Capability Design 优于 Command String Parsing

`run_command(["git", "status"])` 与 `run_command(["curl", ...])` 使用同一个工具，却代表完全不同的 power。更小的类型化能力——读取仓库状态、访问一个批准 URL、运行一个测试 target——更易授权与 sandbox。通用 Shell 仍有价值，但需要更强解析、隔离和审查。

### Approval UX 本身也是安全面

用户需要看到精确目标、操作、原因、数据流、网络目的地、涉及凭证与 grant scope。截断命令、隐藏 redirect、误导 path 或默认选中“永远允许”都会削弱决定。Accessibility 同样重要：键盘和屏幕阅读器用户必须获得同等关键细节。

### 策略变化与撤销

长 session 可能跨越 policy update。Grant 应包含 policy revision，更强 deny 出现时立即失效，并把撤销变成可观察事件。Branch 或 resumed session 不应意外继承旧 grant。

### Hooks 与 Extensions

Extension 可以增加 pre-tool hook，但 extension-level allow 不能越过 platform 或 managed deny。Hook 能改参数、加工具或压制事件，因此自身属于 trust boundary。所有授权都应作用于经过合法 transform 后的最终 immutable request。

### Agent Evidence Boundary

关联 Claim 证明 Codex、Reasonix、Claude Code 在不同程度上把 policy/approval 与 execution/sandbox 分开；Pi 则明确把 permission 与 isolation 留在 minimal core 之外。它们不证明 rule syntax、precedence、cache 或 UI 相同，只能比较固定 snapshot 支持的 surface。

### s11 将增加什么

即使 Approval 完美，它评估的也是意图而不是 containment。下一章会把允许动作编译成 filesystem、process 与 network capability，并要求 enforcement backend 证明自己能限制这些能力。

---

## 检查点 {#checkpoint}

继续前请回答：

1. 为什么 Schema 合法不等于授权？
2. Approval fingerprint 至少应绑定哪些字段？
3. Policy 为 `ask` 但没有 approver 时应发生什么？
4. 为什么 `grant_scope="once"` 比 tool-wide cache 更安全？
5. Approval 事件相对 `tool.result` 应出现在什么位置？
6. 为什么 Approval 永远不能替代 OS Sandbox？

你已经建立 fail-closed 的语义决策边界。s11 会保留它，并增加 containment：即使动作获批，也只能获得 sandbox profile 明确授予的 filesystem、process 与 network 权力。
