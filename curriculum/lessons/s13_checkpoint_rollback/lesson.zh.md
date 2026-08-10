# s13 · Git Checkpoint、Diff 与 Rollback

> Reversibility 是恢复属性，不是 permission。Agent 编辑前先建立 clean、version-bound baseline，审查 exact scoped delta，并且只恢复 Harness 明确拥有的 path。

## 你将构建什么 {#learn}

s10 决定动作能否运行，s11 限制它的 power，s12 控制哪些 input 可以成为 instruction。这些层降低风险，但完全获批、被隔离、来自可信指令的 edit 仍可能是错的。

本章使用真实 temporary Git repository 增加 recovery boundary：

- `GitCheckpointManager` 验证一个 exact repository top level；
- `create()` 默认拒绝 dirty baseline，并记录 `HEAD` 与 tree identity；
- `diff()` 要求显式 relative path，产生 patch fingerprint 与 line count；
- `rollback()` 在 scoped `git restore` 前重新核对 reviewed fingerprint；
- untracked file 和无关 path 永不进入本章 rollback selection；
- `checkpoint.create`、`file.patch`、`checkpoint.diff`、`checkpoint.rollback` 在 Trace 0.1 中保留状态转换；
- Demo 只在 disposable fixture 运行，最终内容回到原始值。

完成后，你应该能够：

- 区分 session checkpoint、Git checkpoint、commit、patch 与 backup；
- 保护 pre-existing user change，不让它被 Agent 冒领；
- 把 review 绑定到 exact state delta，并检测 stale review；
- 只对 explicit file 做 rollback，而不是整个 working tree；
- 解释 Git 无法撤销哪些 network、process、database、deployment effect；
- 设计不泄露 private source 的 checkpoint event。

### 先修知识

你应理解 s04 的 workspace path bound、s07 的 append-only event、s08 的 compaction checkpoint，以及 s10–s12 的安全链。需要本地 Git；Lesson 会自行初始化 temporary repository。

---

## 问题：“Git 能撤销”非常含糊，也可能危险 {#problem}

Coding agent 经常面对已经包含用户编辑的 working tree。Broad rollback 可能擦除 Agent 从未创建的工作；不良 edit 之后才建 checkpoint，只是把错误状态当 baseline；reviewed diff 到 rollback 之间如果有并发修改，review 也会 stale。

| 术语 | 捕获什么 | 不保证什么 |
| --- | --- | --- |
| Session checkpoint | Agent/event progression | Filesystem state 或 external effect |
| Context checkpoint | Model-visible semantic summary | Lossless history 或 working tree state |
| Git commit/tree | Tracked repository content | Untracked file、database、remote service |
| Working-tree diff | 相对 base 的 delta | Ownership 或 authorization |
| Backup/snapshot | 某 scope 的存储副本 | 正确 restore semantics 或 freshness |
| Compensating action | 领域特定反向操作 | 并发下的 exact restoration |

> Dirty working tree 是 ownership 不明确的证据。不能为了方便 Agent workflow，就吸收或擦除它。

### 四个恢复问题

修改文件前应回答：

1. 要恢复到哪个 exact baseline？
2. 本操作拥有哪些 path？
3. 被 review 的 delta 之后是否变化？
4. 哪些 side effect 在 Git 之外，需要单独 compensation？

任一答案未知，“可 rollback”都不是可靠安全结论。

---

## 心智模型：Authorize、Checkpoint、Mutate、Review、Decide {#mental-model}

最终 Safety pipeline：

```text
trusted instruction + user task
          │
          ▼
tool.request ──> approval ──> sandbox profile
          │ allowed
          ▼
verify exact Git root + clean baseline
          │
          ▼
checkpoint.create (commit/tree identity)
          │
          ▼
scoped mutation ──> file.patch
          │
          ▼
checkpoint.diff (paths + additions/deletions + private fingerprint)
          │
          ├── accept ──> continue/test/commit
          │
          └── rollback ── recheck fingerprint ──> scoped restore
```

