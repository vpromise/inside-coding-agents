# s04 · File、Shell 与 Edit Tools

> 给 Agent “手”之前，先定义它的工作台边界；路径检查是第一层护栏，不是完整 sandbox。

## 学完这一章，你会得到什么 {#learn}

s03 的 `echo` 没有副作用。真实 coding agent 必须读文件、写文件、做精确编辑并运行命令；从这一刻开始，错误不再只是坏字符串，而可能变成数据丢失、越界读取或任意代码执行。

本章构建一个小型 `Workspace` 和四种能力：`read_file`、`write_file`、`replace_text`、`run_command`。默认 demo 只开放读取，所有写入与命令都必须在创建 Registry 时显式启用。

完成本章后，你应该能够：

- 用规范化绝对路径检查阻止绝对路径与 `../` 逃逸。
- 解释为什么 path containment、approval 和 OS sandbox 是三层不同机制。
- 说明 argv 执行相对 shell string 的安全收益与剩余风险。
- 设计“恰好匹配一次”的 edit contract，避免含糊修改。
- 为文件与命令工具写出正向、越界和失败测试。

---

## 问题：副作用把错误成本放大了 {#problem}

考虑模型提出的四个请求：

```text
read_file("README.md")
read_file("../../.ssh/config")
replace_text("app.py", "return 1", "return 2")
run_command(["python3", "script.py"])
```

它们在 JSON 层都可能完全合法，但风险完全不同。Schema 只能确认 `path` 是字符串、`argv` 是数组；它不知道路径是否越界、命令是否获准、目标文件是否可信，也不能约束子进程的系统调用。

因此副作用工具至少需要四层边界：

| 层 | 回答的问题 | 本章是否实现 |
| --- | --- | --- |
| Input validation | 参数结构正确吗？ | 是 |
| Workspace boundary | 目标路径仍在项目内吗？ | 是，教学级 |
| Policy / approval | 当前请求被允许吗？ | 只用静态 allowlist 示范 |
| OS sandbox | 进程实际能访问哪些系统资源？ | 否 |

> 不要把“路径没有逃逸”写成“工具是安全的”。准确陈述边界，本身就是安全设计的一部分。

---

## 心智模型：能力越强，决策点越多 {#mental-model}

```text
ToolCall
   │
   ├─ validate schema
   ├─ resolve workspace target
   ├─ decide policy / approval
   ├─ execute with timeout + minimal environment
   ├─ bound output
   └─ record result + provenance
```

文件工具与命令工具共享 Registry 协议，但威胁模型不同：

| 工具 | 主要输入 | 主要风险 | 关键不变量 |
| --- | --- | --- | --- |
| Read | relative path | 越界读取、秘密泄露、超大文件 | resolved path 位于 root，输出有上限 |
| Write | path + content | 覆盖数据、创建恶意配置 | 显式启用，路径受限 |
| Edit | path + old + new | 匹配错误、重复替换 | old 恰好出现一次 |
| Command | argv | 任意执行、网络/进程逃逸 | executable allowlist、无 shell、超时 |

### 默认能力应该最小

`workspace_tool_registry(workspace)` 默认只注册 `read_file`。只有传入 `allow_writes=True` 才加入写与编辑；只有 `allowed_commands` 非空才加入命令工具。能力不是运行时碰运气拒绝，而是在 descriptor 暴露前就尽量缩小。

---

## 逐步构建 Workspace 边界 {#build}

### 第 1 步：固定并规范化 root

```python
class Workspace:
    def __init__(self, root: str | Path) -> None:
        self.root = Path(root).resolve()
```

保存绝对、规范化 root，后续比较才不会受调用方 cwd 变化影响。生产系统还要决定 root 是否允许包含 symlink，以及项目在运行期间能否被替换。

### 第 2 步：只接受相对路径

```python
def resolve(self, relative_path: str) -> Path:
    if not relative_path or Path(relative_path).is_absolute():
        raise ToolValidationError("path must be non-empty and relative")

    candidate = (self.root / relative_path).resolve()
    try:
        candidate.relative_to(self.root)
    except ValueError as exc:
        raise ToolValidationError("path escapes the workspace") from exc
    return candidate
```

