"""Integration tests for the FastAPI conversation API."""


def test_docs_route_uses_context_forge_theme(client) -> None:
    response = client.get("/docs")

    assert response.status_code == 200
    assert "Context Forge - API Docs" in response.text
    assert "--cf-bg" in response.text


def test_create_conversation_returns_metadata(client) -> None:
    response = client.post("/api/conversations", json={"conversation_id": "api-create"})

    assert response.status_code == 200
    payload = response.json()
    assert payload["id"] == "api-create"
    assert payload["root_message_id"] is None
    assert payload["active_message_id"] is None


def test_read_missing_conversation_does_not_create_it(client, store) -> None:
    response = client.get("/api/conversations/missing-thread")

    assert response.status_code == 404
    assert not store.conversation_dir("missing-thread").exists()


def test_read_missing_thread_does_not_create_conversation(client, store) -> None:
    response = client.get("/api/conversations/missing-thread/thread")

    assert response.status_code == 404
    assert not store.conversation_dir("missing-thread").exists()


def test_append_missing_conversation_does_not_create_it(client, store) -> None:
    response = client.post(
        "/api/conversations/missing-thread/messages",
        json={"role": "user", "content": "Do not create this implicitly."},
    )

    assert response.status_code == 404
    assert not store.conversation_dir("missing-thread").exists()


def test_create_conversation_accepts_title_and_list_returns_summaries(client) -> None:
    first = client.post(
        "/api/conversations",
        json={"conversation_id": "api-first", "title": "First API Thread"},
    )
    second = client.post("/api/conversations", json={"conversation_id": "api-second"})
    listed = client.get("/api/conversations")

    assert first.status_code == 200
    assert second.status_code == 200
    assert listed.status_code == 200

    payload = listed.json()
    assert {conversation["id"] for conversation in payload} == {
        "api-first",
        "api-second",
    }
    first_summary = next(
        conversation for conversation in payload if conversation["id"] == "api-first"
    )
    assert first_summary["title"] == "First API Thread"
    assert first_summary["paths"]["current_export"].endswith(
        "api-first/exports/current.md"
    )


def test_rename_conversation_updates_metadata(client) -> None:
    client.post("/api/conversations", json={"conversation_id": "api-rename"})

    renamed = client.patch(
        "/api/conversations/api-rename",
        json={"title": "Renamed Thread"},
    )
    fetched = client.get("/api/conversations/api-rename")

    assert renamed.status_code == 200
    assert fetched.status_code == 200
    assert renamed.json()["title"] == "Renamed Thread"
    assert fetched.json()["title"] == "Renamed Thread"


def test_delete_conversation_removes_folder_and_list_entry(client, store) -> None:
    client.post("/api/conversations", json={"conversation_id": "api-delete"})

    deleted = client.delete("/api/conversations/api-delete")
    listed = client.get("/api/conversations")

    assert deleted.status_code == 204
    assert not store.conversation_dir("api-delete").exists()
    assert listed.status_code == 200
    assert all(conversation["id"] != "api-delete" for conversation in listed.json())


def test_delete_missing_conversation_does_not_create_it(client, store) -> None:
    deleted = client.delete("/api/conversations/missing-delete")

    assert deleted.status_code == 404
    assert not store.conversation_dir("missing-delete").exists()


def test_append_user_message_defaults_agent_to_human(client) -> None:
    client.post("/api/conversations", json={"conversation_id": "api-default-agent"})

    response = client.post(
        "/api/conversations/api-default-agent/messages",
        json={
            "role": "user",
            "content": "This came from the browser UI.",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["messages"][0]["agent"] == "human"
    assert payload["messages"][0]["content"] == "This came from the browser UI."


def test_append_message_returns_updated_thread_and_persists(client) -> None:
    client.post("/api/conversations", json={"conversation_id": "api-thread"})

    first = client.post(
        "/api/conversations/api-thread/messages",
        json={
            "role": "user",
            "agent": "human",
            "content": "Explain the storage model.",
        },
    )
    second = client.post(
        "/api/conversations/api-thread/messages",
        json={
            "role": "assistant",
            "agent": "codex",
            "content": "Each message is a file with frontmatter.",
        },
    )
    thread = client.get("/api/conversations/api-thread/thread")

    assert first.status_code == 200
    assert second.status_code == 200
    assert thread.status_code == 200

    payload = thread.json()
    assert payload["conversation"]["root_message_id"] == "m0001"
    assert payload["conversation"]["active_message_id"] == "m0002"
    assert [message["id"] for message in payload["messages"]] == ["m0001", "m0002"]
    assert payload["messages"][1]["parent_id"] == "m0001"
    assert payload["messages"][1]["content"] == "Each message is a file with frontmatter."


def test_upload_attachment_and_attach_to_message(client) -> None:
    client.post("/api/conversations", json={"conversation_id": "api-attachments"})

    upload = client.post(
        "/api/conversations/api-attachments/attachments",
        files={"file": ("notes.md", b"# Notes\n", "text/markdown")},
    )
    assert upload.status_code == 200
    attachment = upload.json()
    assert attachment["id"] == "a0001"
    assert attachment["filename"] == "notes.md"
    assert attachment["content_type"] == "text/markdown"
    assert attachment["preview_url"].endswith("/attachments/a0001")
    assert attachment["download_url"].endswith("/attachments/a0001/download")

    appended = client.post(
        "/api/conversations/api-attachments/messages",
        json={
            "role": "user",
            "content": "See attached notes.",
            "attachment_ids": ["a0001"],
        },
    )
    assert appended.status_code == 200
    message = appended.json()["messages"][0]
    assert message["attachments"][0]["id"] == "a0001"
    assert message["attachments"][0]["filename"] == "notes.md"

    preview = client.get("/api/conversations/api-attachments/attachments/a0001")
    download = client.get(
        "/api/conversations/api-attachments/attachments/a0001/download"
    )

    assert preview.status_code == 200
    assert preview.content == b"# Notes\n"
    assert "inline" in preview.headers["content-disposition"]
    assert download.status_code == 200
    assert "attachment" in download.headers["content-disposition"]


def test_upload_attachment_missing_conversation_does_not_create_it(client, store) -> None:
    response = client.post(
        "/api/conversations/missing-attachments/attachments",
        files={"file": ("notes.md", b"# Notes\n", "text/markdown")},
    )

    assert response.status_code == 404
    assert not store.conversation_dir("missing-attachments").exists()


def test_import_markdown_returns_updated_thread(client) -> None:
    client.post("/api/conversations", json={"conversation_id": "api-import"})

    response = client.post(
        "/api/conversations/api-import/imports/markdown",
        json={
            "content": (
                "## User\nCan this import web chat Markdown?\n\n"
                "## ChatGPT\nYes, as canonical messages."
            ),
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["conversation"]["root_message_id"] == "m0001"
    assert payload["conversation"]["active_message_id"] == "m0002"
    assert [message["role"] for message in payload["messages"]] == [
        "user",
        "assistant",
    ]
    assert payload["messages"][1]["agent"] == "chatgpt"
    assert payload["messages"][1]["content"] == "Yes, as canonical messages."


def test_import_markdown_missing_conversation_does_not_create_it(client, store) -> None:
    response = client.post(
        "/api/conversations/missing-import/imports/markdown",
        json={"content": "User: Do not create this."},
    )

    assert response.status_code == 404
    assert not store.conversation_dir("missing-import").exists()
