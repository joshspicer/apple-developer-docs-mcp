#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import fetch from 'node-fetch';
import { formatJsonDocumentation, formatHtmlDocumentation } from './doc-parsers.js';
import { parseSearchResults, filterResultsByType, AppleDocSearchResult } from './search-parser.js';
import { downloadAndAnalyzeCodeSample } from './download-helper.js';
import { fetchAppleDocJson } from './doc-fetcher.js';
import { DocumentSummarizer } from './summarizer.js';

class AppleDeveloperDocsMCPServer {
  private server: McpServer;
  private summarizer: DocumentSummarizer;

  constructor() {
    this.server = new McpServer({
      name: 'apple-developer-docs-mcp',
      version: '1.0.0',
    });

    this.summarizer = new DocumentSummarizer(this.server);
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
      'Download, unzip, and analyze Apple Developer code samples. Works with documentation URLs from search_apple_docs results or direct ZIP URLs. When using direct ZIP URLs from get_apple_doc_content results, extract the identifier from sampleCodeDownload.action.identifier and prepend "https://docs-assets.developer.apple.com/published/" to form the complete URL. Sample code is extracted to ~/AppleSampleCode.',
      { zipUrl: z.string().describe('URL of the Apple Developer documentation page or direct ZIP download URL from docs-assets.developer.apple.com (e.g., https://docs-assets.developer.apple.com/published/f14a9bc447c5/DisplayingOverlaysOnAMap.zip)') },
      async (args) => this.downloadAppleCodeSample(args.zipUrl)
    );

