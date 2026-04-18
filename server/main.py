"""FastAPI application entrypoint for agent-display."""

from pydantic import BaseModel, Field
from fastapi import FastAPI

from server.store import ConversationStore


app = FastAPI(title="agent-display")
store = ConversationStore()


class CreateConversationRequest(BaseModel):
    """Payload for creating or opening a conversation."""

    conversation_id: str = Field(min_length=1, pattern=r"^[a-zA-Z0-9_-]+$")


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
