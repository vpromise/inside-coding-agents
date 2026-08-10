# s04 · File、Shell 与 Edit Tools

## 目标

为产生副作用的工具建立最小工作区边界，并区分路径检查与真正的 OS sandbox。

## 运行

`python3 -m curriculum.lessons.s04_workspace_tools.demo`

`Workspace.resolve` 拒绝绝对路径和 `../` 逃逸；command tool 不经过 shell，并要求显式 executable allowlist；edit 只有在旧文本恰好出现一次时执行。

## 练习

尝试读取 `../README.md`。验收条件：在任何文件读取发生前得到 `ToolValidationError`。

## 安全边界

路径约束不能限制子进程、symlink race、网络或系统调用。生产实现仍需要独立 sandbox、权限提示和项目可信度判断。
