#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

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
      // Use Apple's developer search endpoint
      const searchUrl = `https://developer.apple.com/search/search_data.php?q=${encodeURIComponent(query)}&platform=all&content_type=${type === 'all' ? '' : type}`;
      
      const response = await fetch(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        },
      });
      
      if (!response.ok) {
        throw new Error(`Search request failed: ${response.status}`);
      }
      
      const data = await response.json() as any;
      const results: AppleDocSearchResult[] = [];
      
      if (data.results && data.results.length > 0) {
        for (const item of data.results.slice(0, 10)) { // Limit to top 10 results
          results.push({
            title: item.title || 'Untitled',
            url: item.url ? `https://developer.apple.com${item.url}` : '',
            description: item.description || item.summary || 'No description available',
            type: item.content_type || 'unknown',
          });
        }
      }
      
      if (results.length === 0) {
        // Fallback to basic search URL if API doesn't return results
        const fallbackUrl = `https://developer.apple.com/search/?q=${encodeURIComponent(query)}`;
        results.push({
          title: `Search Apple Developer Documentation for "${query}"`,
          url: fallbackUrl,
          description: `No specific results found. Visit this URL to search manually.`,
          type: 'search',
        });
      }

      return {
        content: [
          {
            type: 'text',
            text: `Found ${results.length} result(s) for "${query}":\n\n` +
                  results.map((result, index) => 
                    `${index + 1}. **${result.title}**\n` +
                    `   URL: ${result.url}\n` +
                    `   Type: ${result.type}\n` +
                    `   Description: ${result.description}\n`
                  ).join('\n'),
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

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch content: ${response.status}`);
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      // Extract title
      const title = $('h1').first().text().trim() || $('title').text().trim();

      // Extract main content
      let content = '';
      
      // Try to find the main content area
      const mainContent = $('.content, .main-content, article, .documentation-content').first();
      if (mainContent.length > 0) {
        // Remove script and style elements
        mainContent.find('script, style, nav, .navigation').remove();
        
        // Extract text content
        content = mainContent.text().trim();
      } else {
        // Fallback: extract from body
        $('script, style, nav, header, footer').remove();
        content = $('body').text().trim();
      }

      // Clean up the content (remove excessive whitespace)
      content = content.replace(/\s+/g, ' ').substring(0, 4000); // Limit to 4000 chars

      // Extract any code examples
      const codeBlocks: string[] = [];
      $('pre code, .code-example, .highlight').each((_, elem) => {
        const code = $(elem).text().trim();
        if (code.length > 10) { // Only include substantial code blocks
          codeBlocks.push(code);
        }
      });

      return {
        content: [
          {
            type: 'text',
            text: `# ${title}

**URL:** ${url}

## Content:
${content}

${codeBlocks.length > 0 ? `## Code Examples:
${codeBlocks.map((code, index) => `### Example ${index + 1}:
\`\`\`
${code}
\`\`\``).join('\n\n')}` : ''}`,
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