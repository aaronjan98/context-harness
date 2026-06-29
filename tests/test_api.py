"""Integration tests for the FastAPI conversation API."""


def test_create_conversation_returns_metadata(client) -> None:
    response = client.post("/api/conversations", json={"conversation_id": "api-create"})

    assert response.status_code == 200
    payload = response.json()
    assert payload["id"] == "api-create"
    assert payload["root_message_id"] is None
    assert payload["active_message_id"] is None


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
