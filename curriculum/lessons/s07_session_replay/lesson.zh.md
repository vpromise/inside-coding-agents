# s07 · Session Event Log、Replay 与 Branch

> 一个可持久化 Session 不是可随意修改的聊天对象，而是有序事实日志；Harness 可以从中重建视图、证明 lineage，并在不改写历史的前提下创建分支。

## 学完这一章，你会得到什么 {#learn}

s01–s06 主要把 Trace 0.1 当作观察层：事件解释 loop、model、tool 与 context policy 做过什么。本章再向前一步，把同一组规范化事件变成 **append-only SessionJournal**。确定性 reducer 从日志重放出可用视图，branch record 则指向父运行中的精确 sequence。

完成本章后，你应该能够：

- 区分事实事件、派生 replay view 与未来 command；
- 校验 sequence、session identity、run identity、parent 顺序与稳定 event ID；
- 重建 user message、最终 assistant message、tool result 与 stop state；
- 解释 streaming delta 在 replay 时为什么需要 final-event 规则；
- 创建包含 parent run、fork sequence、继承 event IDs 与 fingerprint 的 branch；
- 识别教学 journal 距离 crash-safe 生产存储还缺哪些边界。

### 先修知识

你需要理解 s02 的事件流以及 s03 的完整工具往返。s06 已经区分“完整事实记录”与“模型可见 context projection”。这个区分在本章非常关键：replay 读取事实记录，但不会假设历史中的每个事件都曾被模型看到。

---

## 问题：可变 Session State 无法解释自己 {#problem}

假设一个进程只维护一个 Python 对象，里面放着 `messages`、`status`、`files_changed` 和 `current_turn`。只要进程不崩、版本不升级、用户不要求回到过去，它看起来就够用。然而一旦最后一次写入不完整，或者审计者询问“这个值为什么存在”，最终对象只能回答“现在有什么”，无法回答“哪个被接受的事实产生了它”。

Coding agent 的 Session 同时面对多种需求：

| 需求 | 只有可变 Snapshot | Append-only Journal |
| --- | --- | --- |
| 崩溃后恢复 | 依赖最后一次保存完整成功 | 重放 durable events，必要时从 checkpoint 继续 |
| 解释工具结果 | 最终状态可能丢掉 request | request、result、actor 与 parent 都保留 |
| 从早期分支 | 复制后手工修改 state | 引用精确 prefix，并建立新 lineage |
| 升级派生视图 | 旧对象 shape 消失后很难迁移 | 用新 reducer 读取保留事件 |
| 发现篡改或漂移 | 没有 provenance 时很弱 | 对精确有序 prefix 计算 fingerprint |

Journal 也不会因为“只追加”就自动正确。错误 stream 可能跳过 sequence、混入两个 session、引用未来 parent、重复 event ID，或者在 durable write 之前就向调用方确认成功。Harness 必须明确并测试这些不变量。

> Event sourcing 不是“保存全部 debug log”。只有属于 Session 合同的规范化事实才应驱动 replay，诊断噪声可以进入另一条日志。

---

## 心智模型：Facts、Projection 与 Lineage {#mental-model}

不要让一个 Session 对象同时承担全部职责，而是拆成三层：

```text
事实日志                           派生视图
evt-000 session.start   ─┐
evt-001 user.message     ├── replay reducer ──> ReplayState
evt-002 model.request    │                      messages / results / stop
evt-003 model.response   │
evt-004 session.stop    ─┘
          │
          └── 在 sequence 2 分支 ──> SessionBranch
                                          parent run + exact prefix
```

- **Fact** 表示已被系统接受的可观察事实，例如 user message 到达、完整 model response 结束、tool result 返回。
- **Projection** 是可以重建的答案，例如当前 transcript、changed-file list、成本累计或 UI timeline。
- **Lineage** 指出新 branch 继承了哪一段事实 prefix。
- **Command** 请求未来动作。Branch record 不会假装替代响应已经发生。

### 五条 Journal 不变量

1. 一个 run 内的 `sequence` 从 0 开始且连续。
2. 一个 journal 只包含一个 `session_id` 与一个 provenance `run_id`。
3. `parent_event_id` 如果存在，只能指向更早的事件。
4. Replay 必须确定性：相同有序 bytes 得到相同 projection fingerprint。
5. Branch 创建不能修改、删除或重新编号父 prefix。

Reference implementation 在 `SessionJournal` 内强制前两条；仓库级 Trace validator 负责 parent 顺序和重复 ID；Golden Trace test 验证确定性输出与 lineage。

---

## 逐步构建 Journal 与 Reducer {#build}

### 第 1 步：把输入保持为不可追加外的形式

`SessionJournal` 接收 sequence 后立即保存成 tuple：

```python
class SessionJournal:
    def __init__(self, events):
        if not events:
            raise ValueError("a session journal needs at least one event")
        self.events = tuple(events)
```

Tuple 并不会深度冻结里面的 dictionary，因此这里只是教学边界，不是防篡改存储。生产系统通常会在 append boundary 序列化 accepted event、计算 content hash，并避免调用方继续持有可变引用。

