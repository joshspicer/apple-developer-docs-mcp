import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { AppleDocSearchResult } from './search-parser.js';

/**
 * Configuration for content summarization
 */
export interface SummarizationConfig {
  maxDocuments: number;
  maxContentLength: number;
  temperature: number;
  maxTokens: number;
}

/**
 * Result of summarization operation
 */
export interface SummarizationResult {
  insights: string;
  relevantDocs: Array<{
    title: string;
    url: string;
    relevance: string;
  }>;
  sourceCount: number;
}

/**
 * Handles content summarization using MCP SDK sampling
 */
export class DocumentSummarizer {
  private server: McpServer;
  private config: SummarizationConfig;

  constructor(server: McpServer, config: Partial<SummarizationConfig> = {}) {
    this.server = server;
    this.config = {
      maxDocuments: 5,
      maxContentLength: 15000,
      temperature: 0.3,
      maxTokens: 1000,
      ...config
    };
  }

  /**
   * Prepare content for summarization by chunking and selecting most relevant parts
   */
  prepareContent(searchResults: AppleDocSearchResult[], documentContents: string[], userQuestion: string): string {
    // Combine search results with their content
    const combinedContent = searchResults.slice(0, this.config.maxDocuments).map((result, index) => {
      const content = documentContents[index] || '';
      return `## ${result.title}\n**URL:** ${result.url}\n**Type:** ${result.type}\n\n${content}`;
    }).join('\n\n---\n\n');

    // Truncate if content is too long
    if (combinedContent.length > this.config.maxContentLength) {
      const truncated = combinedContent.substring(0, this.config.maxContentLength);
      const lastCompleteSection = truncated.lastIndexOf('\n\n---\n\n');
      
      if (lastCompleteSection > 0) {
        return truncated.substring(0, lastCompleteSection) + '\n\n[Content truncated for length]';
      }
      return truncated + '\n\n[Content truncated for length]';
    }

    return combinedContent;
  }

  /**
   * Summarize content using MCP SDK sampling
   */
  async summarizeContent(
    searchResults: AppleDocSearchResult[], 
    documentContents: string[], 
    userQuestion: string, 
    docsQuery: string
  ): Promise<SummarizationResult> {
    try {
      // Prepare content for summarization
      const preparedContent = this.prepareContent(searchResults, documentContents, userQuestion);
      
      // Use MCP SDK sampling to get LLM summary with multiple messages
      const samplingResult = await this.server.server.createMessage({
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `You are an expert Apple developer documentation analyst. When answering questions, focus on practical implementation details.

Guidelines:
- Prioritize code examples, API signatures, and method details
- Include specific class names, protocols, and property types
- Mention OS version requirements and framework dependencies
- Highlight any best practices, performance tips, or common pitfalls
- Reference related APIs or alternative approaches when relevant
- Use markdown code blocks for any code snippets or API signatures`
            }
          },
          {
            role: 'user',
            content: {
              type: 'text',
              text: `I need help with the following question about Apple development:
${userQuestion}

(Search context: ${docsQuery})`
            }
          },
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Here is the relevant Apple Developer documentation I found:

${preparedContent}`
            }
          },
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Please provide a clear, concise, technically detailed response that helps me implement a solution effectively. Just the markdown-formatted text response, no intro or conclusion.

My question: ${userQuestion}`
            }
          }
        ],
        maxTokens: this.config.maxTokens,
        temperature: this.config.temperature
      });

      // Extract summary from sampling result
      const summaryText = samplingResult.content.type === 'text' 
        ? samplingResult.content.text 
        : 'Unable to generate summary from the provided content.';

      // Create relevant docs list
      const relevantDocs = searchResults.slice(0, this.config.maxDocuments).map(result => ({
        title: result.title,
        url: result.url,
        relevance: result.description || 'Related documentation'
      }));

      return {
        insights: summaryText,
        relevantDocs,
        sourceCount: Math.min(searchResults.length, this.config.maxDocuments)
      };

    } catch (error) {
      console.error('Error during summarization:', error);
      
      // Fallback summary if sampling fails
      const fallbackSummary = this.createFallbackSummary(searchResults, userQuestion, docsQuery);
      
      return {
        insights: fallbackSummary,
        relevantDocs: searchResults.slice(0, this.config.maxDocuments).map(result => ({
          title: result.title,
          url: result.url,
          relevance: result.description || 'Related documentation'
        })),
        sourceCount: Math.min(searchResults.length, this.config.maxDocuments)
      };
    }
  }

  /**
   * Create a fallback summary when sampling fails
   */
  private createFallbackSummary(searchResults: AppleDocSearchResult[], userQuestion: string, docsQuery: string): string {
    const docCount = searchResults.length;
    const topDocs = searchResults.slice(0, 3);
    
    return `## Search Results Summary

Found ${docCount} documentation resources related to "${docsQuery}" that may help answer your question: "${userQuestion}"

**Top Resources:**
${topDocs.map(doc => `- **${doc.title}** (${doc.type}): ${doc.description}`).join('\n')}

**Note:** Automated summarization is temporarily unavailable. Please review the full documentation at the provided links for detailed information.

**Recommendation:** Focus on the documentation marked as "API" or "Guide" types for the most relevant technical information.`;
  }

  /**
   * Format the final result for display
   */
  formatResult(result: SummarizationResult, docsQuery: string, userQuestion: string): string {
    let formatted = result.insights.trim();

    if (!formatted) {
      formatted = `No insights available for the query "${docsQuery}". Please try a different question.`;
    }

    formatted += `---\n\n`;
    formatted += `This summary was generated by analyzing ${result.sourceCount} Apple Developer documentation sources.\n`;
    result.relevantDocs.forEach((doc, index) => {
      formatted += `${index + 1}. [${doc.title}](${doc.url})\n`;
    });
    formatted += `*For the complete information, please refer to the original documentation.*`;

    return formatted;
  }
}
