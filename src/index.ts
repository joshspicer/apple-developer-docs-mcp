#!/usr/bin/env node

import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import fetch from 'node-fetch';
import { ResourceLink, EmbeddedResource } from '@modelcontextprotocol/sdk/types.js';
import { parseSearchResults, filterResultsByType, AppleDocSearchResult } from './search-parser.js';
import { downloadAndAnalyzeCodeSample } from './download-helper.js';
import { fetchAppleDocJson, fetchAppleDocJsonCached } from './doc-fetcher.js';
import { DocumentSummarizer } from './summarizer.js';
import { DocumentCache } from './cache/document-cache.js';
import { ResourceManager } from './cache/resource-manager.js';
import { CacheIntegration } from './cache/cache-integration.js';
import { setCacheIntegration } from './doc-parsers.js';

class AppleDeveloperDocsMCPServer {
  private server: McpServer;
  private summarizer: DocumentSummarizer;
  private cache: DocumentCache;
  private resourceManager: ResourceManager;
  private cacheIntegration: CacheIntegration;

  constructor() {
    this.server = new McpServer({
      name: 'apple-developer-docs-mcp',
      version: '1.0.0',
    });

    this.cache = new DocumentCache();
    this.resourceManager = new ResourceManager(this.server, this.cache);

    // Disable resource registration in the cache integration since we're using the new resource template approach
    this.cacheIntegration = new CacheIntegration(this.cache, this.resourceManager, {
      registerResources: false  // Disable old resource registration
    });

    // Set up global cache integration for doc-parsers
    setCacheIntegration(this.cacheIntegration);

    this.summarizer = new DocumentSummarizer(this.server);
    this.setupTools();
    this.setupResources();
    this.setupErrorHandling();
  }

  private setupTools() {
    // Define search_apple_docs tool
    this.server.tool(
      'search_apple_docs',
      'Find and search Apple Developer Documentation including iOS, macOS, watchOS, tvOS, and visionOS development resources. Use this to discover Swift APIs, Objective-C classes, UIKit components, SwiftUI views, frameworks (like Foundation, CoreData, MapKit, AVFoundation), code samples, WWDC videos, and developer guides. Ideal for looking up any Apple platform API reference, tutorial, or programming guide.',
      {
        query: z.string().describe('Search query for Apple Developer Documentation. Examples: "UIViewController", "SwiftUI navigation", "Core Data relationships", "MapKit annotations", "async await Swift", "Combine publishers"'),
        type: z.enum(['all', 'api', 'guide', 'sample', 'video']).default('all')
          .describe('Filter by content type: "api" for API reference docs, "guide" for tutorials and articles, "sample" for code examples, "video" for WWDC sessions, or "all" for everything')
      },
      { readOnlyHint: true },
      async (args) => this.searchAppleDocs(args.query, args.type)
    );

    // Define get_apple_doc_content tool
    this.server.tool(
      'get_apple_doc_content',
      'Fetch and retrieve the complete, detailed content from a specific Apple Developer Documentation page. Use this to read full API documentation, method signatures, property descriptions, code examples, discussion sections, parameters, return values, and related topics. Extracts structured information including declarations, descriptions, usage examples, and see-also references. Perfect for deep-diving into a specific iOS/macOS API, Swift class, protocol, or framework component after finding it via search.',
      { url: z.string().describe('Full URL of the Apple Developer Documentation page (e.g., https://developer.apple.com/documentation/swiftui/view, https://developer.apple.com/documentation/uikit/uiviewcontroller)') },
      { readOnlyHint: true },
      async (args) => this.getAppleDocContent(args.url)
    );

    // Define download_apple_code_sample tool
    this.server.tool(
      'download_apple_code_sample',
      'Download, extract, and analyze Apple\'s official sample code projects and Xcode examples. Use this to get working Swift or Objective-C code samples for iOS, macOS, watchOS, tvOS, or visionOS development. Automatically downloads the ZIP archive, unzips it to ~/AppleSampleCode/, and provides a comprehensive analysis including project structure, key files, README content, and code overview. Ideal for learning implementation patterns, exploring SwiftUI examples, UIKit demos, or any Apple framework sample project. Works with sample code URLs from search results or direct ZIP URLs.',
      { zipUrl: z.string().describe('URL of the Apple Developer documentation page containing a sample code download, or direct ZIP URL from docs-assets.developer.apple.com (e.g., https://developer.apple.com/documentation/mapkit/..., or https://docs-assets.developer.apple.com/published/xxxxx/SampleName.zip)') },
      { readOnlyHint: false },
      async (args) => this.downloadAppleCodeSample(args.zipUrl)
    );

    // Define research tool
    this.server.tool(
      'research_apple_docs',
      'Research Apple Developer Documentation with AI-powered analysis to answer your iOS, macOS, Swift, SwiftUI, or Apple development questions. This intelligent tool automatically searches multiple documentation sources, fetches relevant content, and synthesizes a comprehensive, tailored answer to your specific question. Use this for "how to" questions, implementation guidance, best practices, API comparisons, troubleshooting, learning new frameworks, or understanding complex Apple development concepts. Combines search, content retrieval, and smart summarization in one step—ideal for quick answers about UIKit, SwiftUI, Combine, async/await, CoreData, networking, or any Apple platform topic.',
      {
        docs_query: z.string().describe('Search keywords for finding relevant Apple Developer Documentation. Use specific API names (e.g., "URLSession", "View", "UITableView"), framework names (e.g., "SwiftUI", "Combine", "CoreData"), or technology terms (e.g., "navigation", "async await", "state management"). Add platform context like "iOS", "macOS", or "watchOS" if needed.'),
        user_question: z.string().describe('Your specific question about Apple development. Examples: "How do I implement custom navigation in SwiftUI?", "What\'s the difference between @State and @Binding?", "How to fetch data with async/await?", "Best practices for Core Data performance?", "How to create custom UITableViewCells?"'),
        max_docs: z.number().min(1).max(10).default(5).describe('Maximum number of Apple documentation sources to analyze (1-10, default: 5). Use higher values for complex topics requiring multiple sources.'),
        depth: z.enum(['s', 'm', 'l', 'xl']).default('m').describe('Answer detail level: "s"=brief summary, "m"=moderate explanation (default), "l"=detailed with examples, "xl"=comprehensive deep-dive')
      },
      { readOnlyHint: true },
      async (args, { sendNotification, _meta }) => this.researchAppleDocs(args.docs_query, args.user_question, args.max_docs, args.depth, sendNotification, _meta?.progressToken)
    );


  }

