# Results

这里保存允许分发的脱敏实验结果、聚合指标和报告索引。每个结果必须关联 experiment ID、run manifest、fixture/scenario 校验和和原始 trace；本地临时输出放在被忽略的 `local/` 或 `tmp/`。

正式结果使用 `experiment-result.schema.json`，每次 repetition 保存独立 `*.trace.jsonl`。`runner.py --check` 必须能够在不写文件的情况下重建并比较所有声明产物；失败运行同样保留，不得只发布成功样本。
