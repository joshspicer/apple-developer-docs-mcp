# Apple Developer Docs MCP Server

I despise reading docs on https://developer.apple.com.  This MCP server will do that for you.


![Demo in VS Code](demos/download-sample-code.gif)

## Usage

1. Launch VS Code
1. `> MCP: Add Server...`
1. Select npm Package
1. `apple-developer-docs-mcp`

#### .vscode/mcp.json
```json
{
  "servers": {
    "apple-developer-docs": {
      "command": "npx",
      "args": [
        "apple-developer-docs-mcp"
      ]
    }
  }
}
```
