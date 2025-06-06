# Apple Developer Docs MCP Server

An MCP (Model Context Protocol) server that provides access to Apple's developer documentation at https://developer.apple.com. This server enables AI assistants to search and retrieve information from Apple's comprehensive developer resources.

## Features

- **Search Apple Developer Documentation**: Search across APIs, frameworks, guides, samples, and videos
- **Retrieve Documentation Content**: Get detailed content from specific Apple Developer Documentation pages
- **VS Code Integration**: Works seamlessly with VS Code and other MCP-compatible clients
- **TypeScript Support**: Built with TypeScript for better development experience

## Installation

### From NPM

```bash
npm install -g apple-developer-docs-mcp
```

### From Source

```bash
git clone https://github.com/joshspicer/apple-developer-docs-mcp.git
cd apple-developer-docs-mcp
npm install
npm run build
```

## Usage

### With VS Code (Claude Extension)

1. Install the Claude extension in VS Code
2. Add the MCP server to your configuration:

```json
{
  "mcpServers": {
    "apple-developer-docs": {
      "command": "apple-developer-docs-mcp"
    }
  }
}
```

### Command Line

You can run the MCP server directly:

```bash
apple-developer-docs-mcp
```

## Available Tools

### `search_apple_docs`

Search Apple Developer Documentation for relevant content.

**Parameters:**
- `query` (string, required): Search query
- `type` (string, optional): Type of content to search for
  - `all` (default): All content types
  - `api`: API documentation
  - `guide`: Developer guides
  - `sample`: Code samples
  - `video`: WWDC videos and tutorials

**Example:**
```json
{
  "name": "search_apple_docs",
  "arguments": {
    "query": "SwiftUI navigation",
    "type": "guide"
  }
}
```

### `get_apple_doc_content`

Retrieve content from a specific Apple Developer Documentation page.

**Parameters:**
- `url` (string, required): URL of the Apple Developer Documentation page

**Example:**
```json
{
  "name": "get_apple_doc_content",
  "arguments": {
    "url": "https://developer.apple.com/documentation/swiftui"
  }
}
```

## Development

### Building

```bash
npm run build
```

### Development Mode

```bash
npm run dev
```

### Testing

```bash
npm test
```

## Publishing

This package is designed to be published to NPM. To publish:

```bash
npm publish
```

## License

MIT License - see LICENSE file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
