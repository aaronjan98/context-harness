"""File-first conversation storage primitives for Context Forge."""

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


@dataclass(slots=True)
class MessageRecord:
    """One canonical conversation message."""

    id: str
    parent_id: str | None
    role: str
    agent: str
    timestamp: str
    format: str
    attachments: list[str]
    content: str


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

    def append_message(
        self,
        conversation_id: str,
        *,
        role: str,
        agent: str,
        content: str,
        message_format: str = "markdown",
    ) -> MessageRecord:
        """Append one message to the active thread and refresh metadata/export."""
        paths = self.initialize_conversation(conversation_id)
        metadata = self.load_conversation_metadata(conversation_id)
        message_id = self.next_message_id(conversation_id)
        record = MessageRecord(
            id=message_id,
            parent_id=metadata.active_message_id,
            role=role,
            agent=agent,
            timestamp=datetime.now().astimezone().isoformat(timespec="seconds"),
            format=message_format,
            attachments=[],
            content=content,
        )
        self.write_message(paths, record)

        if metadata.root_message_id is None:
            metadata.root_message_id = record.id
        metadata.active_message_id = record.id
        self.write_conversation_metadata(paths, metadata)
        self.write_current_export(paths, self.active_thread(conversation_id))
        return record

    def active_thread(self, conversation_id: str) -> list[MessageRecord]:
        """Return the active linear thread from root to active message."""
        metadata = self.load_conversation_metadata(conversation_id)
        if metadata.root_message_id is None or metadata.active_message_id is None:
            return []

        messages = self.load_all_messages(conversation_id)
        ordered: list[MessageRecord] = []
        current_id = metadata.active_message_id

        while current_id is not None:
            record = messages.get(current_id)
            if record is None:
                break
            ordered.append(record)
            current_id = record.parent_id

        ordered.reverse()
        return ordered

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

    def load_all_messages(self, conversation_id: str) -> dict[str, MessageRecord]:
        """Load every canonical message file for one conversation."""
        paths = self.initialize_conversation(conversation_id)
        messages: dict[str, MessageRecord] = {}
        for message_file in sorted(paths.messages.glob("*.md")):
            record = self.read_message_file(message_file)
            messages[record.id] = record
        return messages

    def next_message_id(self, conversation_id: str) -> str:
        """Allocate the next stable message id for a conversation."""
        paths = self.initialize_conversation(conversation_id)
        existing = sorted(paths.messages.glob("m*.md"))
        if not existing:
            return "m0001"
        last_index = max(int(path.stem[1:]) for path in existing)
        return f"m{last_index + 1:04d}"

    def write_message(self, paths: StorePaths, record: MessageRecord) -> Path:
        """Write one canonical message file."""
        message_file = paths.messages / f"{record.id}.md"
        frontmatter = {
            "id": record.id,
            "parent_id": record.parent_id,
            "role": record.role,
            "agent": record.agent,
            "timestamp": record.timestamp,
            "format": record.format,
            "attachments": record.attachments,
        }
        text = (
            "---\n"
            f"{yaml.safe_dump(frontmatter, sort_keys=False).strip()}\n"
            "---\n\n"
            f"{record.content}"
        )
        message_file.write_text(text, encoding="utf-8")
        return message_file

    def read_message_file(self, path: Path) -> MessageRecord:
        """Load one message file from Markdown with YAML frontmatter."""
        text = path.read_text(encoding="utf-8")
        metadata_text, content = self.split_frontmatter(text)
        values = self.parse_yaml_mapping(metadata_text)
        attachments = values.get("attachments") or []
        if not isinstance(attachments, list):
            attachments = []
        return MessageRecord(
            id=str(values.get("id") or path.stem),
            parent_id=self._optional_string(self._to_optional_text(values.get("parent_id"))),
            role=str(values.get("role") or "assistant"),
            agent=str(values.get("agent") or "unknown"),
            timestamp=str(values.get("timestamp") or ""),
            format=str(values.get("format") or "markdown"),
            attachments=[str(item) for item in attachments],
            content=content,
        )

    def split_frontmatter(self, text: str) -> tuple[str, str]:
        """Split a Markdown file into YAML frontmatter and body."""
        if not text.startswith("---\n"):
            raise ValueError("Expected message file to start with YAML frontmatter")
        parts = text.split("\n---\n", 1)
        if len(parts) != 2:
            raise ValueError("Expected closing frontmatter delimiter")
        metadata_text = parts[0][4:]
        content = parts[1].lstrip("\n")
        return metadata_text, content

    def write_conversation_metadata(
        self, paths: StorePaths, metadata: ConversationMetadata
    ) -> None:
        """Persist conversation-level metadata back to disk."""
        payload = {
            "id": metadata.id,
            "title": metadata.title,
            "created_at": metadata.created_at,
            "root_message_id": metadata.root_message_id,
            "active_message_id": metadata.active_message_id,
        }
        paths.conversation_file.write_text(
            yaml.safe_dump(payload, sort_keys=False),
            encoding="utf-8",
        )

    def write_current_export(
        self, paths: StorePaths, thread: list[MessageRecord]
    ) -> None:
        """Regenerate the readable Markdown export for the active thread."""
        sections: list[str] = []
        for message in thread:
            speaker = message.agent if message.role != "user" else "User"
            sections.append(f"## {speaker}\n{message.content}".strip())
        export_text = "\n\n".join(sections)
        (paths.exports / "current.md").write_text(export_text, encoding="utf-8")

    @staticmethod
    def _to_optional_text(value: Any) -> str | None:
        """Normalize YAML scalar values to optional text."""
        if value is None:
            return None
        return str(value)

    @staticmethod
    def _optional_string(value: str | None) -> str | None:
        """Normalize empty metadata values to None."""
        return value if value else None
