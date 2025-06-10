# Apple Developer Docs MCP Server

I despise reading docs on https://developer.apple.com.  This MCP server will do that for you.

## Usage

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

## Example Workflow

Here's a typical workflow using these tools together:

1. Search for documentation on a topic:
   ```
   mcp_apple-develop_search_apple_docs query="mapkit overlay"
   ```

2. Get detailed content from an interesting result:
   ```
   mcp_apple-develop_get_apple_doc_content url="https://developer.apple.com/documentation/mapkit/displaying-overlays-on-a-map"
   ```

3. Download and analyze the sample code mentioned in the documentation:
   ```
   mcp_apple-develop_download_apple_code_sample zipUrl="https://developer.apple.com/documentation/mapkit/displaying-overlays-on-a-map"
   ```

4. The sample is now available in your home directory at `~/AppleSampleCode/DisplayingOverlaysOnAMap`

## Available Tools

### search_apple_docs
Search Apple Developer Documentation for APIs, frameworks, guides, samples, and videos.

Parameters:
- `query`: Search query for Apple Developer Documentation
- `type`: Type of documentation to search for (optional, default is 'all'). Possible values: 'all', 'api', 'guide', 'sample', 'video'

### get_apple_doc_content
Get detailed content from a specific Apple Developer Documentation page by recursively fetching and parsing its JSON API data.

Parameters:
- `url`: URL of the Apple Developer Documentation page

### download_apple_code_sample
Download, unzip, and analyze Apple Developer code samples. Sample code is extracted to the user's home directory.

Parameters:
- `zipUrl`: URL of the Apple Developer documentation page or direct ZIP download URL

#### Usage Examples:
1. **When browsing documentation:** If you find a documentation page with sample code (via `search_apple_docs` or `get_apple_doc_content`), simply pass that URL to this tool to download and extract the sample.
2. **With direct ZIP URL:** If you already have a direct link to a sample code ZIP file (from docs-assets.developer.apple.com), you can use that URL directly.

#### Notes:
- The tool automatically extracts the correct download URL from documentation pages
- Sample code is extracted to `~/AppleSampleCode/[sample-name]`
- The tool provides a summary of the sample contents, including key files and code snippets