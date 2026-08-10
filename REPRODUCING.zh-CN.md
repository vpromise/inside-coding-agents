# 复现 Inside Coding Agents 实验

[English](REPRODUCING.md)

Inside Coding Agents 将独立复现视为证据，失败和 `not-comparable` 结果同样有价值。本指南从干净 checkout 生成一份小型、可公开审核的报告，不需要 API Key、供应商账户、网络请求或模型调用。

## 复现范围

命令会在内存中重建一个已经声明的 **Controlled Reference Harness** 实验，并把每条 Trace、Result 和报告与仓库产物逐字节比较，同时核对 fixture 与 prompt digest。

它**不会**复现 Codex、Claude Code、OpenCode、Grok Build 或其他厂商产品的 Native 行为，也不能证明模型质量、生产安全、provider 可靠性或比较排名。

## 最短路径

使用 Python 3.12+ 与 Git，从公开仓库的干净 clone 开始：

```bash
git clone https://github.com/vpromise/inside-coding-agents.git
cd inside-coding-agents

python3 labs/reproduce.py reference-tool-roundtrip-v1 \
  --output reproduction-report.json

python3 labs/reproduce.py --verify-report reproduction-report.json
```

这条路径不需要安装依赖。生成文件保持 untracked；检查 tracked source 是否干净时，reporter 会有意忽略 untracked 文件。

可提交的运行以状态码 0 退出，并记录：

- `outcome: reproduced` 与 `submission_ready: true`；
- 完整公开 Git commit 和干净的 tracked worktree；
- 不包含用户名或绝对路径的 OS family、architecture 与 Python version；
- fixture、prompt、Result、报告和 Trace digest；
- `model_calls: 0` 与 `network_required: false`；
- `report_sha256` 完整性 digest。

不要手工编辑报告。字段不正确时重新运行；`--verify-report` 会发现生成后的修改。

## 可选 Controlled 实验

可以把最短路径中的 ID 替换为以下任一 immutable Experiment ID：

| Experiment ID | 机制探针 |
| --- | --- |
| `reference-tool-roundtrip-v1` | Tool request/result roundtrip |
| `reference-stream-normalization-v1` | Stream normalization |
| `reference-context-budget-v1` | Context budget 与 truncation |
| `reference-session-replay-v1` | Replay 与 branch |
| `reference-context-compaction-v1` | Context compaction |
| `reference-memory-retrieval-v1` | Memory retrieval |
| `reference-approval-binding-v1` | Approval binding |
| `reference-sandbox-network-v1` | Sandbox 与 network policy |
| `reference-project-trust-v1` | Project trust boundary |
| `reference-checkpoint-rollback-v1` | Checkpoint 与 rollback |

## 结果含义

- `reproduced`：干净且固定 commit 的源码精确重建所有声明产物；
- `failed`：运行可比，但输入、执行或产物检查失败；
- `not-comparable`：观察无法绑定到干净且固定的 Git source state。

不要把失败或 `not-comparable` 改写成成功。负面结果能够发现 portability 问题和过期假设。

## 提交项目外独立复现

打开 [Experiment reproduction issue form](https://github.com/vpromise/inside-coding-agents/issues/new?template=experiment-reproduction.yml)，提供：

1. Experiment ID 与报告中的原始 outcome；
2. 生成的 JSON，可使用 fenced block 或公开安全附件；
3. 实际执行命令以及与本指南的差异；
4. 明确说明这是在自己的环境中运行，并非代表项目维护者提交；
5. 与相关厂商或上游项目的利益关系。

项目自动化可以验证报告，但不能证明某个人是否独立。维护者重复运行、CI、合成 fixture，以及代表维护者工作的 AI agent 都不能满足外部参与者硬门。

## 发布安全

发布前人工检查报告。生成器有意排除 Git remote、用户名、环境变量值、untracked 文件名、个人路径、凭证和隐藏 reasoning。不要手工添加这些字段。

不要在公开 issue 附加 Native agent 原始 stdout、私有工作区、账户 ID、access token、cookie、隐藏 reasoning 或安全敏感细节。漏洞按 [SECURITY.md](SECURITY.md) 私下报告。
