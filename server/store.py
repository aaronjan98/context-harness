"""File-first conversation storage primitives for Context Forge."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
import re
import mimetypes
import shutil
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
    auto_run: bool = False


@dataclass(slots=True)
class MessageRecord:
    """One canonical conversation message."""

    id: str
    parent_id: str | None
    role: str
    agent: str
    timestamp: str
    format: str
    attachments: list["AttachmentRecord"]
    content: str
    deleted_at: str | None = None
    source_id: str | None = None


@dataclass(slots=True)
class AttachmentRecord:
    """One file stored inside a conversation attachment directory."""

    id: str
    filename: str
    content_type: str
    size: int
    relative_path: str


@dataclass(slots=True)
class ImportedMessage:
    """One message parsed from an external Markdown transcript."""

    role: str
    agent: str
    content: str


class ConversationStore:
    """Owns canonical conversation folder layout on disk."""

    placeholder_title = "New conversation"
    imported_speaker_labels = {
        "ai",
        "assistant",
        "bot",
        "chatgpt",
        "claude",
        "codex",
        "gemini",
        "gpt",
        "grok",
        "human",
        "me",
        "model",
        "perplexity",
        "user",
        "you",
    }

    def __init__(self, base_dir: Path | None = None) -> None:
        self.base_dir = (
            base_dir or Path.home() / "Documents" / "context-harness" / "conversations"
        )

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

    def require_existing_conversation(self, conversation_id: str) -> StorePaths:
        """Return paths for an existing conversation or raise FileNotFoundError."""
        paths = self.paths_for(conversation_id)
        if not paths.conversation_file.exists():
            raise FileNotFoundError(f"Conversation not found: {conversation_id}")
        return paths

    def default_conversation_metadata(self, conversation_id: str) -> str:
        """Return starter YAML for a new conversation file."""
        created_at = datetime.now().astimezone().isoformat(timespec="seconds")
        return (
            f"id: {conversation_id}\n"
            f"title: {self.placeholder_title}\n"
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
        paths = self.require_existing_conversation(conversation_id)
        values = self.parse_yaml_mapping(
            paths.conversation_file.read_text(encoding="utf-8")
        )
        return ConversationMetadata(
            id=str(values.get("id") or conversation_id),
            title=str(values.get("title") or conversation_id),
            created_at=str(values.get("created_at") or ""),
            root_message_id=self._optional_string(values.get("root_message_id")),
            active_message_id=self._optional_string(values.get("active_message_id")),
            auto_run=bool(values.get("auto_run", False)),
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
            "auto_run": metadata.auto_run,
            "paths": {
                "root": str(paths.root),
                "conversation_file": str(paths.conversation_file),
                "current_export": str(paths.exports / "current.md"),
            },
        }

    def list_conversations(self) -> list[dict[str, Any]]:
        """Return summaries for every initialized conversation."""
        if not self.base_dir.exists():
            return []

        summaries: list[dict[str, Any]] = []
        for conversation_dir in sorted(self.base_dir.iterdir()):
            if not conversation_dir.is_dir():
                continue
            if not (conversation_dir / "conversation.yaml").exists():
                continue
            summaries.append(self.conversation_summary(conversation_dir.name))
        return sorted(
            summaries,
            key=lambda summary: str(summary["created_at"]),
            reverse=True,
        )

    def update_conversation_title(
        self, conversation_id: str, title: str
    ) -> dict[str, Any]:
        """Update conversation title metadata and return the new summary."""
        paths = self.require_existing_conversation(conversation_id)
        metadata = self.load_conversation_metadata(conversation_id)
        metadata.title = title
        self.write_conversation_metadata(paths, metadata)
        return self.conversation_summary(conversation_id)

    def update_conversation_auto_run(
        self, conversation_id: str, auto_run: bool
    ) -> dict[str, Any]:
        """Set per-conversation auto-run and return the updated summary."""
        paths = self.require_existing_conversation(conversation_id)
        metadata = self.load_conversation_metadata(conversation_id)
        metadata.auto_run = auto_run
        self.write_conversation_metadata(paths, metadata)
        return self.conversation_summary(conversation_id)

    def delete_conversation(self, conversation_id: str) -> None:
        """Remove a conversation folder and all canonical files under it."""
        paths = self.require_existing_conversation(conversation_id)
        shutil.rmtree(paths.root)

    def append_message(
        self,
        conversation_id: str,
        *,
        role: str,
        agent: str,
        content: str,
        message_format: str = "markdown",
        attachment_ids: list[str] | None = None,
        source_id: str | None = None,
    ) -> MessageRecord:
        """Append one message to the active thread and refresh metadata/export."""
        paths = self.require_existing_conversation(conversation_id)
        metadata = self.load_conversation_metadata(conversation_id)
        message_id = self.next_message_id(conversation_id)
        attachments = [
            self.load_attachment(conversation_id, attachment_id)
            for attachment_id in (attachment_ids or [])
        ]
        record = MessageRecord(
            id=message_id,
            parent_id=metadata.active_message_id,
            role=role,
            agent=agent,
            timestamp=datetime.now().astimezone().isoformat(timespec="seconds"),
            format=message_format,
            attachments=attachments,
            content=content,
            source_id=source_id,
        )
        self.write_message(paths, record)

        if metadata.root_message_id is None:
            metadata.root_message_id = record.id
        metadata.active_message_id = record.id
        if role == "user" and self.should_autotitle(metadata, conversation_id):
            metadata.title = self.title_from_message(content)
        self.write_conversation_metadata(paths, metadata)
        self.write_current_export(paths, self.active_thread(conversation_id))
        return record

    def import_markdown(self, conversation_id: str, content: str) -> list[MessageRecord]:
        """Import a Markdown transcript as canonical messages."""
        imported_messages = self.parse_markdown_import(content)
        records: list[MessageRecord] = []
        for message in imported_messages:
            records.append(
                self.append_message(
                    conversation_id,
                    role=message.role,
                    agent=message.agent,
                    content=message.content,
                )
            )
        return records

    def save_attachment(
        self,
        conversation_id: str,
        *,
        filename: str,
        content_type: str | None,
        data: bytes,
    ) -> AttachmentRecord:
        """Persist an uploaded attachment inside one conversation folder."""
        paths = self.require_existing_conversation(conversation_id)
        attachment_id = self.next_attachment_id(conversation_id)
        attachment_dir = paths.attachments / attachment_id
        attachment_dir.mkdir(parents=True, exist_ok=False)

        stored_file = attachment_dir / "file"
        stored_file.write_bytes(data)

        record = AttachmentRecord(
            id=attachment_id,
            filename=self.safe_filename(filename),
            content_type=content_type
            or mimetypes.guess_type(filename)[0]
            or "application/octet-stream",
            size=len(data),
            relative_path=f"attachments/{attachment_id}/file",
        )
        self.write_attachment_metadata(attachment_dir, record)
        return record

    def next_attachment_id(self, conversation_id: str) -> str:
        """Allocate the next stable attachment id for a conversation."""
        paths = self.require_existing_conversation(conversation_id)
        existing = sorted(paths.attachments.glob("a[0-9][0-9][0-9][0-9]"))
        if not existing:
            return "a0001"
        last_index = max(int(path.name[1:]) for path in existing)
        return f"a{last_index + 1:04d}"

    def load_attachment(
        self, conversation_id: str, attachment_id: str
    ) -> AttachmentRecord:
        """Load one attachment metadata record."""
        paths = self.require_existing_conversation(conversation_id)
        if not self.valid_attachment_id(attachment_id):
            raise FileNotFoundError(f"Attachment not found: {attachment_id}")

        metadata_file = paths.attachments / attachment_id / "metadata.yaml"
        if not metadata_file.exists():
            raise FileNotFoundError(f"Attachment not found: {attachment_id}")
        values = self.parse_yaml_mapping(metadata_file.read_text(encoding="utf-8"))
        return self.attachment_from_mapping(values)

    def attachment_path(self, conversation_id: str, attachment_id: str) -> Path:
        """Return the stored file path for one attachment."""
        attachment = self.load_attachment(conversation_id, attachment_id)
        paths = self.paths_for(conversation_id)
        path = paths.root / attachment.relative_path
        if not path.exists() or not path.is_file():
            raise FileNotFoundError(f"Attachment file not found: {attachment_id}")
        return path

    def update_message_content(
        self,
        conversation_id: str,
        message_id: str,
        content: str,
    ) -> MessageRecord:
        """Rewrite one message body while preserving its metadata."""
        paths = self.require_existing_conversation(conversation_id)
        if not self.valid_message_id(message_id):
            raise FileNotFoundError(f"Message not found: {message_id}")

        message_file = paths.messages / f"{message_id}.md"
        if not message_file.exists():
            raise FileNotFoundError(f"Message not found: {message_id}")

        record = self.read_message_file(message_file)
        record.content = content
        self.write_message(paths, record)
        self.write_current_export(paths, self.active_thread(conversation_id))
        return record

    def insert_message_near(
        self,
        conversation_id: str,
        message_id: str,
        *,
        position: str,
        role: str,
        agent: str,
        content: str,
        message_format: str = "markdown",
    ) -> MessageRecord:
        """Insert a new message before or after an active-thread message."""
        if position not in {"before", "after"}:
            raise ValueError("position must be 'before' or 'after'")

        paths = self.require_existing_conversation(conversation_id)
        if not self.valid_message_id(message_id):
            raise FileNotFoundError(f"Message not found: {message_id}")

        metadata = self.load_conversation_metadata(conversation_id)
        thread = self.active_thread(conversation_id)
        index = next(
            (current for current, message in enumerate(thread) if message.id == message_id),
            None,
        )
        if index is None:
            raise FileNotFoundError(f"Message not found: {message_id}")

        target = thread[index]
        next_message = thread[index + 1] if index + 1 < len(thread) else None
        new_record = MessageRecord(
            id=self.next_message_id(conversation_id),
            parent_id=target.parent_id if position == "before" else target.id,
            role=role,
            agent=agent,
            timestamp=datetime.now().astimezone().isoformat(timespec="seconds"),
            format=message_format,
            attachments=[],
            content=content,
        )

        if position == "before":
            target.parent_id = new_record.id
            self.write_message(paths, target)
            if metadata.root_message_id == target.id:
                metadata.root_message_id = new_record.id
        elif next_message is not None:
            next_message.parent_id = new_record.id
            self.write_message(paths, next_message)
        else:
            metadata.active_message_id = new_record.id

        self.write_message(paths, new_record)
        if metadata.root_message_id is None:
            metadata.root_message_id = new_record.id
        if metadata.active_message_id is None:
            metadata.active_message_id = new_record.id
        self.write_conversation_metadata(paths, metadata)
        self.write_current_export(paths, self.active_thread(conversation_id))
        return new_record

    def delete_message_from_thread(
        self,
        conversation_id: str,
        message_id: str,
    ) -> MessageRecord:
        """Soft-delete one active-thread message and stitch the chain around it."""
        paths = self.require_existing_conversation(conversation_id)
        if not self.valid_message_id(message_id):
            raise FileNotFoundError(f"Message not found: {message_id}")

        metadata = self.load_conversation_metadata(conversation_id)
        thread = self.active_thread(conversation_id)
        index = next(
            (current for current, message in enumerate(thread) if message.id == message_id),
            None,
        )
        if index is None:
            raise FileNotFoundError(f"Message not found: {message_id}")

        target = thread[index]
        previous_id = target.parent_id
        next_message = thread[index + 1] if index + 1 < len(thread) else None

        if next_message is not None:
            next_message.parent_id = previous_id
            self.write_message(paths, next_message)
            if metadata.root_message_id == target.id:
                metadata.root_message_id = next_message.id
        else:
            metadata.active_message_id = previous_id
            if metadata.root_message_id == target.id:
                metadata.root_message_id = None

        target.deleted_at = datetime.now().astimezone().isoformat(timespec="seconds")
        self.write_message(paths, target)
        self.write_conversation_metadata(paths, metadata)
        self.write_current_export(paths, self.active_thread(conversation_id))
        return target

    def parse_markdown_import(self, content: str) -> list[ImportedMessage]:
        """Parse common Markdown transcript shapes into messages."""
        heading_messages = self.parse_heading_transcript(content)
        if heading_messages:
            return heading_messages

        prefixed_messages = self.parse_prefixed_transcript(content)
        if prefixed_messages:
            return prefixed_messages

        return self.parse_paragraph_transcript(content)

    def parse_heading_transcript(self, content: str) -> list[ImportedMessage]:
        """Parse transcript blocks headed by Markdown speaker headings."""
        messages: list[ImportedMessage] = []
        current_speaker: str | None = None
        current_lines: list[str] = []

        for line in content.splitlines():
            speaker = self.speaker_from_heading(line)
            if speaker is not None:
                self.add_imported_message(messages, current_speaker, current_lines)
                current_speaker = speaker
                current_lines = []
                continue
            current_lines.append(line)

        self.add_imported_message(messages, current_speaker, current_lines)
        return messages

    def parse_prefixed_transcript(self, content: str) -> list[ImportedMessage]:
        """Parse transcript blocks beginning with `Speaker:` lines."""
        messages: list[ImportedMessage] = []
        current_speaker: str | None = None
        current_lines: list[str] = []

        for line in content.splitlines():
            speaker, first_line = self.split_speaker_prefix(line)
            if speaker is not None:
                self.add_imported_message(messages, current_speaker, current_lines)
                current_speaker = speaker
                current_lines = [first_line] if first_line else []
                continue
            current_lines.append(line)

        self.add_imported_message(messages, current_speaker, current_lines)
        return messages

    def parse_paragraph_transcript(self, content: str) -> list[ImportedMessage]:
        """Fallback: treat each non-empty paragraph as a user message."""
        paragraphs = [block.strip() for block in re.split(r"\n\s*\n", content)]
        return [
            ImportedMessage(role="user", agent="human", content=paragraph)
            for paragraph in paragraphs
            if paragraph
        ]

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
        paths = self.require_existing_conversation(conversation_id)
        messages: dict[str, MessageRecord] = {}
        for message_file in sorted(paths.messages.glob("*.md")):
            record = self.read_message_file(message_file)
            messages[record.id] = record
        return messages

    def next_message_id(self, conversation_id: str) -> str:
        """Allocate the next stable message id for a conversation."""
        paths = self.require_existing_conversation(conversation_id)
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
            "attachments": [
                self.attachment_to_mapping(attachment)
                for attachment in record.attachments
            ],
        }
        if record.deleted_at is not None:
            frontmatter["deleted_at"] = record.deleted_at
        if record.source_id is not None:
            frontmatter["source_id"] = record.source_id
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
            attachments=[
                self.attachment_from_frontmatter_item(item)
                for item in attachments
            ],
            content=content,
            deleted_at=self._optional_string(
                self._to_optional_text(values.get("deleted_at"))
            ),
            source_id=self._optional_string(
                self._to_optional_text(values.get("source_id"))
            ),
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
        payload: dict[str, Any] = {
            "id": metadata.id,
            "title": metadata.title,
            "created_at": metadata.created_at,
            "root_message_id": metadata.root_message_id,
            "active_message_id": metadata.active_message_id,
        }
        if metadata.auto_run:
            payload["auto_run"] = True
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
            attachment_lines = [
                f"- [{attachment.filename}]({attachment.relative_path})"
                for attachment in message.attachments
            ]
            attachments = (
                "\n\n> [!attachment]\n"
                + "\n".join(f"> {line}" for line in attachment_lines)
                if attachment_lines
                else ""
            )
            sections.append(f"## {speaker}\n{message.content}{attachments}".strip())
        export_text = "\n\n".join(sections)
        (paths.exports / "current.md").write_text(export_text, encoding="utf-8")

    def write_attachment_metadata(
        self, attachment_dir: Path, record: AttachmentRecord
    ) -> None:
        """Persist attachment metadata next to the stored file."""
        (attachment_dir / "metadata.yaml").write_text(
            yaml.safe_dump(self.attachment_to_mapping(record), sort_keys=False),
            encoding="utf-8",
        )

    @staticmethod
    def attachment_to_mapping(record: AttachmentRecord) -> dict[str, Any]:
        """Convert attachment metadata to a YAML/JSON-friendly mapping."""
        return {
            "id": record.id,
            "filename": record.filename,
            "content_type": record.content_type,
            "size": record.size,
            "relative_path": record.relative_path,
        }

    @classmethod
    def attachment_from_mapping(cls, values: dict[str, Any]) -> AttachmentRecord:
        """Convert stored metadata into an attachment record."""
        attachment_id = str(values.get("id") or "")
        if not cls.valid_attachment_id(attachment_id):
            raise ValueError("Invalid attachment metadata id")
        return AttachmentRecord(
            id=attachment_id,
            filename=cls.safe_filename(str(values.get("filename") or "attachment")),
            content_type=str(values.get("content_type") or "application/octet-stream"),
            size=int(values.get("size") or 0),
            relative_path=str(values.get("relative_path") or f"attachments/{attachment_id}/file"),
        )

    @classmethod
    def attachment_from_frontmatter_item(cls, item: Any) -> AttachmentRecord:
        """Read both structured and legacy string attachment frontmatter."""
        if isinstance(item, dict):
            return cls.attachment_from_mapping(item)

        legacy_id = str(item)
        return AttachmentRecord(
            id=legacy_id,
            filename=legacy_id,
            content_type="application/octet-stream",
            size=0,
            relative_path=legacy_id,
        )

    def add_imported_message(
        self,
        messages: list[ImportedMessage],
        speaker: str | None,
        lines: list[str],
    ) -> None:
        """Append a parsed message when both speaker and content are present."""
        if speaker is None:
            return
        content = "\n".join(lines).strip()
        if not content:
            return
        role, agent = self.normalize_imported_speaker(speaker)
        messages.append(ImportedMessage(role=role, agent=agent, content=content))

    @staticmethod
    def speaker_from_heading(line: str) -> str | None:
        """Return speaker text from a simple Markdown heading, if present."""
        match = re.match(r"^\s{0,3}#{1,6}\s+(.+?)\s*$", line)
        if not match:
            return None
        speaker = match.group(1).strip().rstrip(":")
        return speaker if ConversationStore.is_imported_speaker_label(speaker) else None

    @staticmethod
    def split_speaker_prefix(line: str) -> tuple[str | None, str]:
        """Split `Speaker: content` transcript lines."""
        match = re.match(r"^\s{0,3}([A-Za-z][A-Za-z0-9 _.-]{0,40}):\s*(.*)$", line)
        if not match:
            return None, line
        speaker = match.group(1).strip()
        if not ConversationStore.is_imported_speaker_label(speaker):
            return None, line
        return speaker, match.group(2).strip()

    @classmethod
    def is_imported_speaker_label(cls, speaker: str) -> bool:
        """Return whether loose transcript text looks like a speaker label."""
        normalized = speaker.strip().lower()
        return normalized in cls.imported_speaker_labels

    @staticmethod
    def normalize_imported_speaker(speaker: str) -> tuple[str, str]:
        """Map loose transcript speaker names onto role/agent metadata."""
        normalized = speaker.strip().lower()
        if normalized in {"user", "human", "me", "you"}:
            return "user", "human"
        if normalized in {"assistant", "ai", "bot", "model"}:
            return "assistant", "imported"
        return "assistant", normalized.replace(" ", "-")

    def should_autotitle(
        self, metadata: ConversationMetadata, conversation_id: str
    ) -> bool:
        """Return whether a user message should replace the current title."""
        return metadata.title in {conversation_id, self.placeholder_title}

    @staticmethod
    def title_from_message(content: str) -> str:
        """Create a compact sidebar title from the first non-empty message line."""
        title = next(
            (line.strip() for line in content.splitlines() if line.strip()),
            "New conversation",
        )
        return title if len(title) <= 64 else f"{title[:61]}..."

    @staticmethod
    def safe_filename(filename: str) -> str:
        """Return a display-safe basename for an uploaded file."""
        safe = Path(filename).name.strip()
        return safe or "attachment"

    @staticmethod
    def valid_attachment_id(attachment_id: str) -> bool:
        """Return whether an attachment id matches the app-controlled format."""
        return re.fullmatch(r"a\d{4}", attachment_id) is not None

    @staticmethod
    def valid_message_id(message_id: str) -> bool:
        """Return whether a message id matches the app-controlled format."""
        return re.fullmatch(r"m\d{4}", message_id) is not None

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
