# Inside Coding Agents

> 面向 Coding Agent 架构与 Agent Harness 工程的可视化、证据驱动手册和可复现实验室。

[English](README.md) | **简体中文**

[打开在线网站](https://vpromise.github.io/inside-coding-agents/)

[![CI](https://github.com/vpromise/inside-coding-agents/actions/workflows/ci.yml/badge.svg)](https://github.com/vpromise/inside-coding-agents/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](LICENSE)
[![Python](https://img.shields.io/badge/Python-3.12%2B-3776AB?logo=python&logoColor=white)](curriculum/README.md)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white)](apps/web/README.md)

![Inside Coding Agents：深入理解模型之外的 Agent Harness 架构](apps/web/public/og.png)

Inside Coding Agents 是一个开源、双语的教程、架构图谱和实验室，用来系统理解 **Coding Agent** 以及大模型周围的 **Agent Harness**。项目把 agent loop、工具调用、上下文管理、工作区访问、项目指令发现、sandbox、权限、subagent、协议、扩展、重试和 trace，变成可以运行的课程与可以核查的证据。

你可以对照研究 **Codex、Claude Code、Pi 和 Reasonix** 如何解决共同的工程问题，也可以直接运行与厂商无关的 Reference Harness，在不使用 API Key 的情况下复现核心机制。

> 这是独立的教育与研究项目。产品名称归各自所有者所有；收录不代表任何关联或背书。

## 为什么需要这个项目

模型可以提出下一步动作，但一个真正可用的 Coding Agent 仍然需要外围系统来持有状态、暴露工具、执行策略、管理上下文、观察副作用，并判断任务何时结束。

现有资料大多只解释单一产品，或者停留在一个玩具循环。Inside Coding Agents 把三个层次连接在同一张内容图谱中：

- **亲手构建：** 用小而确定的 Python 课程逐步实现 Harness 机制；
- **深入拆解：** 用版本化 Agent Snapshot 区分事实、证据和解释；
- **独立复现：** 发布固定 fixture、规范化 trace、实验结果与失败边界。

因此，同一套内容既可以作为小白的 Coding Agent 入门教程，也可以作为工程师的架构参考和研究者的证据索引。

## 项目入口

| 视图 | 解决的问题 | 从这里开始 |
| --- | --- | --- |
| Academy | 如何从零构建一个 Coding Agent？ | [运行 6 节课程](curriculum/README.md) |
| Mechanisms | 不同 Agent Harness 共同面对哪些设计问题？ | [浏览 14 个机制](content/mechanisms/README.md) |
| Agent Atlas | 某个 Agent 如何实现这些机制？ | [查看版本化档案](content/agents/README.md) |
| Experiment Lab | 哪些观察可以在固定条件下复现？ | [回放受控实验](labs/README.md) |
| Registry | Claim、Evidence、Schema 和稳定 ID 存在哪里？ | [了解数据模型](registry/README.md) |
| Web | 内容图谱如何生成双语、可搜索的网站？ | [运行网页](apps/web/README.md) |

### v0.1 公开预览已包含

- 6 篇可运行的双语长文教程，每篇都包含心智模型、逐步实现、失败模式、分级练习、生产边界与完整源码；
- 14 个跨 Agent Mechanism；
- 5 个 Agent Profile、9 个不可变 Snapshot 和 30 条已审查 Claim；
- Codex、Pi、Reasonix 的固定 commit 源码地图；
- Claude Code 基于官方文档的 clean-room Snapshot；
- 1 项受控实验、2 条 reproduced Trace 和结构化 Result；
- 数据驱动路由、双语全文搜索和交互式 Trace Player；
- Schema、内容图谱、digest、trace、链接、发布安全和网站构建校验。

## 快速开始

课程与当前受控实验均为确定性实现，不需要模型账号或 API Key。Python 3.12+、Node.js 22.13+ 与 CI 环境一致。

```bash
git clone https://github.com/vpromise/inside-coding-agents.git
cd inside-coding-agents

python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements-dev.txt

# 构建最小 Agent Loop，并输出 Trace 0.1 事件。
python -m curriculum.lessons.s01_agent_loop.demo

# 只检查已提交实验，不修改文件。
python labs/runner.py reference-tool-roundtrip-v1 --check

# 校验 Schema、证据链接、图谱引用、digest 和 trace。
python scripts/validate_registry.py
```

运行交互网站：

```bash
cd apps/web
npm ci
npm run dev
```

运行完整本地质量门禁：

```bash
python -m unittest discover -s scripts/tests -v
python -m unittest discover -s curriculum/tests -v
python -m unittest discover -s labs/tests -v
python labs/runner.py reference-tool-roundtrip-v1 --check
python scripts/validate_registry.py

cd apps/web
npm run audit:ci
npm run lint
npm run typecheck
npm test
```

## Agent 覆盖

Atlas 是版本化的证据索引，不是热度排行，也不是 Benchmark 榜单。

| Agent | 证据边界 | Snapshot | 已审查 Claim |
| --- | --- | ---: | ---: |
| Claude Code | 官方文档；clean-room 边界 | 1 | 3 |
| Codex | 固定版本的公开源码与官方文档 | 3 | 9 |
| Pi | 固定版本的公开源码 | 2 | 8 |
| Reasonix | 固定版本的公开源码 | 2 | 9 |
| Reference Harness | 本仓库源码与受控复现 | 1 | 1 |

每条架构 Claim 都绑定具体 Agent Snapshot 和至少一项 Evidence：

- `source`：固定到 commit 的公开源码位置；
- `official-doc`：厂商或项目的第一方正式文档；
- `reproduced`：在固定、可检查实验中的观察结果；
- `inference`：显式标记、写明不确定性的解释。

闭源产品的外部行为不会被写成内部实现事实。在证据允许的范围内，项目会明确区分模型能力、产品默认行为和 Harness 设计。

## 内容图谱如何工作

```text
Mechanism
  ├── 课程与可运行参考实现
  ├── Agent 实现与版本化 Snapshot
  ├── 原子 Claim 与公开 Evidence
  ├── Experiment、Result 与规范化 Trace
  └── 双语页面与搜索条目
```

Stable ID 连接整张图谱：Registry 是事实层，Markdown 是叙事层，网页是生成视图。新增符合 Schema 的 Agent、Claim、Mechanism 或 Experiment，不应该要求新增产品专属页面组件。

## 仓库结构

```text
apps/web/                 双语、可搜索的交互网站
content/agents/           Agent 概览与 Snapshot 分析
content/mechanisms/       Mechanism 长篇解释
curriculum/               可运行课程与 Reference Harness
labs/                     Fixture、Scenario、Runner、Trace、Result
packages/trace-schema/    共享 Trace 0.1 契约
registry/                 Schema、Profile、Claim、Mechanism、Experiment
scripts/                  校验与公开发布安全门禁
```

内部任务规划、私有研究 checkout、部署绑定、凭证和未脱敏 Trace 不属于这个公开仓库。

## 常见问题

### 什么是 Agent Harness？

Agent Harness 是模型外围负责控制循环、消息、工具、状态、上下文、执行策略、工作区副作用、可观测性和结束条件的系统。模型是核心组件，但模型本身并不是完整的 Agent。

### 这是一个生产级 Agent Framework 吗？

目前不是。Reference Harness 刻意保持小而确定，让每个机制都容易阅读和实验。它是教学与实验基础设施，不代表生产就绪。

### 这是 Codex 和 Claude Code 的对比 Benchmark 吗？

不是。当前 Lab 使用受控 Reference Harness 验证研究链路。只有当对象、版本、权限、环境和可观测边界真正可比时，项目才会发布跨产品实验结论。

### 可以加入其他 Coding Agent 吗？

可以。先建立版本化 Profile，把原子 Claim 绑定到公开 Evidence，明确闭源与推断边界；只有在合理时再加入可复现实验。具体流程见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 贡献与安全

我们欢迎有更强证据的纠错、独立复现、新 Mechanism、可运行课程、无障碍改进和经过技术审校的翻译。提交 PR 前请阅读[贡献指南](CONTRIBUTING.md)。

不要公开凭证、私人源码、个人数据、未脱敏的原生 Trace 或可直接利用的安全细节。漏洞请通过 [SECURITY.md](SECURITY.md) 中的私有流程报告。

## 许可与致谢

本仓库使用 [Apache License 2.0](LICENSE)。项目不复制上游大段源码，外部 Claim 会链接到原始公开证据。

项目渐进式、亲手构建的教学方式部分受到 [shareAI-lab/learn-claude-code](https://github.com/shareAI-lab/learn-claude-code) 启发。Inside Coding Agents 在此基础上扩展为产品无关的 Atlas、内容图谱和可复现实验室。
