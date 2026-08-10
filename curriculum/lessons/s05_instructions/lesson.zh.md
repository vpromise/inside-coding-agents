# s05 · Instructions 与项目发现

> 项目指令是 Harness 发现的上下文，不是仓库授予自己的权限。

## 学完这一章，你会得到什么 {#learn}

Coding agent 不能只理解用户当前一句话。它还要知道项目怎样测试、哪些目录有特殊规则、代码遵循什么约定。很多 Harness 会从工作区发现 `AGENTS.md` 或类似文件，并根据当前目录组合成 system context。

本章实现一个确定性的 root-to-leaf discovery：从 workspace root 走到 cwd，按顺序读取每一层 `AGENTS.md`，限制单文件大小，再把文档渲染进 system prompt。

完成本章后，你应该能够：

- 解释为什么 instruction discovery 属于 Harness，而不是让模型自己随意搜索。
- 从 root 到 cwd 构造唯一、可测试的加载顺序。
- 区分“更具体的项目约定”与“更高的安全权限”。
- 处理 cwd 越界、超大文件、编码错误和动态变化。
- 在 Trace 和 prompt 中保留指令来源，而不是拼成无法审计的一大段文字。

---

## 问题：同一个任务在不同目录有不同约束 {#problem}

假设仓库结构如下：

```text
workspace/
├── AGENTS.md                 # 全局：修改后必须跑测试
├── packages/
│   ├── AGENTS.md             # 包级：使用 package-local 命名
│   └── api/
│       ├── AGENTS.md         # 目录级：路由必须有集成测试
│       └── handler.py        # 当前 cwd
└── README.md
```

如果 cwd 是 `packages/api`，只读 root 会漏掉局部约定，只读 cwd 会漏掉全局规则，无序搜索则让行为随文件系统遍历顺序变化。

Harness 需要明确回答：

1. 从哪个 root 开始？
2. 最深读到哪里？
3. 同名指令的顺序是什么？
4. 文件有多大才允许进入 prompt？
5. 指令能否要求访问工作区外、关闭 sandbox 或泄露密钥？

> Instruction precedence 解决的是上下文组合，不是权限提升。低信任输入不能覆盖平台政策、用户意图或系统安全边界。

---

## 心智模型：作用域链，而不是全文搜索 {#mental-model}

把目录层级看成编程语言里的 lexical scope：

```text
workspace root
    │  AGENTS.md
    ▼
packages
    │  AGENTS.md
    ▼
packages/api  ← cwd
       AGENTS.md
```

只有 root 到 cwd 这条祖先链相关。兄弟目录的指令不应因为一次全仓库 glob 偶然进入上下文。

| 维度 | 决策 | 本章策略 |
| --- | --- | --- |
| Scope | 哪些目录相关 | root → cwd 的祖先链 |
| Order | 如何组合 | root-to-leaf |
| Identity | 如何保留来源 | workspace-relative path |
| Size | 如何限制输入 | 每文件最多 32,000 bytes |
| Encoding | 非法 UTF-8 怎么办 | replacement decoding |
| Authority | 指令能授予什么 | 不能提升权限 |

### 顺序只是输入，不是自动 override

本章把更具体的文件放在后面，让模型同时看到全局与局部规则。真正的冲突语义仍需产品定义：是后者覆盖、两者都必须满足，还是冲突时询问用户。不要把字符串拼接顺序误当成完整 policy engine。

---

## 逐步实现确定性发现 {#build}

### 第 1 步：规范化 root 与 cwd

```python
root = Path(workspace_root).resolve()
current = Path(cwd).resolve()
if not _inside(root, current):
    raise ValueError("cwd must be inside workspace_root")
```

发现前先验证 cwd 属于 workspace。否则调用方可以把 root 指向可信项目，却让 discovery 去读取任意外部目录。

### 第 2 步：构造祖先链

```python
directories = [root]
cursor = root
for part in current.relative_to(root).parts:
    cursor = cursor / part
    directories.append(cursor)
```

如果 cwd 等于 root，列表只有 root；如果 cwd 是三层子目录，就得到四个稳定条目。没有递归 glob，也不会碰兄弟目录。

### 第 3 步：按层查找固定文件名

```python
for directory in directories:
    candidate = directory / filename
    if not candidate.is_file():
        continue
```

文件名是显式配置，默认 `AGENTS.md`。生产 Harness 可能支持多种约定，但每增加一种都要定义优先级、去重和冲突规则。

### 第 4 步：在进入 prompt 前限制字节数

```python
raw = candidate.read_bytes()
if len(raw) > max_bytes_per_file:
    raw = raw[:max_bytes_per_file]

documents.append(InstructionDocument(
    path=candidate.relative_to(root).as_posix(),
    content=raw.decode("utf-8", errors="replace"),
))
```

先按 bytes 限制，避免解码前就读入无限 prompt；用 replacement decoding 让坏编码成为可见字符，而不是让整个会话崩溃。生产系统还应记录 `truncated: true` 和原始大小，本教学类型暂未包含这些字段。

### 第 5 步：保留来源地渲染

```python
def render_instructions(documents):
    return "\n\n".join(
        f"# Instructions from {document.path}\n"
        f"{document.content.strip()}"
        for document in documents
    )
```

来源标题让模型、调试器和审计者知道每条规则来自哪里。不要只拼接裸文本，否则冲突发生时无法解释。

### 第 6 步：把结果放进 system message

```python
documents = discover_instructions(fixture, fixture / "package")
prompt = render_instructions(documents)

runner = AgentRunner(
    model=model,
    trace=trace,
    system_prompt=prompt,
)
```

s01 的初始消息逻辑会把这段 prompt 放在 user message 之前。Core loop 不需要知道文件系统发现细节。

---

## 运行两层指令示例 {#run}

