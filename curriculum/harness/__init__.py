"""Small, dependency-free reference harness used by lessons s01-s06."""

from .context import ContextBudget, InstructionDocument, discover_instructions
from .model import ScriptedModel
from .runtime import AgentConfig, AgentRunner, RunResult
from .tools import Tool, ToolRegistry, Workspace, workspace_tool_registry
from .trace import TraceRecorder
from .types import Message, ModelTurn, ToolCall

__all__ = [
    "AgentConfig",
    "AgentRunner",
    "ContextBudget",
    "InstructionDocument",
    "Message",
    "ModelTurn",
    "RunResult",
    "ScriptedModel",
    "Tool",
    "ToolCall",
    "ToolRegistry",
    "TraceRecorder",
    "Workspace",
    "discover_instructions",
    "workspace_tool_registry",
]
