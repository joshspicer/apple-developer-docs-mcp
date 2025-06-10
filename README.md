# Apple Developer Docs MCP Server

I despise reading docs on https://developer.apple.com.  This MCP server will do that for you.


<div align="center">
   <video width="640" controls>
      <source src="demos/download-sample-code.mov" type="video/quicktime">
      Your browser does not support the video tag. 
      <a href="demos/download-sample-code.mov">Download the video</a> instead.
   </video>
</div>

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

3. Download the sample code using either:
   
   a) The documentation URL directly:
   ```
   mcp_apple-develop_download_apple_code_sample zipUrl="https://developer.apple.com/documentation/mapkit/displaying-overlays-on-a-map"
   ```
   
   b) Or the direct ZIP URL if you found it in the documentation JSON:
   ```
   mcp_apple-develop_download_apple_code_sample zipUrl="https://docs-assets.developer.apple.com/published/f14a9bc447c5/DisplayingOverlaysOnAMap.zip"
   ```

4. The sample is now available in your home directory at `~/AppleSampleCode/DisplayingOverlaysOnAMap`

### Helper Utilities

The repository includes two helpful utilities to demonstrate and automate ZIP URL extraction:

1. **Examples Script**: See a full demonstration of the URL extraction process:
   ```
   node examples/extract-zip-url-demo.js
   ```

2. **Extraction Utility**: Extract ZIP URLs directly from JSON responses:
   ```
   # From a JSON string
   node utils/extract-zip-url.js '{"sampleCodeDownload":{"action":{"identifier":"f14a9bc447c5/DisplayingOverlaysOnAMap.zip"}}}'
   
   # From a saved JSON file
   node utils/extract-zip-url.js path/to/saved-response.json
   ```

## Extracting ZIP URLs from Previous Tool Calls

### Step-by-Step Guide

When using the `mcp_apple-develop_get_apple_doc_content` tool, it returns a JSON structure that contains the information needed to download sample code. Here's exactly how to extract and use a ZIP URL:

1. **Look for the `sampleCodeDownload` section** in the JSON output from `get_apple_doc_content`. It will look something like this:

   ```json
   "sampleCodeDownload": {
     "kind": "sampleDownload",
     "action": {
       "type": "reference",
       "isActive": true,
       "identifier": "f14a9bc447c5/DisplayingOverlaysOnAMap.zip",
       "overridingTitle": "Download"
     }
   }
   ```

2. **Extract the `identifier` value** from the JSON path: `sampleCodeDownload.action.identifier`. In this example, it's `f14a9bc447c5/DisplayingOverlaysOnAMap.zip`.

3. **Create the complete ZIP URL** by prepending `https://docs-assets.developer.apple.com/published/` to the identifier:
   ```
   https://docs-assets.developer.apple.com/published/f14a9bc447c5/DisplayingOverlaysOnAMap.zip
   ```

4. **Use this URL with the download tool**:
   ```
   mcp_apple-develop_download_apple_code_sample zipUrl="https://docs-assets.developer.apple.com/published/f14a9bc447c5/DisplayingOverlaysOnAMap.zip"
   ```

### Example of Full Workflow with Extraction

```
# Step 1: Search for docs
mcp_apple-develop_search_apple_docs query="core data relationships"

# Step 2: Get content for an interesting result
mcp_apple-develop_get_apple_doc_content url="https://developer.apple.com/documentation/coredata/modeling_data/configuring_relationships"

# Step 3: In the JSON response, find the sampleCodeDownload section:
# "sampleCodeDownload": {
#   "action": {
#     "identifier": "9f5a647e1f57/ConfiguringRelationships.zip"
#   }
# }

# Step 4: Construct the ZIP URL
# https://docs-assets.developer.apple.com/published/9f5a647e1f57/ConfiguringRelationships.zip

# Step 5: Download the sample code
mcp_apple-develop_download_apple_code_sample zipUrl="https://docs-assets.developer.apple.com/published/9f5a647e1f57/ConfiguringRelationships.zip"
```

### Shortcut: Using the Documentation URL Directly

If you don't want to extract the ZIP URL, you can simply use the documentation URL directly:

```
mcp_apple-develop_download_apple_code_sample zipUrl="https://developer.apple.com/documentation/coredata/modeling_data/configuring_relationships"
```

The tool will automatically extract the download URL for you.

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
Download, unzip, and analyze Apple Developer code samples from ZIP files. Sample code is extracted to the user's home directory.

Parameters:
- `zipUrl`: URL of the Apple Developer documentation page or direct ZIP download URL (docs-assets.developer.apple.com format)

#### How to Get the ZIP URL:
There are three ways to get the correct ZIP URL for this tool:

1. **From documentation pages:** Simply use the documentation URL directly, and the tool will automatically extract the download URL:
   ```
   mcp_apple-develop_download_apple_code_sample zipUrl="https://developer.apple.com/documentation/mapkit/displaying-overlays-on-a-map"
   ```

2. **From get_apple_doc_content results:** When you use the `get_apple_doc_content` tool, look for the `sampleCodeDownload` section in the JSON. The direct download URL follows this pattern:
   ```
   https://docs-assets.developer.apple.com/published/[identifier]/[filename].zip
   ```
   For example, if you see:
   ```json
   "sampleCodeDownload": {
     "action": {
       "identifier": "f14a9bc447c5/DisplayingOverlaysOnAMap.zip"
     }
   }
   ```
   Then the ZIP URL would be:
   ```
   https://docs-assets.developer.apple.com/published/f14a9bc447c5/DisplayingOverlaysOnAMap.zip
   ```

3. **From documentation JSON directly:** If you examine the JSON structure of a documentation page (by adding .json to the URL), you can find the `sampleCodeDownload.action.identifier` value and construct the URL as shown above.

#### Notes:
- The tool automatically extracts the correct download URL from documentation pages
- Sample code is extracted to `~/AppleSampleCode/[sample-name]`
- The tool provides a summary of the sample contents, including key files and code snippets