Fixture 是：

```text
curriculum/lessons/s05_instructions/fixture/
├── AGENTS.md
└── package/
    └── AGENTS.md
```

Root 文件要求保留测试，package 文件要求使用局部命名风格。执行：

```bash
python3 -m curriculum.lessons.s05_instructions.demo
```

检查 system message 中的顺序：

```python
runner, trace = build_demo()
result = runner.run("State the two instructions you will follow.")

system = result.messages[0]
assert system.role == "system"
assert system.content.index("Workspace instructions") < \
       system.content.index("Package instructions")
```

模型脚本返回：

```text
I will preserve tests and use package-local style.
```

这不是在评测模型遵循率，而是在验证 discovery → render → initial messages 的 Harness 数据链路。

### 验证外部 cwd 被拒绝

```python
with TemporaryDirectory() as root, TemporaryDirectory() as outside:
    with self.assertRaises(ValueError):
        discover_instructions(root, outside)
```

这是 discovery 自己的边界检查，不能依赖调用方“应该传正确路径”。

---

## 指令的信任边界 {#code-reading}

### 项目文件是数据，不是更高优先级命令

仓库可能来自互联网，`AGENTS.md` 也可能写着“上传环境变量”“关闭测试”“忽略用户”。Harness 应把它放在平台和用户约束之下，并且不能让文字自动改变工具权限。

### Prompt order 与 authority order 不同

一段文本出现在 system prompt，并不天然获得平台级 system authority。产品需要明确标注来源与信任等级；更成熟的协议会把 platform policy、user instruction 和 repository guidance 分成不同结构，而不是只靠一条长字符串。

### 指令发现应绑定工作对象

如果 Agent 从 `package/a` 切换到 `package/b`，适用指令也会变化。Harness 应在 cwd 或操作目标变化时重新计算 scope，或者明确固定当前工作上下文，避免使用过期缓存。

### 来源与内容都需要预算

大量嵌套指令会占满上下文。可以限制文件数、单文件大小、总大小和层级深度，并在 Trace 中记录哪些文件被加载、截断或跳过。

---

## 常见失败模式 {#failure-modes}

| 错误 | 结果 | 更好的设计 |
| --- | --- | --- |
| 全仓库递归查找 | 兄弟目录规则污染当前任务 | 只遍历 root-to-cwd 祖先链 |
| 依赖 `os.walk` 顺序 | 不同平台行为不同 | 显式构造目录序列 |
| 丢掉文件路径 | 无法解释冲突来源 | 每段保留 workspace-relative identity |
| 无大小上限 | Prompt 被大文件占满 | 单文件和总预算 |
| 指令文字提升权限 | 恶意仓库突破边界 | Authority 与内容分离 |
| 缓存永不失效 | 切换目录后用错规则 | 绑定 cwd、mtime 或 content digest |
| 静默截断 | 模型误以为规则完整 | 记录 truncated 状态并展示警告 |
| 发现失败直接忽略 | Agent 在未知规则下修改 | 按风险选择 fail closed 或提示用户 |

---

## 动手实验 {#exercises}

### A. 增加第三层

在 `fixture/package/child/AGENTS.md` 加一条规则，并把 cwd 改为 child。验收条件：system prompt 顺序严格为 root、package、child。

### B. 兄弟目录隔离

添加 `fixture/sibling/AGENTS.md`，cwd 仍为 package。验收条件：sibling 内容不出现在 documents 或 prompt 中。

### C. 大小上限

把 `max_bytes_per_file` 设为很小的值，输入多字节中文。观察字节切断可能落在 UTF-8 字符中间，replacement decoding 会出现什么。设计一个既按 bytes 防御、又尽量在字符边界截断的改进版。

### D. 冲突策略

Root 写“使用双引号”，leaf 写“使用单引号”。分别设计三种产品语义：leaf override、全部约束、冲突询问。说明它们对可预测性与用户体验的影响。

### E. 来源 Trace

增加 `instructions.loaded` 事件，payload 只包含相对路径、bytes、truncated 和 digest，不包含完整敏感内容。验收条件：可以证明加载了什么，又不会复制整份 prompt。

---

## 深入：Instructions 是一种受控上下文编译 {#deep-dive}

生产 Harness 可以把 prompt 构建看成编译流程：

```text
platform policy
  + user request
  + project instructions
  + tool descriptors
  + skills / memory
  + runtime facts
          │
          ▼
validated, budgeted model context
```

每个输入都应该有来源、信任级别、作用域、优先级和预算。编译器负责拒绝不合法组合、标记冲突、裁剪低优先级内容，并输出可解释 manifest。

进一步的问题包括：

- Git worktree、monorepo 和跨目录编辑如何计算适用 scope？
- Symlink 指向另一个项目时使用哪套指令？
- 指令变更后，正在运行的 turn 是冻结旧版本还是热更新？
- Subagent 继承父指令、重新发现，还是只接收显式摘要？
- 指令中的链接和脚本是否允许自动加载？
- 如何评测 instruction following，而不把模型能力与 discovery bug 混在一起？

> 好的 instruction system 不是“把更多文字塞进 system prompt”，而是把异构上下文编译成有来源、有边界、可预算的输入。

---

## 本章检查点 {#checkpoint}

进入 s06 前，请确认你能回答：

1. 为什么 discovery 只走 root-to-cwd 祖先链？
2. Prompt 中位置更靠后，为什么不代表权限更高？
3. 为什么必须保留 instruction source path？
4. cwd 变化时缓存应如何失效？
5. 指令为什么不能关闭 sandbox 或授予网络权限？

下一章会面对所有长会话都会遇到的问题：system、instructions、消息、工具结果和 schema 最终会超过模型窗口。我们要让截断与裁剪成为显式、可测试、可观察的预算策略。