Demo 总是选择 rollback，因此 Golden Trace 能证明恢复。生产 Harness 可以在 review 后继续、提交 coherent change 或创建新 checkpoint。

### Ownership 同时受 Path 与 Time 限制

本章只在一个 tool call 内拥有 disposable fixture 的一个文件，不声称拥有 repository root、无关 tracked change、untracked file 或 call 之后的 effect。

### Review 是 State Binding

`GitDiff.patch_sha256` 绑定 Harness 实际检查的 patch。Rollback 重新计算并在变化时拒绝，避免对 version A 的决定盲目作用于 version B。

---

## 逐步构建 Scoped Git Recovery {#build}

### 第一步：创建 Isolated Fixture Repository

`build_demo()` 创建 `TemporaryDirectory`、初始化 `main`、写一个文件并提交 deterministic baseline：

```python
_git(root, "init", "-q", "-b", "main")
target.write_text("status: pending\n", encoding="utf-8")
_git(root, "add", "--", "status.txt")
_git(root, "commit", "-q", "-m", "baseline", commit=True)
```

Helper 使用 argv array、无 shell、五秒 timeout、禁止 terminal prompt，并固定 commit identity/time。Fixture 永远不是承载本课程的真实 project repository。

### 第二步：验证 Exact Git Top Level

Manager resolve requested root，并与以下结果比较：

```bash
git rev-parse --show-toplevel
```

Nested directory、parent repo 或无关 path mismatch 都会拒绝。Recovery command 必须先有 exact scope。

### 第三步：把 Checkpoint 绑定到一个 Repository

Manager 对 absolute Git directory 做内部 hash，作为 repository token。`GitCheckpoint` 携带 token、commit、tree、label 与 stable lesson ID；来自其他 repository 的 checkpoint 被拒绝。

内部 token 源自 local path，因此不发进 public Trace；portable event 只使用非敏感 checkpoint ID。

### 第四步：要求 Clean Baseline

`create()` 运行：

```python
git status --porcelain=v1
```

存在任何 tracked/untracked change 时默认失败，避免把 user/agent 混合状态声称为 rollback baseline。

生产选择包括停止、询问用户、创建 separate worktree 或精确定义 pre-existing delta。静默 stash/commit 用户工作不是可接受默认值。

### 第五步：记录 Commit 与 Tree Identity

Manager resolve `HEAD` 和 `HEAD^{tree}`。Branch name 会移动，不能单独标识 checkpoint。Demo event 只公开 label 与 clean status，private state 保留 restore 所需 hash。

### 第六步：执行一个 Explicit-path Edit

Tool 只替换 `status.txt` 中一个 occurrence：

```python
workspace.replace_text(
    "status.txt",
    "status: pending",
    "status: reviewed",
)
```

它发出 `file.patch`，只含 relative path 与 before/after SHA-256，Trace 无需发布 file body。

### 第七步：验证每个 Diff Path

`_validate_paths()` 拒绝 empty path list、escape 与 repository root，并返回去重的 repository-relative POSIX path。

```python
candidate = (self.root / value).resolve()
relative = candidate.relative_to(self.root)
if not relative.parts:
    raise CheckpointError("repository root is too broad for scoped rollback")
```

显式 `--` 分隔 Git option 与 path，避免以 `-` 开头的 filename 变成参数。

### 第八步：检查 Exact Diff

Manager 运行 binary-capable patch 与 numstat：

```python
git diff --no-ext-diff --binary <checkpoint> -- status.txt
git diff --numstat <checkpoint> -- status.txt
```

Lesson 记录一条 addition、一条 deletion；`patch_sha256` 留在 private runtime state，用于发现 stale review。

### 第九步：Rollback 前重新核对

`rollback()` 重算 diff。传入 expected fingerprint 且不一致时，在修改任何内容前抛 `CheckpointError`。

