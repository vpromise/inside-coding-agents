# s05 · Instructions 与项目发现

## 目标

理解 Harness 如何发现项目约束，以及目录层级为何必须有确定的组合顺序。

## 运行

`python3 -m curriculum.lessons.s05_instructions.demo`

示例从 workspace root 走到当前 package，按 root-to-leaf 顺序读取 `AGENTS.md`。文件大小有上限，cwd 必须位于 workspace 内。

## 练习

在 `fixture/package/child/` 添加第三层指令。验收条件：系统提示中的顺序为 root、package、child。

## 风险

项目指令本身是不可信输入。它不能自动提升权限，也不能覆盖平台安全政策或用户的更高优先级意图。