关键不是检查字符串里有没有 `..`。`a/../README.md` 可能合法，编码、分隔符和 symlink 也会让纯字符串检查失效。先 resolve，再用路径语义确认 candidate 属于 root。

### 第 3 步：限制读取结果

```python
def read_file(self, relative_path: str, *, max_chars: int = 20_000):
    path = self.resolve(relative_path)
    content = path.read_text(encoding="utf-8")
    return {
        "path": relative_path,
        "content": content[:max_chars],
        "truncated": len(content) > max_chars,
    }
```

路径安全不代表输出大小安全。读取结果需要明确的截断标记，否则模型会把 preview 当成完整文件。

### 第 4 步：让编辑拒绝歧义

```python
occurrences = content.count(old)
if occurrences != 1:
    raise ToolExecutionError(
        f"expected exactly one match, found {occurrences}"
    )
updated = content.replace(old, new, 1)
```

零匹配说明文件已变化或模型引用错误；多匹配说明 edit 不够精确。两种情况都应停止并返回结构化失败，而不是“尽量改一个”。

### 第 5 步：命令使用 argv，不经过 shell

```python
if not argv or argv[0] not in allowed_commands:
    raise ToolValidationError("command is not in the lesson allowlist")

completed = subprocess.run(
    argv,
    cwd=self.root,
    env={"PATH": os.environ.get("PATH", ""), "LANG": "C.UTF-8"},
    capture_output=True,
    text=True,
    timeout=timeout_seconds,
    check=False,
)
```

把参数直接传给 `subprocess.run`，意味着 `;`、`$()`、重定向等不会自动获得 shell 语义。但被允许的 executable 本身仍可能执行任意代码，例如 `python3 -c ...`；所以 executable allowlist 只是示范，不是完整命令 policy。

### 第 6 步：Registry 按配置投影能力

```python
registry = workspace_tool_registry(
    workspace,
    allow_writes=False,
    allowed_commands=(),
)
```

本章 demo 使用这个最小配置，所以模型 descriptor 里只有 `read_file`。如果能力没有暴露，模型就不会被鼓励去调用它；即使模型伪造名字，s03 的 Registry 仍会拒绝。

---

## 运行受限读取示例 {#run}

执行：

```bash
python3 -m curriculum.lessons.s04_workspace_tools.demo
```

Demo root 固定为：

```text
curriculum/lessons/s04_workspace_tools/fixture/
└── README.md
```

模型请求 `read_file({"path": "README.md"})`，预期 Trace 包含成功的 tool result：

```python
runner, trace = build_demo()
result = runner.run("Read the fixture README and summarize it.")

tool_result = next(
    event for event in result.events
    if event["type"] == "tool.result"
)
assert tool_result["payload"]["ok"] is True
assert tool_result["payload"]["tool"] == "read_file"
```

### 直接验证逃逸被拒绝

在临时目录里运行：

```python
from tempfile import TemporaryDirectory
from curriculum.harness import Workspace
from curriculum.harness.tools import ToolValidationError

with TemporaryDirectory() as directory:
    workspace = Workspace(directory)
    try:
        workspace.resolve("../outside.txt")
    except ToolValidationError as error:
        assert str(error) == "path escapes the workspace"
```

验收重点是：错误发生在任何文件读取或写入之前。

---

## 四个实现边界，必须说准确 {#code-reading}

### Path containment 不是 sandbox

`Workspace.resolve()` 只能约束经过它解析的路径。它不能阻止允许的子进程读取其他目录、访问网络、fork 新进程或调用系统 API。

### Allowlist 不是语义分析器

允许 `git` 不代表所有 `git` 子命令都安全；允许 `python3` 几乎等于允许通用程序执行。生产 policy 往往需要检查 executable、subcommand、flags、cwd、环境和信任状态。

### 当前写入不是原子的

