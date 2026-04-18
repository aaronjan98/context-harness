"""FastAPI application entrypoint for agent-display."""

from fastapi import FastAPI

from server.store import ConversationStore


app = FastAPI(title="agent-display")
store = ConversationStore()


@app.get("/health")
async def health() -> dict[str, str]:
    """Simple health check for early scaffolding."""
    return {"status": "ok"}
