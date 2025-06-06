#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
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
        {
          name: 'download_apple_code_sample',
          description: 'Download, unzip, and analyze Apple Developer code samples from ZIP files',
          inputSchema: {
            type: 'object',
            properties: {
              zipUrl: {
                type: 'string',
                description: 'URL of the Apple Developer code sample ZIP file (e.g., from docs-assets.developer.apple.com)',
              },
            },
            required: ['zipUrl'],
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
          case 'download_apple_code_sample':
            return await this.downloadAppleCodeSample((args as any).zipUrl as string);
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

  private async downloadAppleCodeSample(zipUrl: string) {
    try {
      // Validate that this is an Apple docs-assets URL
      if (!zipUrl.includes('docs-assets.developer.apple.com')) {
        throw new Error('URL must be from docs-assets.developer.apple.com');
      }

      // Download the ZIP file
      const response = await fetch(zipUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to download ZIP file: ${response.status}`);
      }

      const buffer = await response.buffer();
      
      // Create a temporary directory for extraction
      const tempDir = path.join(tmpdir(), `apple-code-sample-${Date.now()}`);
      await fs.mkdir(tempDir, { recursive: true });

      try {
        // Unzip the file
        const zip = new AdmZip(buffer);
        zip.extractAllTo(tempDir, true);

        // Analyze the extracted contents
        const analysis = await this.analyzeCodeSample(tempDir);
        
        // Clean up the temporary directory
        await fs.rm(tempDir, { recursive: true, force: true });

        return {
          content: [
            {
              type: 'text',
              text: `# Apple Code Sample Analysis

**ZIP URL:** ${zipUrl}

## Project Structure:
${analysis.structure}

## Key Files:
${analysis.keyFiles.map(file => `### ${file.name}
**Type:** ${file.type}
**Size:** ${file.size} bytes

\`\`\`${file.extension}
${file.content}
\`\`\`
`).join('\n')}

## Summary:
${analysis.summary}`,
            },
          ],
        };
      } catch (extractError) {
        // Clean up on error
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
        throw extractError;
      }
    } catch (error) {
      throw new Error(`Failed to download and analyze Apple code sample: ${error}`);
    }
  }

  private async analyzeCodeSample(extractPath: string): Promise<{
    structure: string;
    keyFiles: Array<{
      name: string;
      type: string;
      size: number;
      content: string;
      extension: string;
    }>;
    summary: string;
  }> {
    const structure = await this.buildDirectoryTree(extractPath);
    const allFiles = await this.getAllFiles(extractPath);
    
    // Filter for key files (source code, project files, etc.)
    const keyFiles = [];
    const importantExtensions = ['.swift', '.m', '.h', '.mm', '.cpp', '.c', '.xcodeproj', '.plist', '.json', '.md', '.txt'];
    
    for (const filePath of allFiles) {
      const relativePath = path.relative(extractPath, filePath);
      const extension = path.extname(filePath).toLowerCase();
      
      if (importantExtensions.includes(extension) || relativePath.includes('README')) {
        try {
          const stats = await fs.stat(filePath);
          if (stats.size < 50000) { // Only include files smaller than 50KB
            const content = await fs.readFile(filePath, 'utf-8');
            keyFiles.push({
              name: relativePath,
              type: this.getFileType(extension),
              size: stats.size,
              content: content.substring(0, 2000), // Limit content to 2000 chars
              extension: extension.slice(1) || 'text',
            });
          }
        } catch (error) {
          // Skip files that can't be read
          continue;
        }
      }
    }

    // Sort by importance (Swift files first, then headers, etc.)
    keyFiles.sort((a, b) => {
      const importance = { swift: 5, h: 4, m: 3, mm: 2, cpp: 1, c: 1 };
      const aImportance = importance[a.extension as keyof typeof importance] || 0;
      const bImportance = importance[b.extension as keyof typeof importance] || 0;
      return bImportance - aImportance;
    });

    // Generate summary
    let summary = 'This Apple code sample contains:\n';
    const fileTypes = keyFiles.reduce((acc, file) => {
      acc[file.type] = (acc[file.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    Object.entries(fileTypes).forEach(([type, count]) => {
      summary += `- ${count} ${type} file(s)\n`;
    });

    return {
      structure,
      keyFiles: keyFiles.slice(0, 5), // Limit to top 5 most important files
      summary,
    };
  }

  private async buildDirectoryTree(dirPath: string, indent = ''): Promise<string> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      let tree = '';
      
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue; // Skip hidden files
        
        tree += `${indent}${entry.isDirectory() ? '📁' : '📄'} ${entry.name}\n`;
        
        if (entry.isDirectory() && indent.length < 8) { // Limit depth to avoid too much nesting
          const subPath = path.join(dirPath, entry.name);
          tree += await this.buildDirectoryTree(subPath, indent + '  ');
        }
      }
      
      return tree;
    } catch (error) {
      return `${indent}❌ Error reading directory\n`;
    }
  }

  private async getAllFiles(dirPath: string): Promise<string[]> {
    const files: string[] = [];
    
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        
        const fullPath = path.join(dirPath, entry.name);
        
        if (entry.isDirectory()) {
          const subFiles = await this.getAllFiles(fullPath);
          files.push(...subFiles);
        } else {
          files.push(fullPath);
        }
      }
    } catch (error) {
      // Ignore errors and continue
    }
    
    return files;
  }

  private getFileType(extension: string): string {
    const typeMap: Record<string, string> = {
      '.swift': 'Swift source',
      '.m': 'Objective-C source',
      '.h': 'Header',
      '.mm': 'Objective-C++ source',
      '.cpp': 'C++ source',
      '.c': 'C source',
      '.xcodeproj': 'Xcode project',
      '.plist': 'Property list',
      '.json': 'JSON configuration',
      '.md': 'Markdown documentation',
      '.txt': 'Text file',
    };
    
    return typeMap[extension.toLowerCase()] || 'Unknown';
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