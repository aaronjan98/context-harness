"""FastAPI application entrypoint for Context Forge."""

from pydantic import BaseModel, Field
from fastapi import FastAPI

from server.store import ConversationStore


app = FastAPI(title="Context Forge")
store = ConversationStore()


class CreateConversationRequest(BaseModel):
    """Payload for creating or opening a conversation."""

    conversation_id: str = Field(min_length=1, pattern=r"^[a-zA-Z0-9_-]+$")
    title: str | None = Field(default=None, min_length=1)


class RenameConversationRequest(BaseModel):
    """Payload for updating a conversation title."""

    title: str = Field(min_length=1)


class AppendMessageRequest(BaseModel):
    """Payload for appending a message to the active thread."""

    role: str = Field(min_length=1)
    agent: str | None = Field(default=None, min_length=1)
    content: str = Field(min_length=1)
    message_format: str | None = Field(default=None, min_length=1)


class ConversationPathsResponse(BaseModel):
    """Filesystem paths exposed for local debugging and handoff."""

    root: str
    conversation_file: str
    current_export: str


class ConversationSummaryResponse(BaseModel):
    """JSON response shape for conversation metadata."""

    id: str
    title: str
    created_at: str
    root_message_id: str | None
    active_message_id: str | None
    paths: ConversationPathsResponse


class MessageResponse(BaseModel):
    """JSON response shape for one canonical message."""

    id: str
    parent_id: str | None
    role: str
    agent: str
    timestamp: str
    format: str
    attachments: list[str]
    content: str


class ThreadResponse(BaseModel):
    """JSON response shape for an active conversation thread."""

    conversation: ConversationSummaryResponse
    messages: list[MessageResponse]


def serialize_message(message: object) -> MessageResponse:
    """Return a JSON-friendly message payload."""
    return MessageResponse(
        id=message.id,
        parent_id=message.parent_id,
        role=message.role,
        agent=message.agent,
        timestamp=message.timestamp,
        format=message.format,
        attachments=message.attachments,
        content=message.content,
    )


def create_app(conversation_store: ConversationStore | None = None) -> FastAPI:
    """Create the FastAPI app with an injectable conversation store."""
    app = FastAPI(title="Context Forge")
    store = conversation_store or ConversationStore()

    @app.get("/health")
    async def health() -> dict[str, str]:
        """Simple health check for early scaffolding."""
        return {"status": "ok"}

    @app.get(
        "/api/conversations",
        response_model=list[ConversationSummaryResponse],
    )
    async def list_conversations() -> list[dict[str, object]]:
        """Return summaries for all initialized conversations."""
        return store.list_conversations()

    @app.post(
        "/api/conversations",
        response_model=ConversationSummaryResponse,
    )
    async def create_conversation(
        payload: CreateConversationRequest,
    ) -> dict[str, object]:
        """Create a conversation layout if needed and return its metadata."""
        store.initialize_conversation(payload.conversation_id)
        if payload.title is not None:
            return store.update_conversation_title(payload.conversation_id, payload.title)
        return store.conversation_summary(payload.conversation_id)

    @app.get(
        "/api/conversations/{conversation_id}",
        response_model=ConversationSummaryResponse,
    )
    async def get_conversation(conversation_id: str) -> dict[str, object]:
        """Return basic metadata for one conversation."""
        return store.conversation_summary(conversation_id)

    @app.patch(
        "/api/conversations/{conversation_id}",
        response_model=ConversationSummaryResponse,
    )
    async def rename_conversation(
        conversation_id: str,
        payload: RenameConversationRequest,
    ) -> dict[str, object]:
        """Update a conversation title."""
        return store.update_conversation_title(conversation_id, payload.title)

    @app.get(
        "/api/conversations/{conversation_id}/thread",
        response_model=ThreadResponse,
    )
    async def get_active_thread(conversation_id: str) -> dict[str, object]:
        """Return the active thread from root to active message."""
        thread = store.active_thread(conversation_id)
        return {
            "conversation": store.conversation_summary(conversation_id),
            "messages": [serialize_message(message).model_dump() for message in thread],
        }

    @app.post(
        "/api/conversations/{conversation_id}/messages",
        response_model=ThreadResponse,
    )
    async def append_message(
        conversation_id: str,
        payload: AppendMessageRequest,
    ) -> dict[str, object]:
        """Append one message to the active thread and return the updated thread."""
        agent = payload.agent or ("human" if payload.role == "user" else "unknown")
        store.append_message(
            conversation_id,
            role=payload.role,
            agent=agent,
            content=payload.content,
            message_format=payload.message_format or "markdown",
        )
        return await get_active_thread(conversation_id)

    return app


app = create_app()
