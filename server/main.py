"""FastAPI application entrypoint for Context Forge."""

import json as json_mod

from pydantic import BaseModel, Field
from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, StreamingResponse

from server.docs import get_context_forge_docs_html
from server.latex_suite import (
    DEFAULT_LATEX_SUITE_PATH,
    load_latex_suite_snippets,
)
from server.store import ConversationStore
from server.tool_execution import (
    TerminalExecutionResult,
    ToolExecutionError,
    execute_terminal_command,
    format_terminal_result_markdown,
    stream_terminal_command,
    validate_terminal_exec,
)


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


class UpdateMessageRequest(BaseModel):
    """Payload for editing an existing message body."""

    content: str = Field(min_length=1)


class InsertMessageRequest(BaseModel):
    """Payload for inserting a message next to an existing message."""

    position: str = Field(pattern=r"^(before|after)$")
    role: str = Field(min_length=1)
    agent: str | None = Field(default=None, min_length=1)
    content: str = Field(min_length=1)
    message_format: str | None = Field(default=None, min_length=1)


class ToolExecutionRequest(BaseModel):
    """Payload for running one approved Context Forge tool call."""

    tool: str = Field(pattern=r"^terminal\.exec$")
    cwd: str = Field(min_length=1)
    command: str = Field(min_length=1)
    reason: str = Field(min_length=1)
    timeout_seconds: int = Field(default=300, ge=1, le=3600)


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


class ToolExecutionResponse(BaseModel):
    """Thread response extended with the raw output from a tool execution."""

    conversation: ConversationSummaryResponse
    messages: list[MessageResponse]
    exit_code: int
    stdout: str
    stderr: str


class LatexSuiteSnippetResponse(BaseModel):
    """JSON response shape for one normalized latex-suite snippet."""

    trigger: str
    replacement: str
    options: str
    priority: int
    regex: bool
    description: str | None = None


