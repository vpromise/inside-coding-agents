# Checkpoint、Diff 与 Rollback

Coding Agent 会改变状态。可靠 Harness 在自己拥有的 edit 之前创建绑定版本的 baseline，为 review 呈现 scoped diff，并在需要恢复时只 restore 显式选择的路径。Checkpoint 不是清除“不方便 workspace 状态”的许可证。

`s13-checkpoint-rollback` 使用真实 Git 仓库，但仓库只存在于新建 disposable temporary fixture 中。课程有意避开 broad reset、clean 与任何用户 worktree 操作。

## L0 · 定义与边界 {#definition}

Checkpoint 标识已知 baseline；diff 描述 baseline 与当前状态之间的 delta；rollback 在确认被 review 的 delta 仍然有效后，执行 scoped recovery。

> 只有 Harness 知道哪些状态属于自己、哪些属于用户，恢复才是安全的。

```text
validated clean fixture
        │
        ▼
checkpoint.create ──► bounded edit
        │                  │
        │                  ▼
        └────────── checkpoint.diff
                           │
                    review + fingerprint
                           │
                           ▼
                  checkpoint.rollback
                           │
                    verify final state
```

| 概念 | 必需 identity | 危险捷径 |
| --- | --- | --- |
| Repository | canonical root 与 VCS state | 假定 current directory |
| Checkpoint | 准确 baseline revision 与 cleanliness | 模糊的“修改前”标签 |
| Owned paths | 明确 review 的 path set | 所有 modified file |
| Diff | 与 baseline 绑定的 bytes/patch | 缓存的屏幕内容 |
| Rollback | 准确 path set 与 expected fingerprint | broad reset/clean |
| External effect | 必要时 compensating action | 假装 Git 能撤回 |

### Rollback 不覆盖什么

Git 能恢复 repository 内 tracked file content，但无法自动撤销 network request、package publication、database mutation、process signal、external message、credential exposure、仓库外 generated artifact 或用户并发修改。这些 effect 需要 idempotency、compensating action 或显式 incident handling。

### Dirty work 不是 checkpoint

预先存在的用户修改属于输入状态，不是 Agent 拥有的 backup material。Harness 要么保存并建模它们，要么在独立 worktree/branch 工作，要么停下来请求决定。把它们吞进内部 checkpoint，之后恢复 baseline，可能直接摧毁用户工作。

> 当“clean”意味着删除用户创建的状态时，“恢复干净”不是合法目标。

## L1 · 可运行参考 {#reference}

运行课程并验证 Golden Trace：

```bash
python3 -m curriculum.lessons.s13_checkpoint_rollback.demo
python3 -m curriculum.golden verify s13-checkpoint-rollback
```

Demo 创建全新 temporary directory、初始化 Git、提交 `status.txt`，并把 `GitCheckpointManager` 绑定到准确 root。这个 setup 属于安全契约，不是无关测试样板。

```python
fixture = tempfile.TemporaryDirectory(prefix="inside-agents-s13-")
root = Path(fixture.name)
git(root, "init", "-q", "-b", "main")
target = root / "status.txt"
target.write_text("status: pending\n", encoding="utf-8")
git(root, "add", "--", "status.txt")
git(root, "commit", "-q", "-m", "baseline")
```

Tool 创建 checkpoint，做一次 workspace-bounded replacement，记录 before/after hash，只对 `status.txt` 计算 diff，并只恢复这一条路径。

```python
checkpoint = checkpoints.create("before-review")
workspace.replace_text(
    "status.txt",
    "status: pending",
    "status: reviewed",
)
diff = checkpoints.diff(checkpoint, ("status.txt",))
rollback = checkpoints.rollback(
    checkpoint,
    ("status.txt",),
    expected_patch_sha256=diff.patch_sha256,
)
```

Patch fingerprint 关闭 time-of-check/time-of-use 缺口：review 后 workspace 发生变化，之前看过的 diff 已 stale，rollback 会拒绝。

### 为什么 manager 使用 scoped restore

实现以明确 repository context 与明确 path 调用 Git，不执行 `git reset --hard`、`git clean` 或 unscoped restore。Broad command 无法区分 Agent-owned delta 与 user work。

### 阅读 Golden Trace

```text
checkpoint.create
  └── file.patch (before/after SHA-256)
        └── checkpoint.diff (paths + line counts)
              └── checkpoint.rollback (restored paths + clean status)
```

最终 tool result 包含 reviewed diff summary、rollback status 与 final file content。测试验证 fixture 回到 committed baseline。

### 运行检查

```bash
python3 -m unittest curriculum.tests.test_vertical_slice
python3 -m curriculum.golden verify s13-checkpoint-rollback
```

课程证明 disposable fixture 内的 scoped recovery，不授权对项目 checkout 或任何用户仓库运行 rollback。

## L2 · 工程化恢复 {#engineering}

生产 recovery 在第一次 mutation 之前就开始。Harness 需要 state inventory、ownership model、checkpoint strategy、mutation journal、review snapshot 与恢复后 verification。

### 按 effect domain 盘点状态

```text
filesystem tracked files  → VCS checkpoint + scoped restore
filesystem untracked      → explicit ownership manifest 或 trash
package/dependency state  → lockfile + reproducible environment rebuild
process state             → 按 recorded identity terminate/restart
database/API mutation     → transaction、idempotency key、compensating action
messages/publication      → 通常不可逆，需要更强 approval
```

不能只说“支持 rollback”，必须说明覆盖哪些 domain。Git checkpoint 只覆盖 filesystem state 的一部分。

