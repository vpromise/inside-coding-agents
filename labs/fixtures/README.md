# Fixtures

Fixture 是实验开始前固定的代码库与环境基线。每个 fixture 必须有稳定 ID、许可证、来源、内容校验和、重置方法和预期验收命令；不得包含凭证或私人数据。

目录 digest 使用 `labs/runner.py` 的规范算法：按相对 POSIX 路径排序，并对每个文件哈希 `relative_path + NUL + bytes + NUL`。不允许 symlink。正式运行复制 fixture 到临时目录，不能直接修改规范输入。