    // Define research tool
    this.server.tool(
      'research_apple_docs',
      'Research Apple Developer Documentation and research a direct answer to the user question. Combines search, content fetching, and intelligent summarization to provide actionable information tailored to your specific question. Prefer for simple docs lookups and comprehensive answer based on multiple documentation sources in one go.',
      {
        docs_query: z.string().describe('Search query for Apple Developer Documentation. Use specific API/class names, leverage Apple terminology, and add platform or technology keywords (e.g., SwiftUI, iOS, macOS) to refine results—enclose phrases in quotes for exact matches and include context (e.g., "delegate pattern") for clarity'),
        user_question: z.string().describe('Specific question or context for the AI to focus on when summarizing (e.g., "How to implement custom navigation patterns?", "What are the performance best practices?")'),
        max_docs: z.number().min(1).max(10).default(5).describe('Maximum number of documents to analyze (1-10, default: 5)'),
        depth: z.enum(['s', 'm', 'l', 'xl']).default('m').describe('Length of the explanation: s=brief, m=moderate, l=detailed, xl=comprehensive')
      },
      async (args, { sendNotification, _meta }) => this.researchAppleDocs(args.docs_query, args.user_question, args.max_docs, args.depth, sendNotification, _meta?.progressToken)
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

  private async researchAppleDocs(
    docsQuery: string,
    userQuestion: string,
    maxDocs: number = 5,
    depth: 's' | 'm' | 'l' | 'xl' = 'm',
    sendNotification?: (notification: any) => Promise<void>,
    progressToken?: string | number
  ) {
    try {
      console.error(`Starting search and summarization for: ${docsQuery}`);

      // Map depth to maxTokens
      const depthToTokens = {
        's': 500,    // brief
        'm': 1000,   // moderate
        'l': 2000,   // detailed
        'xl': 4000   // comprehensive
      };

      const maxTokens = depthToTokens[depth];
      console.error(`Using depth: ${depth} (${maxTokens} tokens)`);

      // Step 1: Search for documentation
      if (sendNotification && progressToken) {
        await sendNotification({
          method: "notifications/progress",
          params: {
            progressToken,
            progress: 10,
            total: 100,
            message: `Searching "${docsQuery}"`
          }
        });
      }

      const searchResult = await this.searchAppleDocs(docsQuery);

      if (searchResult.isError) {
        return searchResult;
      }

      // Parse search results from the formatted text
      const searchResults = this.parseSearchResultsFromText(searchResult.content[0].text);

      if (searchResults.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No documentation found for "${docsQuery}". Please try a different search query.`,
            }
          ],
          isError: true
        };
      }

      // Step 2: Fetch content for top results
      const limitedResults = searchResults.slice(0, maxDocs);
      console.error(`Fetching content for ${limitedResults.length} documents`);

      const documentContents: string[] = [];

      for (const [index, result] of limitedResults.entries()) {
        try {
          // Send progress notification for each document being fetched
          if (sendNotification && progressToken) {
            const progressValue = 30 + ((index + 1) / limitedResults.length) * 30; // Progress from 30 to 60
            await sendNotification({
              method: "notifications/progress",
              params: {
                progressToken,
                progress: Math.round(progressValue),
                total: 100,
                message: `Fetching content from "${result.title}" (${index + 1}/${limitedResults.length})`
              }
            });
          }

          const docResult = await this.getAppleDocContent(result.url);
          if (docResult.isError) {
            console.error(`Failed to fetch content for ${result.url}`);
            documentContents.push(`Error fetching content for ${result.title}`);
          } else {
            documentContents.push(docResult.content[0].text);
          }
        } catch (error) {
          console.error(`Error fetching ${result.url}:`, error);
          documentContents.push(`Error fetching content for ${result.title}`);
        }
      }

      // Step 3: Summarize using AI
      console.error(`Summarizing content with AI...`);

      // Send progress notification before AI summarization
      if (sendNotification && progressToken) {
        await sendNotification({
          method: "notifications/progress",
          params: {
            progressToken,
            progress: 70,
            total: 100,
            message: `Analyzing content with AI (${depth} depth - ${maxTokens} tokens)...`
          }
        });
      }

      // Create a new summarizer instance with the specified maxTokens
      const summarizer = new DocumentSummarizer(this.server, { maxTokens });

      const summarizationResult = await summarizer.summarizeContent(
        limitedResults,
        documentContents,
        userQuestion,
        docsQuery
      );

      // Step 4: Format and return results
      // Send progress notification before formatting
      if (sendNotification && progressToken) {
        await sendNotification({
          method: "notifications/progress",
          params: {
            progressToken,
            progress: 90,
            total: 100,
            message: "Formatting final results..."
          }
        });
      }

      const formattedResult = summarizer.formatResult(
        summarizationResult,
        docsQuery,
        userQuestion
      );

      // Send final progress notification
      if (sendNotification && progressToken) {
        await sendNotification({
          method: "notifications/progress",
          params: {
            progressToken,
            progress: 100,
            total: 100,
            message: "Research complete!"
          }
        });
      }

      return {
        content: [
          {
            type: "text" as const,
            text: formattedResult,
          }
        ],
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Error in research:', errorMessage);

      return {
        content: [
          {
            type: "text" as const,
            text: `Error: Failed to search and summarize documentation: ${errorMessage}`,
          }
        ],
        isError: true
      };
    }
  }

  private parseSearchResultsFromText(searchText: string): AppleDocSearchResult[] {
    const results: AppleDocSearchResult[] = [];

    // Parse the formatted search results text
    const lines = searchText.split('\n');
    let currentResult: Partial<AppleDocSearchResult> = {};

    for (const line of lines) {
      // Look for markdown links in format: ## [Title](URL)
      const linkMatch = line.match(/^## \[([^\]]+)\]\(([^)]+)\)$/);
      if (linkMatch) {
        // Save previous result if complete
        if (currentResult.title && currentResult.url) {
          results.push(currentResult as AppleDocSearchResult);
        }

        // Start new result
        currentResult = {
          title: linkMatch[1],
          url: linkMatch[2],
          description: '',
          type: 'documentation' // default type
        };
      } else if (line.startsWith('*Type:')) {
        // Extract type: *Type: documentation*
        const typeMatch = line.match(/\*Type:\s*([^*]+)\*/);
        if (typeMatch && currentResult.title) {
          currentResult.type = typeMatch[1];
        }
      } else if (line.trim() && !line.startsWith('#') && !line.startsWith('*') && !line.startsWith('View all')) {
        // This is likely description content
        if (currentResult.title && line.length > 10) {
          currentResult.description = (currentResult.description || '') + ' ' + line.trim();
        }
      }
    }

    // Add the last result if complete
    if (currentResult.title && currentResult.url) {
      results.push(currentResult as AppleDocSearchResult);
    }

    return results;
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