### 第 2 步：拒绝缺口与混合 Identity

Sequence 规则刻意严格：

```python
sequences = [event.get("sequence") for event in self.events]
if sequences != list(range(len(self.events))):
    raise ValueError("event sequence must be contiguous and start at zero")
```

随后计算 session IDs 和 run IDs 的集合。任意集合包含多个值都属于错误。这样可以阻止一种看似方便却危险的做法：把几份 event file 拼接后冒充一个可恢复 run。

### 第 3 步：按照语义类型 Reduce

`replay()` 只遍历选定 prefix 一次。Reducer 不会把每个 payload 全部复制进 state，而是选择当前视图需要的字段：

```python
if event_type == "user.message":
    users.append(str(payload.get("content", "")))
elif event_type == "tool.result":
    tool_results.append(dict(payload))
elif event_type == "session.stop":
    stop_reason = str(payload.get("reason", "unknown"))
```

另一套 reducer 可以用相同 journal 计算 elapsed time、permission decisions 或 changed paths。把 reducer 分离，UI 需求就不会反向修改事实 Schema。

### 第 4 步：Replay 时规范化 Streaming Response

s02 会为每个 delta 发出一条 `model.response`。如果把每个 delta 都当成完整 assistant message，文字就会重复。Reducer 因而只接受普通 response 的 `content`，或者 streaming 中 `final == true` 的事件：

```python
if "content" in payload:
    assistants.append(str(payload["content"]))
elif payload.get("final") is True:
    assistants.append(str(payload.get("accumulated", "")))
```

这是 projection contract 的一部分。如果 provider adapter 对 final delta 有另一种表达，必须在事件进入 canonical journal 前完成 normalization。

### 第 5 步：给精确 Prefix 计算 Fingerprint

教学实现用排序 JSON key 序列化事件，再对 bytes 做 SHA-256：

```python
wire = json.dumps(
    events,
    ensure_ascii=False,
    sort_keys=True,
    separators=(",", ":"),
)
fingerprint = hashlib.sha256(wire.encode("utf-8")).hexdigest()
```

它能检测 projection input 漂移，但不是数字签名，也不能证明写入者身份。生产级完整性可能需要 hash chain、authenticated storage 或 signed checkpoint。

### 第 6 步：把 Branch 建模为 Lineage，而不是复制 Transcript

`branch()` 先 replay 到 `fork_sequence`，再记录精确继承 ID：

```python
return SessionBranch(
    branch_id=branch_id,
    parent_session_id=parent.session_id,
    parent_run_id=parent.run_id,
    fork_sequence=fork_sequence,
    inherited_event_ids=tuple(event["event_id"] for event in selected),
    parent_fingerprint=parent.fingerprint,
)
```

新 branch 以后可以获得自己的 session/run identity 和新事件。Record 不会声称继承事件被重新执行过。对有副作用的 tool 而言，这个区别极其重要：在一次 file write 之前做逻辑分支，并不会撤销真实工作区里已经发生的写入。

### 第 7 步：让 Replay 与 Branch 可见

Demo 先运行普通 bounded session，再构造 journal，并追加两个观察事件：

```text
session.replay  -> applied_events, stop_reason, fingerprint
session.branch  -> branch_id, parent_run_id, fork_sequence, inherited_events
```

它们位于 `session.stop` 之后，因为描述的是 run 完成后的 journal 操作，而不是又一次 model turn。生产事件分类也可以把 lifecycle facts 与 administrative journal operations 放在相关但独立的 stream。

---

## 运行并检查 Golden Trace {#run}

从仓库根目录执行：

```bash
python3 -m curriculum.lessons.s07_session_replay.demo
```

预期顺序是：

```text
session.start → user.message → model.request → model.response
→ session.stop → session.replay → session.branch
```

再把提交的 Trace 与真实运行逐字节比较：

```bash
python3 -m curriculum.golden verify s07-session-replay
```

### 阅读 Replay Payload

`session.replay` 报告 5 个已应用 execution event 和 `completed` stop reason。Fingerprint 覆盖从开头到 `session.stop` 的原始 prefix，不包含 replay event 自己。

### 阅读 Branch Payload

Branch 在 sequence 2 分叉，也就是第一次 `model.request` 之后。它继承 `evt-000` 到 `evt-002`。父历史中的原 response 与 stop event 仍然保留，只是不属于新 branch 的 inherited prefix。

### 在本地证明确定性

运行 demo 两次并比较 `TRACE:` 后面的 JSONL。教学 recorder 使用固定 clock、确定性 ID 与 Scripted Model，所以 bytes 相同。真实 Session 会使用真实时间与全局唯一 ID；比较语义时通常要先规范化 volatile fields。

---

## 常见失败与恢复边界 {#failure-modes}

