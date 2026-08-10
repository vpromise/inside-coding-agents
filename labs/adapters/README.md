# Adapters

Adapter 将 reference harness、Agent CLI 或 SDK 可合法观察到的原生事件转换为统一 Trace Format。它只转换事实，不补造不可见的内部事件。

每个 adapter 至少要声明支持的 Agent/surface/version、可见性边界、事件映射、脱敏规则、已知数据损失和验证 fixture。

当前 `reference-tool-roundtrip-v1` 直接运行项目自己的 Reference Harness，因此不属于 Native adapter。任何真实 Agent 的 adapter 合入前都必须保留原生事件与规范 Trace 的映射说明，且不能补造不可观察的 model、policy 或 sandbox 事件。
