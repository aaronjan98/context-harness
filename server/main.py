"""FastAPI application entrypoint for Context Forge."""

from pydantic import BaseModel, Field
from fastapi import FastAPI

from server.store import ConversationStore


app = FastAPI(title="Context Forge")
store = ConversationStore()


class CreateConversationRequest(BaseModel):
    """Payload for creating or opening a conversation."""

    conversation_id: str = Field(min_length=1, pattern=r"^[a-zA-Z0-9_-]+$")


class AppendMessageRequest(BaseModel):
    """Payload for appending a message to the active thread."""

    role: str = Field(min_length=1)
    agent: str = Field(min_length=1)
    content: str = Field(min_length=1)
    message_format: str = Field(default="markdown", min_length=1)


def serialize_message(message: object) -> dict[str, object]:
    """Return a JSON-friendly message payload."""
    return {
        "id": message.id,
        "parent_id": message.parent_id,
        "role": message.role,
        "agent": message.agent,
        "timestamp": message.timestamp,
        "format": message.format,
        "attachments": message.attachments,
        "content": message.content,
    }


def create_app(conversation_store: ConversationStore | None = None) -> FastAPI:
    """Create the FastAPI app with an injectable conversation store."""
    app = FastAPI(title="Context Forge")
    store = conversation_store or ConversationStore()

    @app.get("/health")
    async def health() -> dict[str, str]:
        """Simple health check for early scaffolding."""
        return {"status": "ok"}

    @app.post("/api/conversations")
    async def create_conversation(
        payload: CreateConversationRequest,
    ) -> dict[str, object]:
        """Create a conversation layout if needed and return its metadata."""
        store.initialize_conversation(payload.conversation_id)
        return store.conversation_summary(payload.conversation_id)

    @app.get("/api/conversations/{conversation_id}")
    async def get_conversation(conversation_id: str) -> dict[str, object]:
        """Return basic metadata for one conversation."""
        return store.conversation_summary(conversation_id)

    @app.get("/api/conversations/{conversation_id}/thread")
    async def get_active_thread(conversation_id: str) -> dict[str, object]:
        """Return the active thread from root to active message."""
        thread = store.active_thread(conversation_id)
        return {
            "conversation": store.conversation_summary(conversation_id),
            "messages": [serialize_message(message) for message in thread],
        }

    @app.post("/api/conversations/{conversation_id}/messages")
    async def append_message(
        conversation_id: str,
        payload: AppendMessageRequest,
    ) -> dict[str, object]:
        """Append one message to the active thread and return the updated thread."""
        store.append_message(
            conversation_id,
            role=payload.role,
            agent=payload.agent,
            content=payload.content,
            message_format=payload.message_format,
        )
        return await get_active_thread(conversation_id)

    return app


app = create_app()
