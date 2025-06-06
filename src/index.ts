#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

interface AppleDocSearchResult {
  title: string;
  url: string;
  description: string;
  type: string;
}

class AppleDeveloperDocsMCPServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'apple-developer-docs-mcp',
        version: '1.0.0',
      }
    );

    this.setupToolHandlers();
    this.setupErrorHandling();
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'search_apple_docs',
          description: 'Search Apple Developer Documentation for APIs, frameworks, and guides',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Search query for Apple Developer Documentation',
              },
              type: {
                type: 'string',
                enum: ['all', 'api', 'guide', 'sample', 'video'],
                description: 'Type of documentation to search for (default: all)',
                default: 'all',
              },
            },
            required: ['query'],
          },
        },
        {
          name: 'get_apple_doc_content',
          description: 'Get detailed content from a specific Apple Developer Documentation page',
          inputSchema: {
            type: 'object',
            properties: {
              url: {
                type: 'string',
                description: 'URL of the Apple Developer Documentation page',
              },
            },
            required: ['url'],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        if (!args || typeof args !== 'object') {
          throw new Error('Invalid arguments');
        }

        switch (name) {
          case 'search_apple_docs':
            return await this.searchAppleDocs(
              (args as any).query as string, 
              ((args as any).type as string) || 'all'
            );
          case 'get_apple_doc_content':
            return await this.getAppleDocContent((args as any).url as string);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: 'text',
              text: `Error: ${errorMessage}`,
            },
          ],
        };
      }
    });
  }

  private async searchAppleDocs(query: string, type: string = 'all') {
    try {
      // For now, we'll implement a basic search using Apple's developer site
      // In a real implementation, you might want to use Apple's search API or scrape results
      const searchUrl = `https://developer.apple.com/search/?q=${encodeURIComponent(query)}&type=${type}`;
      
      // Simulate search results for demonstration
      // In a real implementation, you would make HTTP requests to fetch actual results
      const mockResults: AppleDocSearchResult[] = [
        {
          title: `Search results for "${query}"`,
          url: searchUrl,
          description: `Found documentation related to ${query} on Apple Developer site`,
          type: 'search',
        },
      ];

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(mockResults, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to search Apple docs: ${error}`);
    }
  }

  private async getAppleDocContent(url: string) {
    try {
      // Validate that this is an Apple Developer URL
      if (!url.includes('developer.apple.com')) {
        throw new Error('URL must be from developer.apple.com');
      }

      // For now, return the URL for the user to visit
      // In a real implementation, you would fetch and parse the content
      return {
        content: [
          {
            type: 'text',
            text: `Apple Developer Documentation: ${url}

This tool would normally fetch the content from this URL. For now, please visit the URL directly to access the documentation.

To implement full content fetching, this server would need to:
1. Make HTTP requests to the Apple Developer site
2. Parse the HTML content
3. Extract relevant documentation text
4. Return structured information`,
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to get Apple doc content: ${error}`);
    }
  }

  private setupErrorHandling() {
    this.server.onerror = (error) => {
      console.error('[MCP Error]', error);
    };

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