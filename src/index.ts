#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import fetch from 'node-fetch';
import { formatJsonDocumentation, formatHtmlDocumentation } from './doc-parsers.js';
import { parseSearchResults, filterResultsByType } from './search-parser.js';
import { downloadAndAnalyzeCodeSample } from './download-helper.js';
import { fetchAppleDocJson } from './doc-fetcher.js';

// Local interface for search results
interface AppleDocSearchResult {
  title: string;
  url: string;
  description: string;
  type: string;
}

class AppleDeveloperDocsMCPServer {
  private server: McpServer;

  constructor() {
    this.server = new McpServer({
      name: 'apple-developer-docs-mcp',
      version: '1.0.0',
    });

    this.setupTools();
    this.setupErrorHandling();
  }

  private setupTools() {
    // Define search_apple_docs tool
    this.server.tool(
      'search_apple_docs',
      'Search Apple Developer Documentation for APIs, frameworks, guides, samples, and videos',
      {
        query: z.string().describe('Search query for Apple Developer Documentation'),
        type: z.enum(['all', 'api', 'guide', 'sample', 'video']).default('all')
          .describe('Type of documentation to search for')
      },
      async (args) => this.searchAppleDocs(args.query, args.type)
    );
    
    // Define get_apple_doc_content tool
    this.server.tool(
      'get_apple_doc_content',
      'Get detailed content from a specific Apple Developer Documentation page by recursively fetching and parsing its JSON API data',
      { url: z.string().describe('URL of the Apple Developer Documentation page') },
      async (args) => this.getAppleDocContent(args.url)
    );
    
    // Define download_apple_code_sample tool
    this.server.tool(
      'download_apple_code_sample',
      'Download, unzip, and analyze Apple Developer code samples. Works with documentation URLs from search_apple_docs results or direct ZIP URLs. Sample code is extracted to ~/AppleSampleCode.',
      { zipUrl: z.string().describe('URL of the Apple Developer documentation page or direct ZIP download URL') },
      async (args) => this.downloadAppleCodeSample(args.zipUrl)
    );
  }

  private async searchAppleDocs(query: string, type: string = 'all') {
    try {
      // Create a search URL for Apple Developer Documentation
      const searchUrl = `https://developer.apple.com/search/?q=${encodeURIComponent(query)}`;
      
      console.error(`Searching Apple docs for: ${query}`);
      
      // Fetch the search results page
      const response = await fetch(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        },
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch search results: ${response.status}`);
      }
      
      const html = await response.text();
      
      // Parse and return the search results
      return parseSearchResults(html, query, searchUrl);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: Failed to search Apple docs: ${errorMessage}`,
          }
        ],
        isError: true
      };
    }
  }

  private async getAppleDocContent(url: string) {
    // Use the JSON fetching approach to get documentation content
    return fetchAppleDocJson(url);
  }

  private async downloadAppleCodeSample(zipUrl: string) {
    return downloadAndAnalyzeCodeSample(zipUrl);
  }

  private setupErrorHandling() {
    // Handle SIGINT to gracefully close the server
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Apple Developer Docs MCP server running on stdio');
  }
}

// Run the server
const server = new AppleDeveloperDocsMCPServer();
server.run().catch((error) => {
  console.error('Fatal error in main():', error);
  process.exit(1);
});