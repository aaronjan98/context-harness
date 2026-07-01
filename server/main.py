"""FastAPI application entrypoint for Context Forge."""

from pydantic import BaseModel, Field
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, HTMLResponse

from server.docs import get_context_forge_docs_html
from server.store import ConversationStore


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
    attachment_ids: list[str] = Field(default_factory=list)


class ImportMarkdownRequest(BaseModel):
    """Payload for importing an external Markdown transcript."""

    content: str = Field(min_length=1)


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
    attachments: list["AttachmentResponse"]
    content: str


class AttachmentResponse(BaseModel):
    """JSON response shape for one stored attachment."""

    id: str
    filename: str
    content_type: str
    size: int
    relative_path: str
    preview_url: str
    download_url: str


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
        attachments=[
            serialize_attachment(message.id, attachment).model_dump()
            for attachment in message.attachments
        ],
        content=message.content,
    )


def serialize_attachment(message_id: str, attachment: object) -> AttachmentResponse:
    """Return a JSON-friendly attachment payload."""
    return AttachmentResponse(
        id=attachment.id,
        filename=attachment.filename,
        content_type=attachment.content_type,
        size=attachment.size,
        relative_path=attachment.relative_path,
        preview_url="",
        download_url="",
    )


def create_app(conversation_store: ConversationStore | None = None) -> FastAPI:
    """Create the FastAPI app with an injectable conversation store."""
    app = FastAPI(title="Context Forge", docs_url=None)
    store = conversation_store or ConversationStore()

    def conversation_not_found(conversation_id: str) -> HTTPException:
        """Return a consistent 404 for missing conversation reads/writes."""
        return HTTPException(
            status_code=404,
            detail=f"Conversation not found: {conversation_id}",
        )

    def attachment_not_found(attachment_id: str) -> HTTPException:
        """Return a consistent 404 for missing attachment reads."""
        return HTTPException(
            status_code=404,
            detail=f"Attachment not found: {attachment_id}",
        )

    def attachment_response(
        conversation_id: str, attachment: object
    ) -> AttachmentResponse:
        """Return attachment metadata with conversation-scoped URLs."""
        return AttachmentResponse(
            id=attachment.id,
            filename=attachment.filename,
            content_type=attachment.content_type,
            size=attachment.size,
            relative_path=attachment.relative_path,
            preview_url=(
                f"/api/conversations/{conversation_id}/attachments/{attachment.id}"
            ),
            download_url=(
                f"/api/conversations/{conversation_id}/attachments/{attachment.id}/download"
            ),
        )

    def message_response(conversation_id: str, message: object) -> MessageResponse:
        """Return one message with conversation-scoped attachment URLs."""
        payload = serialize_message(message)
        payload.attachments = [
            attachment_response(conversation_id, attachment)
            for attachment in message.attachments
        ]
        return payload

    @app.get("/docs", include_in_schema=False)
    async def docs() -> HTMLResponse:
        """Render dark-themed Swagger UI documentation."""
        return get_context_forge_docs_html(
            openapi_url=app.openapi_url or "/openapi.json",
            title=app.title,
        )

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
        try:
            return store.conversation_summary(conversation_id)
        except FileNotFoundError as error:
            raise conversation_not_found(conversation_id) from error

    @app.patch(
        "/api/conversations/{conversation_id}",
        response_model=ConversationSummaryResponse,
    )
    async def rename_conversation(
        conversation_id: str,
        payload: RenameConversationRequest,
    ) -> dict[str, object]:
        """Update a conversation title."""
        try:
            return store.update_conversation_title(conversation_id, payload.title)
        except FileNotFoundError as error:
            raise conversation_not_found(conversation_id) from error

    @app.delete("/api/conversations/{conversation_id}", status_code=204)
    async def delete_conversation(conversation_id: str) -> None:
        """Delete one conversation and its canonical files."""
        try:
            store.delete_conversation(conversation_id)
        except FileNotFoundError as error:
            raise conversation_not_found(conversation_id) from error

    @app.get(
        "/api/conversations/{conversation_id}/thread",
        response_model=ThreadResponse,
    )
    async def get_active_thread(conversation_id: str) -> dict[str, object]:
        """Return the active thread from root to active message."""
        try:
            thread = store.active_thread(conversation_id)
            return {
                "conversation": store.conversation_summary(conversation_id),
                "messages": [
                    message_response(conversation_id, message).model_dump()
                    for message in thread
                ],
            }
        except FileNotFoundError as error:
            raise conversation_not_found(conversation_id) from error

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
        try:
            store.append_message(
                conversation_id,
                role=payload.role,
                agent=agent,
                content=payload.content,
                message_format=payload.message_format or "markdown",
                attachment_ids=payload.attachment_ids,
            )
        except FileNotFoundError as error:
            raise conversation_not_found(conversation_id) from error
        return await get_active_thread(conversation_id)

    @app.post(
        "/api/conversations/{conversation_id}/attachments",
        response_model=AttachmentResponse,
    )
    async def upload_attachment(
        conversation_id: str,
        file: UploadFile = File(...),
    ) -> AttachmentResponse:
        """Upload one attachment into the conversation attachment store."""
        try:
            data = await file.read()
            attachment = store.save_attachment(
                conversation_id,
                filename=file.filename or "attachment",
                content_type=file.content_type,
                data=data,
            )
            return attachment_response(conversation_id, attachment)
        except FileNotFoundError as error:
            raise conversation_not_found(conversation_id) from error

    @app.get("/api/conversations/{conversation_id}/attachments/{attachment_id}")
    async def preview_attachment(
        conversation_id: str,
        attachment_id: str,
    ) -> FileResponse:
        """Serve one attachment inline for the local preview overlay."""
        try:
            attachment = store.load_attachment(conversation_id, attachment_id)
            path = store.attachment_path(conversation_id, attachment_id)
        except FileNotFoundError as error:
            raise attachment_not_found(attachment_id) from error
        return FileResponse(
            path,
            filename=attachment.filename,
            media_type=attachment.content_type,
            content_disposition_type="inline",
        )

    @app.get("/api/conversations/{conversation_id}/attachments/{attachment_id}/download")
    async def download_attachment(
        conversation_id: str,
        attachment_id: str,
    ) -> FileResponse:
        """Serve one attachment as a browser download."""
        try:
            attachment = store.load_attachment(conversation_id, attachment_id)
            path = store.attachment_path(conversation_id, attachment_id)
        except FileNotFoundError as error:
            raise attachment_not_found(attachment_id) from error
        return FileResponse(
            path,
            filename=attachment.filename,
            media_type=attachment.content_type,
            content_disposition_type="attachment",
        )

    @app.post(
        "/api/conversations/{conversation_id}/imports/markdown",
        response_model=ThreadResponse,
    )
    async def import_markdown(
        conversation_id: str,
        payload: ImportMarkdownRequest,
    ) -> dict[str, object]:
        """Import Markdown transcript content into the active thread."""
        try:
            store.import_markdown(conversation_id, payload.content)
        except FileNotFoundError as error:
            raise conversation_not_found(conversation_id) from error
        return await get_active_thread(conversation_id)

    return app


app = create_app()
