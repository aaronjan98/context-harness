"""File-first conversation storage primitives for agent-display."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path


@dataclass(slots=True)
class StorePaths:
    """Resolved filesystem layout for one conversation folder."""

    root: Path
    messages: Path
    attachments: Path
    exports: Path
    history: Path
    conversation_file: Path


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
