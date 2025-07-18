# Apple Developer Docs MCP Server - Copilot Instructions

## Project Overview
This is an MCP (Model Context Protocol) server that provides AI assistants with access to Apple's developer documentation. It fetches, parses, and formats Apple's developer documentation, sample code, and search results through three main tools.

## Development Guidelines
- Use `https://github.com/modelcontextprotocol/typescript-sdk` for MCP SDK API implementation details and examples
- After every change, run `npm run build` to compile TypeScript files to JavaScript

## Project-Specific Conventions

### Error Handling Pattern
```typescript
// Consistent error response format
return {
  content: [{
    type: "text" as const,
    text: `Error: ${errorMessage}`,
  }],
  isError: true
};
```

### Documentation and Testing Rules
- **NO EXTRA DOCUMENTATION**: Do not create additional .md files, documentation files, or summary files
- **NO EXTRA TEST FILES**: Do not create additional test files beyond the existing `test/server-test.js`
- **FOCUS ON CODE**: Implement features directly in the source code without creating supporting documentation
- **MINIMAL APPROACH**: Keep the project structure clean and focused on the core MCP server functionality
