# Apple Developer Docs MCP Server

I despise reading docs on https://developer.apple.com.  This MCP server will do that for you.

## Features

- **Search Apple Developer Documentation** - Find APIs, frameworks, guides, samples, and videos
- **Fetch Full Documentation Content** - Get detailed content from any Apple Developer documentation page
- **Download Code Samples** - Download and analyze Apple's sample code projects
- **AI-Powered Summarization** - Search, fetch, and summarize documentation with key insights tailored to your questions

![Demo in VS Code](demos/download-sample-code.gif)

## Available Tools

### `search_apple_docs`
Search Apple Developer Documentation for APIs, frameworks, guides, samples, and videos.

### `get_apple_doc_content`
Get detailed content from a specific Apple Developer Documentation page by recursively fetching and parsing its JSON API data.

### `download_apple_code_sample`
Download, unzip, and analyze Apple Developer code samples. Works with documentation URLs from search_apple_docs results or direct ZIP URLs. Extracts sample code to `~/AppleSampleCode/`.

### `research_apple_docs`
Research Apple Developer Documentation and research a direct answer to the user question. Combines search, content fetching, and intelligent summarization to provide actionable information tailored to your specific question. Prefer for simple docs lookups and comprehensive answer based on multiple documentation sources in one go.

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

## Development

### Running Tests

This project includes live integration tests that verify the MCP server functionality:

```bash
npm test
```

The tests verify:
- Server initialization and MCP protocol communication
- All tool registrations (search, fetch, download, research)
- Live API queries to Apple's documentation (when network is available)
- Error handling for invalid inputs
- Response structure and content validation

**Note:** The tests are designed to work in both development and CI environments. In network-restricted environments (like GitHub Actions), the tests gracefully handle network failures while still validating error handling and response structure.

### Building

```bash
npm run build
```
