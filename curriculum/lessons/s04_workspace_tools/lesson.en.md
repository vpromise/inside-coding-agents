# s04 · File, Shell, and Edit Tools

## Objective

Place a minimal workspace boundary around side-effecting tools and distinguish path checks from a real OS sandbox.

## Run

`python3 -m curriculum.lessons.s04_workspace_tools.demo`

`Workspace.resolve` rejects absolute paths and `../` escapes. The command tool avoids a shell and requires an executable allowlist. Editing proceeds only when the old text has exactly one match.

## Exercise

Try to read `../README.md`. Acceptance: a `ToolValidationError` occurs before any file read.

## Security boundary

Path containment cannot constrain subprocesses, symlink races, networks, or system calls. Production still needs a sandbox, approval policy, and project-trust decision.
