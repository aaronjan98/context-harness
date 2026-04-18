"""Integration tests for the FastAPI conversation API."""


def test_create_conversation_returns_metadata(client) -> None:
    response = client.post("/api/conversations", json={"conversation_id": "api-create"})

    assert response.status_code == 200
    payload = response.json()
    assert payload["id"] == "api-create"
    assert payload["root_message_id"] is None
    assert payload["active_message_id"] is None


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
