#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import AdmZip from 'adm-zip';
import { promises as fs } from 'fs';
import path from 'path';
import { tmpdir } from 'os';

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
      'Get detailed content from a specific Apple Developer Documentation page',
      { url: z.string().describe('URL of the Apple Developer Documentation page') },
      async (args) => this.getAppleDocContent(args.url)
    );
    
    // Define download_apple_code_sample tool
    this.server.tool(
      'download_apple_code_sample',
      'Download, unzip, and analyze Apple Developer code samples from ZIP files',
      { zipUrl: z.string().describe('URL of the Apple Developer code sample ZIP file') },
      async (args) => this.downloadAppleCodeSample(args.zipUrl)
    );
  }

  private async searchAppleDocs(query: string, type: string = 'all') {
    try {
      // Create a search URL for Apple Developer Documentation
      const searchUrl = `https://developer.apple.com/search/?q=${encodeURIComponent(query)}`;
      
      // Return a placeholder message - waiting for HTML sample
      return {
        content: [
          {
            type: "text" as const,
            text: `Placeholder for search_apple_docs tool. Waiting for HTML sample to implement parsing.\n\nSearch URL: ${searchUrl}`,
          }
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: ${errorMessage}`,
          }
        ],
        isError: true
      };
    }
  }

  private async getAppleDocContent(url: string) {
    try {
      // Validate that this is an Apple Developer URL
      if (!url.includes('developer.apple.com')) {
        throw new Error('URL must be from developer.apple.com');
      }

      // Return a placeholder message - waiting for HTML sample
      return {
        content: [
          {
            type: "text" as const,
            text: `Placeholder for get_apple_doc_content tool. Waiting for HTML sample to implement parsing.\n\nURL: ${url}`,
          }
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: ${errorMessage}`,
          }
        ],
        isError: true
      };
    }
  }

  private async downloadAppleCodeSample(zipUrl: string) {
    try {
      // Validate that this is an Apple docs-assets URL
      if (!zipUrl.includes('docs-assets.developer.apple.com')) {
        throw new Error('URL must be from docs-assets.developer.apple.com');
      }

      // Return a placeholder message - waiting for ZIP sample
      return {
        content: [
          {
            type: "text" as const,
            text: `Placeholder for download_apple_code_sample tool. Waiting for ZIP sample to implement parsing.\n\nZIP URL: ${zipUrl}`,
          }
        ],
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text" as const,
            text: `Error: ${errorMessage}`,
          }
        ],
        isError: true
      };
    }
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