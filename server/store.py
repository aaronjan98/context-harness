"""File-first conversation storage primitives for agent-display."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

import yaml


@dataclass(slots=True)
class StorePaths:
    """Resolved filesystem layout for one conversation folder."""

    root: Path
    messages: Path
    attachments: Path
    exports: Path
    history: Path
    conversation_file: Path


@dataclass(slots=True)
class ConversationMetadata:
    """Conversation-level metadata loaded from disk."""

    id: str
    title: str
    created_at: str
    root_message_id: str | None
    active_message_id: str | None


class ConversationStore:
    """Owns canonical conversation folder layout on disk."""

    def __init__(self, base_dir: Path | None = None) -> None:
        self.base_dir = base_dir or Path.home() / "Repositories" / "conversations"

    def conversation_dir(self, conversation_id: str) -> Path:
        """Return the folder path for a conversation id."""
        return self.base_dir / conversation_id

    def paths_for(self, conversation_id: str) -> StorePaths:
        """Return all important paths for one conversation."""
        root = self.conversation_dir(conversation_id)
        return StorePaths(
            root=root,
            messages=root / "messages",
            attachments=root / "attachments",
            exports=root / "exports",
            history=root / ".history",
            conversation_file=root / "conversation.yaml",
        )

    def ensure_layout(self, conversation_id: str) -> StorePaths:
        """Create the expected directory structure if it does not exist."""
        paths = self.paths_for(conversation_id)
        for directory in (
            paths.root,
            paths.messages,
            paths.attachments,
            paths.exports,
            paths.history,
        ):
            directory.mkdir(parents=True, exist_ok=True)
        return paths

    def default_conversation_metadata(self, conversation_id: str) -> str:
        """Return starter YAML for a new conversation file."""
        created_at = datetime.now().astimezone().isoformat(timespec="seconds")
        return (
            f"id: {conversation_id}\n"
            f"title: {conversation_id}\n"
            f"created_at: {created_at}\n"
            "root_message_id:\n"
            "active_message_id:\n"
        )

    def parse_yaml_mapping(self, text: str) -> dict[str, Any]:
        """Parse a YAML mapping from disk into a Python dictionary."""
        loaded = yaml.safe_load(text) or {}
        if not isinstance(loaded, dict):
            raise ValueError("Expected conversation metadata to be a YAML mapping")
        return loaded

    def load_conversation_metadata(self, conversation_id: str) -> ConversationMetadata:
        """Load conversation-level metadata from disk."""
        paths = self.initialize_conversation(conversation_id)
        values = self.parse_yaml_mapping(
            paths.conversation_file.read_text(encoding="utf-8")
        )
        return ConversationMetadata(
            id=str(values.get("id") or conversation_id),
            title=str(values.get("title") or conversation_id),
            created_at=str(values.get("created_at") or ""),
            root_message_id=self._optional_string(values.get("root_message_id")),
            active_message_id=self._optional_string(values.get("active_message_id")),
        )

    def conversation_summary(self, conversation_id: str) -> dict[str, Any]:
        """Return a JSON-friendly view of one conversation."""
        metadata = self.load_conversation_metadata(conversation_id)
        paths = self.paths_for(conversation_id)
        return {
            "id": metadata.id,
            "title": metadata.title,
            "created_at": metadata.created_at,
            "root_message_id": metadata.root_message_id,
            "active_message_id": metadata.active_message_id,
            "paths": {
                "root": str(paths.root),
                "conversation_file": str(paths.conversation_file),
                "current_export": str(paths.exports / "current.md"),
            },
        }

    def initialize_conversation(self, conversation_id: str) -> StorePaths:
        """Ensure layout exists and seed conversation metadata if missing."""
        paths = self.ensure_layout(conversation_id)
        if not paths.conversation_file.exists():
            paths.conversation_file.write_text(
                self.default_conversation_metadata(conversation_id),
                encoding="utf-8",
            )
        current_export = paths.exports / "current.md"
        if not current_export.exists():
            current_export.write_text("", encoding="utf-8")
        return paths

    @staticmethod
    def _optional_string(value: str | None) -> str | None:
        """Normalize empty metadata values to None."""
        return value if value else None