`write_text()` 直接覆盖目标文件。进程中断可能留下部分状态；并发 writer 可能相互覆盖。更稳健的实现会写临时文件、fsync，并在同一文件系统内原子 rename。

### Resolve 与使用之间存在时间窗口

检查 candidate 到真正 open 之间，攻击者可能替换 symlink 或目录。这是 TOCTOU。高威胁环境需要基于 file descriptor 的安全打开方式或 OS sandbox，而不是重复调用 `resolve()`。

---

## 常见失败模式 {#failure-modes}

| 错误 | 表面上为什么合理 | 实际风险 |
| --- | --- | --- |
| `path.startswith(root)` | 写起来简单 | `/work/project-evil` 也可能匹配 |
| 只拒绝字符串 `..` | 看似能挡 traversal | 编码、symlink、规范化绕过 |
| `shell=True` 执行模型字符串 | 支持管道与重定向 | 命令注入面急剧扩大 |
| edit 替换第一个匹配 | 总能“做点事” | 修改错误位置且难以察觉 |
| 把完整 stdout 送回模型 | 信息最全 | context 溢出、秘密泄露 |
| 默认开放写工具 | 使用方便 | 不必要的副作用面 |
| 复用完整父进程环境 | 省去配置 | 凭据和敏感变量进入子进程 |

---

## 动手实验 {#exercises}

### A. 路径测试矩阵

分别测试 `README.md`、`./README.md`、`folder/../README.md`、`../outside` 和绝对路径。把“接受/拒绝”写成表，再运行断言验证实现与威胁模型一致。

### B. 精确编辑

在临时 fixture 写入两个相同的 `TODO`，调用 `replace_text`。验收条件：文件内容不变，错误报告 `found 2`。然后把 old 扩展成唯一上下文，确认只修改一次。

### C. 命令 allowlist

创建 Registry，只允许 `python3`，调用 `git status`。验收条件：在启动子进程前得到 `ToolValidationError`。再解释为什么允许 `python3` 仍然风险很高。

### D. 超时

为一个允许的测试程序设置极短 timeout。设计 `TimeoutExpired` 到 `ToolExecutionError` 的转换，并确保 Trace 不把它误标为 validation failure。

### E. 原子写设计

不用立即实现，先画出步骤：同目录临时文件 → 写入 → flush/fsync → 权限处理 → atomic replace → 清理。标注每一步失败后的恢复策略。

---

## 深入：生产级副作用治理 {#deep-dive}

生产 coding agent 通常组合多层防线：

- **Project trust**：未信任仓库中的指令和脚本默认不能获得高权限。
- **Capability policy**：按 read/write/network/destructive 分类工具。
- **Argument-aware approval**：批准的是精确命令或路径范围，不是抽象工具名。
- **OS sandbox**：使用容器、namespace、seatbelt、seccomp 或平台隔离限制实际系统调用。
- **Network policy**：域名、端口、DNS、代理和凭据注入都要受控。
- **Resource limits**：CPU、内存、文件大小、进程数和 wall time。
- **Audit trail**：记录请求、决定、执行结果和 redaction，但不泄露秘密。
- **Rollback strategy**：版本控制、备份或事务让失败操作可恢复。

安全不是一个布尔字段，而是一连串可审查的决策点。最危险的设计是把所有层压缩成 `safe=True`，让读者误以为边界已经完整。

> 最小权限不仅是“拒绝危险动作”，还包括“不向模型描述当前任务根本不需要的能力”。

---

## 本章检查点 {#checkpoint}

进入 s05 前，请确认你能回答：

1. 为什么 `candidate.startswith(root)` 不是可靠路径检查？
2. 不经过 shell 能消除哪些风险，又保留哪些风险？
3. 为什么 edit 要求 old 恰好出现一次？
4. Path boundary 与 OS sandbox 的责任分别是什么？
5. 为什么写工具应该显式启用，而不是默认注册？

下一章会处理另一种边界：项目里的 `AGENTS.md` 可以告诉 Agent 如何工作，但它本身也是不可信输入。我们要确定发现范围、层级顺序、大小限制和权限上限。