```python
current = self.diff(checkpoint, scoped_paths)
if current.patch_sha256 != expected_patch_sha256:
    raise CheckpointError("working tree changed after the reviewed diff")
```

这就是 reviewed change 的 optimistic concurrency control。

### 第十步：只 Restore Explicit Path

Lesson 使用：

```text
git restore --source <checkpoint> --worktree --staged -- status.txt
```

没有 repository-wide reset，也不删除 untracked file。Manager 随后验证 selected path clean，并发 `checkpoint.rollback`。

### 第十一步：返回 Structured Result

Tool result 报告 reviewed path/count、`rolled_back=true` 与 final fixture content。第二次模型 turn 通过普通 tool history 解释 outcome。

---

## 运行并检查 Reversible Change {#run}

运行：

```bash
python3 -m curriculum.lessons.s13_checkpoint_rollback.demo
```

15 事件 Trace 中心部分：

```text
approval.decision allow
checkpoint.create id=checkpoint-before-review clean_baseline=true
file.patch path=status.txt before_sha256=… after_sha256=…
checkpoint.diff paths=[status.txt] additions=1 deletions=1
checkpoint.rollback restored_paths=[status.txt] clean=true
tool.result final_content="status: pending\n"
```

校验：

```bash
python3 -m curriculum.golden verify s13-checkpoint-rollback
```

### 检查 Final File

`runner.run(...)` 后，`runner.target.read_text()` 精确等于 `status: pending\n`。Temporary repository 的 selected path 回到 baseline。

### 攻击 Path Scope

调用 `diff(checkpoint, ("../outside.txt",))`。Manager 在任何 Git restore 前抛 `CheckpointError`。

### 攻击 Stale Review

创建 diff、保存 fingerprint、再次修改文件，再用旧 fingerprint rollback。验收：rollback 因 reviewed patch 已不再 current 而拒绝。

---

## 失败模式与恢复限制 {#failure-modes}

| 失败 | 后果 | 更安全的设计 |
| --- | --- | --- |
| Mutation 后才 Checkpoint | 错误状态成为 baseline | Side effect 前 create/record |
| 静默接受 Dirty Baseline | User work 与 Agent work 混合 | Stop、isolated worktree 或 ownership contract |
| Repository-wide Reset | 无关 tracked edit 丢失 | Explicit path list + review |
| Clean 删除 Untracked | 用户 artifact 消失 | 永不 broad clean，先 inventory ownership |
| 用 Branch Name 当 Identity | Moving ref 改变 restore source | Immutable commit/tree identity |
| 没有 Review Fingerprint | 并发 edit 被覆盖 | Restore 前重算比较 |
| 不检查 Symlink/Path | Restore 意外 target | Exact top level + resolved relative path |
| 把 Git Rollback 称 Transaction | Network/deploy/database effect 保留 | Compensating action + effect ledger |
| Public Trace 放 Patch Body | Private source 泄露 | Digest/count/path + redaction |
| 成功 Rollback 隐藏失败 Attempt | Incident evidence 消失 | Append-only event 保留两种状态 |
| Agent 自动 Commit 用户工作 | Ownership/history 被改变 | Explicit consent + coherent commit policy |
| 多 Agent 共用一棵 Tree | Checkpoint/diff race | Worktree/process isolation + lease |

> Git 能恢复 tracked byte；它不能撤回消息、撤销已发布 package、在无 transaction 时回滚 database，也不能保证 command 没有隐藏 effect。

### Dirty Worktree Strategy

可选策略包括 refuse、要求用户 commit/stash、创建新 worktree、只 snapshot agent-owned path 或使用 overlay filesystem。每种都必须保留 pre-existing state 并展示 ownership。“自动 stash 全部”也会打断用户 workflow，不应成为隐藏默认值。

### Binary 与 Generated File

Binary diff review、lockfile、generated artifact 与 file mode change 需要专门 UI/validation；line count 不足以批准 binary replacement。

---

## 练习与验收条件 {#exercises}

### A. 拒绝 Dirty Baseline

