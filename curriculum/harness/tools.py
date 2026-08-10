"""Tool registry, schema checks, and a deliberately small workspace boundary."""

from __future__ import annotations

import json
import os
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Mapping

from .types import JsonObject


class ToolError(RuntimeError):
    pass


class ToolValidationError(ToolError):
    pass


class ToolExecutionError(ToolError):
    pass


Handler = Callable[[JsonObject], Any]


@dataclass(frozen=True)
class Tool:
    name: str
    description: str
    parameters: JsonObject
    handler: Handler

    def descriptor(self) -> JsonObject:
        return {
            "name": self.name,
            "description": self.description,
            "parameters": self.parameters,
        }


def _matches_type(value: Any, expected: str) -> bool:
    return {
        "string": isinstance(value, str),
        "integer": isinstance(value, int) and not isinstance(value, bool),
        "number": isinstance(value, (int, float)) and not isinstance(value, bool),
        "boolean": isinstance(value, bool),
        "object": isinstance(value, dict),
        "array": isinstance(value, list),
    }.get(expected, True)


class ToolRegistry:
    def __init__(self) -> None:
        self._tools: dict[str, Tool] = {}

    def register(self, tool: Tool) -> None:
        if tool.name in self._tools:
            raise ValueError(f"tool already registered: {tool.name}")
        self._tools[tool.name] = tool

    def descriptors(self) -> tuple[JsonObject, ...]:
        return tuple(tool.descriptor() for tool in self._tools.values())

    def execute(self, name: str, arguments: Mapping[str, Any]) -> Any:
        tool = self._tools.get(name)
        if tool is None:
            raise ToolValidationError(f"unknown tool: {name}")
        self._validate(tool.parameters, arguments)
        try:
            return tool.handler(dict(arguments))
        except ToolError:
            raise
        except Exception as exc:
            raise ToolExecutionError(f"{name} failed: {exc}") from exc

    @staticmethod
    def _validate(schema: Mapping[str, Any], arguments: Mapping[str, Any]) -> None:
        if schema.get("type") == "object" and not isinstance(arguments, Mapping):
            raise ToolValidationError("tool arguments must be an object")
        properties = schema.get("properties", {})
        required = schema.get("required", [])
        missing = [name for name in required if name not in arguments]
        if missing:
            raise ToolValidationError(f"missing required arguments: {', '.join(missing)}")
        if schema.get("additionalProperties") is False:
            extras = sorted(set(arguments) - set(properties))
            if extras:
                raise ToolValidationError(f"unknown arguments: {', '.join(extras)}")
        for name, value in arguments.items():
            expected = properties.get(name, {}).get("type")
            if expected and not _matches_type(value, expected):
                raise ToolValidationError(f"{name} must be {expected}")


class Workspace:
    """A path boundary, not an operating-system sandbox."""

    def __init__(self, root: str | Path) -> None:
        self.root = Path(root).resolve()

    def resolve(self, relative_path: str) -> Path:
        if not relative_path or Path(relative_path).is_absolute():
            raise ToolValidationError("path must be non-empty and relative")
        candidate = (self.root / relative_path).resolve()
        try:
            candidate.relative_to(self.root)
        except ValueError as exc:
            raise ToolValidationError("path escapes the workspace") from exc
        return candidate

    def read_file(self, relative_path: str, *, max_chars: int = 20_000) -> JsonObject:
        path = self.resolve(relative_path)
        content = path.read_text(encoding="utf-8")
        return {
            "path": relative_path,
            "content": content[:max_chars],
            "truncated": len(content) > max_chars,
        }

    def write_file(self, relative_path: str, content: str) -> JsonObject:
        path = self.resolve(relative_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
        return {"path": relative_path, "chars_written": len(content)}

    def replace_text(self, relative_path: str, old: str, new: str) -> JsonObject:
        path = self.resolve(relative_path)
        content = path.read_text(encoding="utf-8")
        occurrences = content.count(old)
        if occurrences != 1:
            raise ToolExecutionError(
                f"expected exactly one match, found {occurrences}"
            )
        updated = content.replace(old, new, 1)
        path.write_text(updated, encoding="utf-8")
        return {"path": relative_path, "replacements": 1}

    def run_command(
        self,
        argv: list[str],
        *,
        allowed_commands: tuple[str, ...],
        timeout_seconds: float = 5,
    ) -> JsonObject:
        if not argv or argv[0] not in allowed_commands:
            raise ToolValidationError("command is not in the lesson allowlist")
        environment = {
            "PATH": os.environ.get("PATH", ""),
            "LANG": os.environ.get("LANG", "C.UTF-8"),
        }
        completed = subprocess.run(
            argv,
            cwd=self.root,
            env=environment,
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
            check=False,
        )
        return {
            "argv": argv,
            "exit_code": completed.returncode,
            "stdout": completed.stdout,
            "stderr": completed.stderr,
        }


def workspace_tool_registry(
    workspace: Workspace,
    *,
    allow_writes: bool = False,
    allowed_commands: tuple[str, ...] = (),
) -> ToolRegistry:
    registry = ToolRegistry()
    registry.register(
        Tool(
            name="read_file",
            description="Read a UTF-8 file inside the lesson workspace.",
            parameters={
                "type": "object",
                "additionalProperties": False,
                "required": ["path"],
                "properties": {"path": {"type": "string"}},
            },
            handler=lambda args: workspace.read_file(args["path"]),
        )
    )
    if allow_writes:
        registry.register(
            Tool(
                name="write_file",
                description="Write a UTF-8 file inside the lesson workspace.",
                parameters={
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["path", "content"],
                    "properties": {
                        "path": {"type": "string"},
                        "content": {"type": "string"},
                    },
                },
                handler=lambda args: workspace.write_file(
                    args["path"], args["content"]
                ),
            )
        )
        registry.register(
            Tool(
                name="replace_text",
                description="Replace exactly one text match inside a workspace file.",
                parameters={
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["path", "old", "new"],
                    "properties": {
                        "path": {"type": "string"},
                        "old": {"type": "string"},
                        "new": {"type": "string"},
                    },
                },
                handler=lambda args: workspace.replace_text(
                    args["path"], args["old"], args["new"]
                ),
            )
        )
    if allowed_commands:
        registry.register(
            Tool(
                name="run_command",
                description="Run an argv array from the lesson allowlist without a shell.",
                parameters={
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["argv"],
                    "properties": {"argv": {"type": "array"}},
                },
                handler=lambda args: workspace.run_command(
                    args["argv"], allowed_commands=allowed_commands
                ),
            )
        )
    return registry


def encode_tool_result(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True)
