"""Unit tests for the file-first conversation store."""

from pathlib import Path

import yaml

from server.store import ConversationStore


def test_default_store_location_lives_under_documents() -> None:
    store = ConversationStore()

    assert store.base_dir == Path.home() / "Documents" / "context-harness" / "conversations"


def test_initialize_conversation_creates_expected_layout(store: ConversationStore) -> None:
    conversation_id = "unit-layout"

    paths = store.initialize_conversation(conversation_id)

    assert paths.root.is_dir()
    assert paths.messages.is_dir()
    assert paths.attachments.is_dir()
    assert paths.exports.is_dir()
    assert paths.history.is_dir()
    assert paths.conversation_file.is_file()
    assert (paths.exports / "current.md").is_file()


def test_append_message_updates_metadata_and_export(store: ConversationStore) -> None:
    conversation_id = "unit-append"
    store.initialize_conversation(conversation_id)

    first = store.append_message(
        conversation_id,
        role="user",
        agent="human",
        content="How should this app persist threads?",
    )
    second = store.append_message(
        conversation_id,
        role="assistant",
        agent="claude",
        content="It should use one file per message.",
    )

    metadata = store.load_conversation_metadata(conversation_id)
    thread = store.active_thread(conversation_id)
    export_text = (store.paths_for(conversation_id).exports / "current.md").read_text(
        encoding="utf-8"
    )

    assert first.id == "m0001"
    assert second.id == "m0002"
    assert second.parent_id == "m0001"
    assert metadata.root_message_id == "m0001"
    assert metadata.active_message_id == "m0002"
    assert [message.id for message in thread] == ["m0001", "m0002"]
    assert "## User" in export_text
    assert "## claude" in export_text
    assert "one file per message" in export_text


def test_append_user_message_autotitles_placeholder_conversation(
    store: ConversationStore,
) -> None:
    conversation_id = "unit-autotitle"
    store.initialize_conversation(conversation_id)

    store.append_message(
        conversation_id,
        role="user",
        agent="human",
        content="How do context harnesses differ from agent harnesses?\nMore detail.",
    )

    metadata = store.load_conversation_metadata(conversation_id)
    assert metadata.title == "How do context harnesses differ from agent harnesses?"


def test_append_user_message_keeps_manual_title(store: ConversationStore) -> None:
    conversation_id = "unit-manual-title"
    store.initialize_conversation(conversation_id)
    store.update_conversation_title(conversation_id, "Research planning")

    store.append_message(
        conversation_id,
        role="user",
        agent="human",
        content="This should not replace the manual title.",
    )

    metadata = store.load_conversation_metadata(conversation_id)
    assert metadata.title == "Research planning"


def test_read_message_file_round_trips_frontmatter_and_body(store: ConversationStore) -> None:
    conversation_id = "unit-message-read"
    paths = store.initialize_conversation(conversation_id)
    message_file = paths.messages / "m0001.md"
    frontmatter = {
        "id": "m0001",
        "parent_id": None,
        "role": "assistant",
        "agent": "codex",
        "timestamp": "2026-04-18T12:00:00-07:00",
        "format": "markdown",
        "attachments": [],
    }
    message_file.write_text(
        "---\n"
        f"{yaml.safe_dump(frontmatter, sort_keys=False).strip()}\n"
        "---\n\n"
        "Structured files keep this robust.\n",
        encoding="utf-8",
    )

    record = store.read_message_file(message_file)

    assert record.id == "m0001"
    assert record.parent_id is None
    assert record.role == "assistant"
    assert record.agent == "codex"
    assert record.content == "Structured files keep this robust.\n"