class LatexSuiteSnippetsResponse(BaseModel):
    """JSON response shape for a parsed latex-suite shortcut file."""

    path: str
    snippets: list[LatexSuiteSnippetResponse]
    unsupported_count: int
    unsupported_reasons: list[str]


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

    def message_not_found(message_id: str) -> HTTPException:
        """Return a consistent 404 for missing message writes."""
        return HTTPException(
            status_code=404,
            detail=f"Message not found: {message_id}",
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
        "/api/latex-suite/snippets",
        response_model=LatexSuiteSnippetsResponse,
    )
    async def get_latex_suite_snippets(
        path: str = Query(default=DEFAULT_LATEX_SUITE_PATH, min_length=1),
    ) -> dict[str, object]:
        """Load and normalize a local Obsidian latex-suite shortcuts file."""
        try:
            return load_latex_suite_snippets(path).model_dump()
        except FileNotFoundError as error:
            raise HTTPException(
                status_code=404,
                detail=f"LaTeX Suite shortcut file not found: {path}",
            ) from error
        except ValueError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error

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

    @app.patch(
        "/api/conversations/{conversation_id}/messages/{message_id}",
        response_model=ThreadResponse,
    )
    async def update_message(
        conversation_id: str,
        message_id: str,
        payload: UpdateMessageRequest,
    ) -> dict[str, object]:
        """Edit one message body and return the updated active thread."""
        try:
            store.update_message_content(
                conversation_id,
                message_id,
                payload.content,
            )
        except FileNotFoundError as error:
            try:
                store.require_existing_conversation(conversation_id)
            except FileNotFoundError:
                raise conversation_not_found(conversation_id) from error
            raise message_not_found(message_id) from error
        return await get_active_thread(conversation_id)

    @app.post(
        "/api/conversations/{conversation_id}/messages/{message_id}/insert",
        response_model=ThreadResponse,
    )
    async def insert_message(
        conversation_id: str,
        message_id: str,
        payload: InsertMessageRequest,
    ) -> dict[str, object]:
        """Insert a message before or after an active-thread message."""
        agent = payload.agent or ("human" if payload.role == "user" else "unknown")
        try:
            store.insert_message_near(
                conversation_id,
                message_id,
                position=payload.position,
                role=payload.role,
                agent=agent,
                content=payload.content,
                message_format=payload.message_format or "markdown",
            )
        except FileNotFoundError as error:
            try:
                store.require_existing_conversation(conversation_id)
            except FileNotFoundError:
                raise conversation_not_found(conversation_id) from error
            raise message_not_found(message_id) from error
        except ValueError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error
        return await get_active_thread(conversation_id)

    @app.delete(
        "/api/conversations/{conversation_id}/messages/{message_id}",
        response_model=ThreadResponse,
    )
    async def delete_message(
        conversation_id: str,
        message_id: str,
    ) -> dict[str, object]:
        """Soft-delete a message from the active thread and stitch descendants."""
        try:
            store.delete_message_from_thread(conversation_id, message_id)
        except FileNotFoundError as error:
            try:
                store.require_existing_conversation(conversation_id)
            except FileNotFoundError:
                raise conversation_not_found(conversation_id) from error
            raise message_not_found(message_id) from error
        return await get_active_thread(conversation_id)

    @app.post(
        "/api/conversations/{conversation_id}/messages/{message_id}/tool-executions",
        response_model=ToolExecutionResponse,
    )
    async def execute_tool_call(
        conversation_id: str,
        message_id: str,
        payload: ToolExecutionRequest,
    ) -> dict[str, object]:
        """Run one approved tool call and append the captured result."""
        try:
            thread = store.active_thread(conversation_id)
        except FileNotFoundError as error:
            raise conversation_not_found(conversation_id) from error

        if not any(message.id == message_id for message in thread):
            raise message_not_found(message_id)

        try:
            result = execute_terminal_command(
                cwd=payload.cwd,
                command=payload.command,
                reason=payload.reason,
                timeout_seconds=payload.timeout_seconds,
            )
        except ToolExecutionError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error

        store.append_message(
            conversation_id,
            role="tool",
            agent="contextforge",
            content=format_terminal_result_markdown(
                source_message_id=message_id,
                result=result,
            ),
            message_format="markdown",
        )
        thread_data = await get_active_thread(conversation_id)
        return {
            **thread_data,
            "exit_code": result.exit_code,
            "stdout": result.stdout,
            "stderr": result.stderr,
        }

    @app.post(
        "/api/conversations/{conversation_id}/messages/{message_id}/tool-executions/stream",
    )
    async def stream_tool_execution(
        conversation_id: str,
        message_id: str,
        payload: ToolExecutionRequest,
    ) -> StreamingResponse:
        """Run one approved tool call, streaming stdout/stderr as SSE then appending the result."""
        try:
            thread = store.active_thread(conversation_id)
        except FileNotFoundError as error:
            raise conversation_not_found(conversation_id) from error

        if not any(message.id == message_id for message in thread):
            raise message_not_found(message_id)

        try:
            validate_terminal_exec(cwd=payload.cwd, command=payload.command, reason=payload.reason)
        except ToolExecutionError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error

        async def generate():
            try:
                async for event in stream_terminal_command(
                    cwd=payload.cwd,
                    command=payload.command,
                    timeout_seconds=payload.timeout_seconds,
                ):
                    yield f"data: {json_mod.dumps(event)}\n\n"
                    if event["type"] == "exit":
                        result = TerminalExecutionResult(
                            cwd=payload.cwd,
                            command=payload.command,
                            reason=payload.reason,
                            exit_code=int(event["code"]),
                            stdout=str(event["stdout"]),
                            stderr=str(event["stderr"]),
                        )
                        store.append_message(
                            conversation_id,
                            role="tool",
                            agent="contextforge",
                            content=format_terminal_result_markdown(
                                source_message_id=message_id,
                                result=result,
                            ),
                            message_format="markdown",
                        )
                        yield f"data: {json_mod.dumps({'type': 'done'})}\n\n"
            except Exception as exc:
                yield f"data: {json_mod.dumps({'type': 'error', 'message': str(exc)})}\n\n"

        return StreamingResponse(
            generate(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

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

    @app.get("/api/conversations/{conversation_id}/exports/current.md")
    async def preview_current_export(conversation_id: str) -> FileResponse:
        """Serve the current active-thread Markdown export inline."""
        try:
            paths = store.require_existing_conversation(conversation_id)
        except FileNotFoundError as error:
            raise conversation_not_found(conversation_id) from error
        return FileResponse(
            paths.exports / "current.md",
            filename="current.md",
            media_type="text/markdown",
            content_disposition_type="inline",
        )

    @app.get("/api/conversations/{conversation_id}/exports/current.md/download")
    async def download_current_export(conversation_id: str) -> FileResponse:
        """Serve the current active-thread Markdown export as a download."""
        try:
            paths = store.require_existing_conversation(conversation_id)
        except FileNotFoundError as error:
            raise conversation_not_found(conversation_id) from error
        return FileResponse(
            paths.exports / "current.md",
            filename=f"{conversation_id}.md",
            media_type="text/markdown",
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
