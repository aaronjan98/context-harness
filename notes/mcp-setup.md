# MCP Setup Reference

## How Claude Code loads MCP servers

MCP servers are registered in `~/.claude/settings.json` under `mcpServers`.
Each entry specifies a command Claude Code runs to start the server process.

```json
{
  "mcpServers": {
    "claude-display": {
      "command": "python",
      "args": ["/home/aj/Repositories/projects/claude-display/server/mcp_server.py"]
    }
  }
}
```

Claude Code starts the MCP server automatically when a session begins and
communicates with it over stdio using the MCP protocol.

## Automatic push instruction

Add the following to `~/.claude/CLAUDE.md` so Claude calls `push_message`
after every response and after receiving every user message:

```markdown
## claude-display

After every response you generate, call the `push_message` MCP tool with
`role="assistant"` and the full content of your response.

When a user message arrives, call `push_message` with `role="user"` and the
full content of the user message.
```

## Python MCP SDK

The official package is `mcp` (installed via requirements.txt).
MCP servers using stdio transport follow this pattern:

```python
from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import Tool, TextContent

app = Server("claude-display")

@app.list_tools()
async def list_tools():
    return [Tool(name="push_message", description="...", inputSchema={...})]

@app.call_tool()
async def call_tool(name, arguments):
    # handle tool call
    ...

async def main():
    async with stdio_server() as (read, write):
        await app.run(read, write, app.create_initialization_options())
```

## Internal communication

`mcp_server.py` forwards messages to the FastAPI server via HTTP:

```
POST http://localhost:5050/message
{ "role": "user" | "assistant", "content": "..." }
```

FastAPI then broadcasts to all WebSocket clients.