  private setupResources() {
    // Register a resource template that can serve any cached Apple Developer documentation
    // This uses the apple-docs://{slug} pattern
    this.server.registerResource(
      'apple-docs',
      new ResourceTemplate('apple-docs://{framework}/{+path}', {
        list: async () => {
          // Return all currently cached documents as resources
          const allDocs = this.cache.getAll();
          return {
            resources: allDocs.map(doc => {
              const uri = this.generateDocsUri(doc.url);
              const slug = uri.replace('apple-docs://', '');

              // Create a unique, descriptive name from the URI path
              const nameParts = slug.split('/');
              const uniqueName = nameParts.length > 1
                ? `${nameParts[0]}/${nameParts[nameParts.length - 1]}` // e.g., "uikit/gesturerecognizers"
                : slug; // e.g., "swiftui"

              return {
                name: uniqueName,
                uri: uri,
                description: `Apple Developer documentation: ${doc.title}`,
                mimeType: 'text/markdown'
              };
            })
          };
        }
      }),
      {
        title: 'Apple Developer Documentation',
        description: 'Cached Apple Developer documentation pages',
        mimeType: 'text/markdown'
      },
      async (uri, { framework, path }) => {
        // Reconstruct the slug from framework and path
        const slug = path ? `${framework}/${path}` : framework;
        console.error(`Reconstructed slug: ${slug}`);

        // Find the cached document that matches this slug
        const allDocs = this.cache.getAll();
        console.error(`Available docs: ${allDocs.map(doc => this.generateDocsUri(doc.url)).join(', ')}`);

        // Try exact match first
        let matchingDoc = allDocs.find(doc => this.generateDocsUri(doc.url) === `apple-docs://${slug}`);

        // If no exact match, try to find by slug pattern in the original URL
        if (!matchingDoc) {
          console.error(`No exact match found, trying pattern matching for slug: ${slug}`);
          matchingDoc = allDocs.find(doc => {
            const docUri = this.generateDocsUri(doc.url);
            const docSlug = docUri.replace('apple-docs://', '');
            console.error(`Comparing slug '${slug}' with doc slug '${docSlug}'`);
            return docSlug === slug;
          });
        }

        // If still no match, try to find by URL path segments
        if (!matchingDoc) {
          console.error(`No pattern match found, trying URL path matching for slug: ${slug}`);
          matchingDoc = allDocs.find(doc => {
            try {
              const urlObj = new URL(doc.url);
              const pathParts = urlObj.pathname.split('/').filter(p => p.length > 0);
              const cleanParts = pathParts.filter(p => p !== 'documentation');
              const urlSlug = cleanParts.join('/');
              console.error(`URL slug for ${doc.url}: ${urlSlug}`);
              return urlSlug === slug;
            } catch (error) {
              return false;
            }
          });
        }

        if (!matchingDoc) {
          console.error(`No matching document found for slug: ${slug}`);
          console.error(`Available document URLs: ${allDocs.map(doc => doc.url).join(', ')}`);
          throw new Error(`Documentation not found for slug: ${slug}`);
        }

        console.error(`Found matching document: ${matchingDoc.title} for ${matchingDoc.url}`);

        return {
          contents: [{
            uri: uri.href,
            text: matchingDoc.markdown,
            mimeType: 'text/markdown'
          }]
        };
      }
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
    // Use the cached JSON fetching approach to get documentation content
    const result = await fetchAppleDocJsonCached(url);

    // If the document was cached, add an EmbeddedResource to include the content
    const cachedDoc = this.cache.get(url);
    if (cachedDoc && !result.isError) {
      const resourceUri = this.generateDocsUri(url);
      const embeddedResource: EmbeddedResource = {
        type: 'resource',
        resource: {
          uri: resourceUri,
          name: cachedDoc.title || 'Apple Developer Documentation',
          description: `Cached documentation: ${cachedDoc.title}`,
          mimeType: 'text/markdown',
          text: cachedDoc.markdown
        }
      };

      // Add the embedded resource to the content
      return {
        content: [
          ...result.content,
          embeddedResource
        ]
      };
    }

    return result;
  }

  private async downloadAppleCodeSample(zipUrl: string) {
    return downloadAndAnalyzeCodeSample(zipUrl);
  }

  /**
   * Generate docs URI from Apple Developer documentation URL
   * Pattern: apple-docs://{{slug}} where slug is derived from the URL path
   */
  private generateDocsUri(url: string): string {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/').filter(p => p.length > 0);

      // Remove 'documentation' from path if present and create a clean slug
      const cleanParts = pathParts.filter(p => p !== 'documentation');
      const slug = cleanParts.join('/') || 'unknown';

      return `apple-docs://${slug}`;
    } catch (error) {
      // Fallback for invalid URLs
      const hash = this.cache.generateCacheKey(url);
      return `apple-docs://doc-${hash.substring(0, 8)}`;
    }
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
        const niceDepth = {
          's': 'brief',
          'm': 'moderate',
          'l': 'detailed',
          'xl': 'comprehensive'
        }[depth];
        await sendNotification({
          method: "notifications/progress",
          params: {
            progressToken,
            progress: 70,
            total: 100,
            message: `Generating ${niceDepth} answer ...`
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

      const formattedResult = summarizer.formatResult(
        summarizationResult,
        docsQuery,
        userQuestion
      );

      // Add EmbeddedResources for all cached documents that were used
      const embeddedResources: EmbeddedResource[] = [];
      for (const result of limitedResults) {
        const cachedDoc = this.cache.get(result.url);
        if (cachedDoc) {
          const resourceUri = this.generateDocsUri(result.url);
          const embeddedResource: EmbeddedResource = {
            type: 'resource',
            resource: {
              uri: resourceUri,
              name: cachedDoc.title || result.title,
              description: `Source documentation: ${cachedDoc.title || result.title}`,
              mimeType: 'text/markdown',
              text: cachedDoc.markdown
            }
          };
          embeddedResources.push(embeddedResource);
        }
      }

      // Send final progress notification
      if (sendNotification && progressToken) {
        await sendNotification({
          method: "notifications/progress",
          params: {
            progressToken,
            progress: 100,
            total: 100,
            message: `Researched "${userQuestion}"`
          }
        });
      }

      return {
        content: [
          {
            type: "text" as const,
            text: formattedResult,
          },
          ...embeddedResources
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