### 保留 pre-existing state

修改前记录 repository root、head revision、branch/worktree identity、staged path、unstaged path、untracked path 与相关 submodule。若允许 dirty state，应单独 snapshot 并让 ownership 对用户可见；做不到安全处理时，应 pause 或进入 isolated copy。

### Review 绑定准确 bytes

Review UI 应展示与 rollback/apply 操作 fingerprint 相同的 normalized patch。Path list、binary-file handling、rename detection、line ending rule 与 submodule change 都要明确。Approval 后、mutation 前重新计算 fingerprint。

```python
current = manager.diff(checkpoint, reviewed_paths)
if current.patch_sha256 != reviewed_patch_sha256:
    raise StaleReview("workspace changed after review")
```

### Roll forward 与 roll back

Rollback 不总是最佳恢复。如果 migration 或 external effect 已发生，corrective forward change 可能比恢复旧文件更安全。Plan 应在 execution 之前写清 reversibility，不能失败后才发现。

### 失败模式 {#failure-modes}

| 失败 | 后果 | 控制手段 |
| --- | --- | --- |
| Broad reset/clean | 用户工作被摧毁 | explicit path allowlist |
| Repository root 错误 | 修改无关项目 | canonical root identity |
| Dirty state 被当作 owned | 预先编辑丢失 | inventory + ownership manifest |
| Review 后 diff 改变 | 应用 stale consent | patch fingerprint recheck |
| 忽略 untracked file | 恢复不完整 | explicit untracked-file policy |
| 忽略 external effect | 虚假“完全回滚” | effect-domain journal |
| Concurrent agent edit | 一个 Agent 撤销另一个 | lease/version check + path ownership |

### 安全与可靠性 {#safety}

Rollback 的目的虽是恢复，它仍是 destructive action。应使用最小、可逆操作，展示准确 target；若 restore 会覆盖非本 attempt 创建的状态，需要 fresh authority。对 material untracked file，优先 trash 或额外 backup。

绝不能从 unresolved model text、broad glob、empty environment variable、home directory 或 workspace root 构造 destructive target。先只读解析 target，保留可 review 列表。

Cancellation 也要有明确 policy。自动恢复完全 owned 的 disposable fixture 可能合理；自动 reset 用户 dirty repository 不合理。Cancellation、rollback decision、attempted recovery 与 verification 应是不同 event。

## L3 · 架构与 Agent 对照 {#comparison}

当前本机制没有 Agent mapping 满足 Atlas `Snapshot + Claim` 门槛。名为“undo”“checkpoint”“revert”的 UI feature 不足以推断实现 scope、VCS behavior 或是否保护 pre-existing change。

### Snapshot 研究维度

对每个 Agent 固定并检查：

1. checkpoint trigger 与 storage location；
2. 支持的 state domain；
3. repository/branch/worktree assumption；
4. staged、unstaged、untracked、ignored、submodule state 处理；
5. exact path ownership model；
6. 展示给用户的 diff 与 fingerprinting；
7. concurrent mutation detection；
8. rollback command 或 compensating action；
9. backup retention、privacy 与 deletion；
10. Trace event 与 user-visible failure state。

Source map 可以展示 command 与 data structure；controlled reproduction 应使用包含已知 dirty/concurrent change 的 disposable fixture。两者都不应碰研究者真实 working tree。

### 不要只比较成功 demo

关键案例是 stale review、user-owned dirty file、untracked material file、rename/symlink、concurrent agent、partial Git failure 与 non-filesystem effect。Clean file 的 happy-path revert 只是起点，不是生产结论。

## L4 · 研究与测量 {#research}

Checkpoint 实验应发布 fixture construction 与 post-run state，让 reviewer 验证目标路径发生预期变化、protected path 没有变化。

### 建议的 recovery matrix

创建 disposable repository，包含：

- 一条 clean tracked target，由当前 attempt 拥有；
- 一条 pre-existing staged user change；
- 一条 pre-existing unstaged user change；
- 一个 untracked material file；
- 一个 ignored build artifact；
- 一个 rename 或 symlink fixture；
- diff review 后的模拟 concurrent edit；
- journal 中记录的一项 synthetic external effect。

依次运行 checkpoint、mutation、diff、stale-review detection、scoped recovery 与 verification。Expected outcome 要指定每阶段准确 file hash 与 VCS status。

衡量 protected-state survival、owned-state recovery、stale-review rejection、target overreach、time to recover、residual effect 与 trace completeness。任何 protected-state change 都是 critical failure，即使最终 test suite 通过。

### 练习与验收 {#exercise}

```bash
python3 -m curriculum.lessons.s13_checkpoint_rollback.demo
python3 -m curriculum.golden verify s13-checkpoint-rollback
python3 -m unittest curriculum.tests.test_course_contract
```

1. 在 `diff()` 后修改 `status.txt`，验证 stale fingerprint rejection；
2. 添加第二个 tracked file，证明 rollback 只触碰 selected path；
3. 引入 pre-existing dirty file，让 checkpoint creation 拒绝；
4. 记录 synthetic external effect，并报告它未被 rolled back；
5. 断言没有使用 broad reset、clean 或 unscoped restore。

当“rollback complete”可以展开成准确 state domain、owned path、baseline identity、verified post-state 与 explicit residual effect 时，才算理解本机制。

### 研究检查点

> 无法说明保留了什么的 recovery，只是另一次 uncontrolled mutation。

当前没有注册正式 checkpoint experiment。课程 fixture 是 Controlled baseline，必须与用户 workspace 隔离。
