# Scenarios

Scenario 定义研究问题、输入任务、执行策略、允许权限和验收条件。Native、Controlled、Adversarial 三种模式必须分别标记，不能在汇总时混用。

可执行的 JSON Scenario 必须通过 `registry/schemas/lab-scenario.schema.json`，与 Experiment 使用同一 stable ID，并保存 prompt 原文、固定时间、turn 输入和可检查的预期结果。Scenario 不存储凭证、用户目录或隐藏 chain-of-thought。