`create()` 前修改 `status.txt`。验收：checkpoint creation 抛错、内容保留、不发误导性 `checkpoint.create`。

### B. 拒绝 Empty 或 Root-wide Scope

传 `()` 或 `(".",)`。验收：两者都被 validation 拒绝，不构造 restore command。

### C. 检测 Stale Review

保存 diff fingerprint，再做一次 edit，用旧值尝试 rollback。验收：产生 `CheckpointError`，最新内容不被触碰。

### D. 保留无关 Tracked Edit

增加 `user-notes.txt`，checkpoint 后修改它，只 rollback `status.txt`。验收：status 回 baseline，user notes 保持精确变化。

### E. 保留 Untracked Artifact

Checkpoint 后创建 `scratch.log`。验收：scoped rollback 不删除、不 add；result 明确说明它在 ownership 外。

### F. 增加 Effect Ledger

为一个 tool call 记录 filesystem、process、network effect。验收：Git rollback 只处理 tracked path；non-Git effect 必须有 named compensation，或明确显示 irreversible。

运行聚焦合同：

```bash
python3 -m unittest \
  curriculum.tests.test_vertical_slice.VerticalSliceTests.test_s13_rolls_back_only_the_reviewed_scoped_diff -v
```

---

## 深入：生产级 Recovery Architecture {#deep-dive}

### Checkpoint Ownership Model

Session 可拥有 dedicated worktree、path set、patch stack 或 overlay snapshot。必须显式表达 ownership 并拒绝 overlap。Multi-agent system 需要 lease、merge boundary 与 conflict event，而不是假设一个 global working tree。

### Commit 与 Checkpoint

每个 intermediate state 都 commit 会污染 history 或捕获 incomplete work。内部 checkpoint 可使用 tree/object/ref namespace，不发布 user-visible commit。无论采用什么表示，都要有 retention、GC 与 crash recovery policy。

### Patch Review Semantics

Review 应覆盖 rename、mode、binary、submodule、generated file 与 line ending change。绑定最终 approved patch，而不是 summary。Formatting/test 若又修改文件，必须生成新 diff 与 decision。

### Crash Recovery

Mutation 前持久化 checkpoint identity 与 effect ledger。Restart 时 replay session log、发现 incomplete tool call、比较 current repo state 并给出安全选项。缺少 `tool.result` 绝不代表没有 effect。

### External Side Effect

能用领域 transaction 就使用；否则记录 idempotency key 与 compensating operation，例如删除 draft release、关闭 temporary branch、revoke token、cancel job。有些 effect 不可逆，policy 必须在 approval 前说明。

### Privacy 与 Evidence

Public trace 可展示 relative path category、count、status 与 content digest；必要时连 filename/code 都脱敏。Reproduction fixture 必须是可再分发 synthetic content，不能使用 private working tree。

### Agent Evidence Boundary

固定 Reasonix event-log Claim 提到 authoritative append-only log 旁的 derived checkpoint sidecar，但不证明它使用本 Manager、Git restore semantics 或相同 stale-review contract。其他 product mapping 仍是研究工作，不能推断 equivalence。

### 课程下一步

s13 完成初始 Safety track。后续 Reliability 会增加 error taxonomy、retry/backoff、tool-call repair、loop detection、steering/cancel/background work 与 eval-driven observability，继续建立在此处 event/checkpoint boundary 上。

---

## 检查点 {#checkpoint}

离开 Safety track 前请回答：

1. Checkpoint 为什么必须在 mutation 前创建？
2. Dirty baseline 为什么让 ownership 不明确？
3. Patch fingerprint 防止什么？
4. Explicit path list 为什么比 repository-wide reset 安全？
5. 哪些 effect 不能由 Git restore？
6. 为什么成功 rollback 仍要进入 append-only Trace？

你已经形成完整的第一条安全链：identity-bound instruction、exact approval、mandatory sandbox/network planning 与 scoped recovery。每一层回答不同问题，任何一层都不能冒充另一层。