| 失败 | 危险在哪里 | 应对方式 |
| --- | --- | --- |
| Sequence 缺口 | 某个事实可能丢失或只写了一半 | 停止 replay 或从 durable storage 恢复，绝不静默重编号 |
| 重复投递 | Retry 可能让工具结果应用两次 | 稳定 event ID 与 idempotent append |
| 混合 Run ID | 两条因果历史被伪装成一条 | Replay 前按 session/run 分区 |
| Future parent | 因果关系指向尚未接受的事件 | 作为无效或不完整事件拒绝 |
| Delta 被当作 message | Assistant 文本重复 | 只 reduce 最终 accumulated streaming state |
| Branch 被误认为 undo | 文件与进程仍保持改变 | s13 用 workspace checkpoint/rollback 配合逻辑 lineage |
| Payload 之后被修改 | Fingerprint 与审计不一致 | 在 append boundary 序列化或深度冻结 |
| 新 reducer 读不了旧 event | 升级后无法 resume | 版本化 Schema，迁移 projection，不原地改写历史事实 |

> Replay 只能复现日志捕获到的行为。它不能恢复隐藏模型状态、外部网络变化或没有记录的文件系统修改。

---

## 动手练习与验收条件 {#exercises}

### A. 拒绝 Sequence Gap

复制前三个事件，把最后一个 sequence 从 `2` 改成 `4`，再创建 `SessionJournal`。验收：在返回任何 replay view 前抛出 `ValueError`。

### B. Partial Replay

只 replay 到 sequence 2。验收：projection 有 user message，没有 assistant message，没有 stop reason，而且 applied sequences 恰好是三个。

### C. Streaming Reducer

把 s02 trace 作为输入。验收：projection 只有一条 assistant message，内容等于最终 accumulated text，而不是三条 delta message。

### D. Stable Branch Identity

在同一 sequence 创建两个不同 branch ID。验收：parent fingerprint 和 inherited event IDs 相同，branch IDs 不同。

### E. Duplicate Delivery Policy

设计带稳定 event ID 的 `append(event)`。说明相同 retry 是否忽略、冲突 duplicate 是否拒绝，并用表格写明 durable acknowledgement point。

### F. Snapshot Acceleration

增加包含 reducer version、source sequence、source fingerprint 与 serialized projection 的 checkpoint。验收：从 checkpoint 加 tail replay 的结果与从 event 0 replay 完全一致。

运行聚焦验收：

```bash
python3 -m unittest \
  curriculum.tests.test_vertical_slice.VerticalSliceTests.test_s07_replays_and_branches -v
```

---

## 深入：生产级 Session Architecture {#deep-dive}

### Durability 与 Acknowledgement

关键顺序是“durable append 先于 success acknowledgement”。如果 UI 在 event 持久化前显示 tool result，崩溃后用户会相信一件 replay 无法恢复的事实。Storage 可以是 transaction database、fsync segment 或 remote log，但合同必须明确 durable point。

### Idempotency 与 Exactly-once 幻觉

网络一定会 retry。跨 model provider、tool、storage 与 UI 通常无法真正保证 exactly once。系统会组合 stable call ID、deduplicated event ID、idempotent handler 与显式 reconciliation。Journal 只说明 Harness 接受了什么，不会让一个非幂等 shell command 自动安全。

### 不删除事实的 Checkpoint

长日志 replay 昂贵。Checkpoint 可以缓存 sequence N 的 projection，只重放 N+1 之后的 tail。它必须记录 reducer/schema version 和 source fingerprint。删除 source events 会让 acceleration structure 变成不可逆 authority，并削弱审计能力。

### Schema Evolution

增加 optional field 通常比改变语义容易。Reducer 可以容忍未知 optional field；但如果忽略未知 event type 会改变 state，就必须失败。Migration 可以生成新 projection version，同时保留原始 wire event 与 provenance。

### Branch 与真实 Workspace

逻辑 branch 只选择 conversation history；coding agent 还会作用于文件、Git state、process、service 和 remote system。因此安全分支需要 artifact policy：immutable artifact handle 可以共享，mutable workspace 则可能需要 Git commit、copy-on-write directory、container 或 worktree。s13 会把 lineage 与 checkpoint/rollback 连接起来。

### Privacy 与删除

Append-only 是 reliability property，不是永久保留 secret 的许可。发布前要脱敏，私有存储需要 retention、encryption、access control 与 deletion procedure。某些合规删除可能依赖 tombstone 或加密密钥销毁，而不是假装历史事件从未发生。

### 真实 Agent Mapping 能证明什么

链接的 Codex、Pi 与 Reasonix Claim 证明固定版本中的 event 或 session logging boundary。它们不能证明产品使用这里的 `SessionJournal`、fingerprint format 或 branch record，所以关系明确标记为 **adjacent**。

---

## 本章检查点 {#checkpoint}

进入 semantic compaction 前，请确认你能回答：

1. 为什么 replay projection 不是事实源？
2. Streaming response 中哪一条 event 才应形成 assistant message？
3. 哪些信息让 branch 的 parent lineage 可审计？
4. 为什么 session branching 不会 rollback 文件副作用？
5. Harness 确认 event 前，什么必须 durable？
6. Checkpoint 如何加速 replay 又不取代事实日志？

s08 会把完整可 replay journal 当作 lossy context compaction 之下的安全网。模型看到的是更小 checkpoint，而 Harness 仍保留可审计、可重建的 source events。
