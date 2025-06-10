import * as cheerio from 'cheerio';

/**
 * Interface for Apple Doc Search Results
 */
export interface AppleDocSearchResult {
  title: string;
  url: string;
  description: string;
  type: string;
}

/**
 * Parse HTML search results from Apple Developer Documentation
 * 
 * @param html HTML content from the search results page
 * @param query Original search query
 * @param searchUrl URL of the search
 * @returns Formatted search results or error response
 */
export function parseSearchResults(html: string, query: string, searchUrl: string) {
  try {
    const $ = cheerio.load(html);
    const results: AppleDocSearchResult[] = [];
    
    // Find all search result items
    $('.search-results .search-result').each((i, element) => {
      const resultItem = $(element);
      
      // Extract type (documentation, video, etc.)
      const resultType = resultItem.hasClass('documentation') ? 'documentation' : 
                       resultItem.hasClass('video') ? 'video' : 
                       resultItem.hasClass('sample') ? 'sample' : 
                       resultItem.hasClass('general') ? 'general' : 'other';
      
      // Extract title
      const titleElement = resultItem.find('.result-title');
      const title = titleElement.text().trim();
      
      // Extract URL
      const urlElement = titleElement.find('a');
      let url = urlElement.attr('href') || '';
      if (url && url.startsWith('/')) {
        url = `https://developer.apple.com${url}`;
      }
      
      // Extract description
      const description = resultItem.find('.result-description').text().trim();
      
      if (title && url) {
        results.push({
          title,
          url,
          description,
          type: resultType
        });
      }
    });
    
    // If no results were found
    if (results.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: `No results found for "${query}". You can view the search page directly at: ${searchUrl}`,
          }
        ],
      };
    }
    
    // Format results for display
    const formattedResults = results.map(result => {
      return `## [${result.title}](${result.url})\n${result.description}\n*Type: ${result.type}*\n`;
    }).join('\n');
    
    return {
      content: [
        {
          type: "text" as const,
          text: `# Search Results for "${query}"\n\n${formattedResults}\n\nView all results: ${searchUrl}`,
        }
      ],
    };
  } catch (error) {
    console.error('Error parsing search results:', error);
    return {
      content: [
        {
          type: "text" as const,
          text: `Error parsing search results for "${query}". You can view the search page directly at: ${searchUrl}`,
        }
      ],
      isError: true
    };
  }
}

/**
 * Filter search results by content type
 * 
 * @param results The search results to filter
 * @param type The type to filter by
 * @returns Filtered results
 */
export function filterResultsByType(results: AppleDocSearchResult[], type: string): AppleDocSearchResult[] {
  if (type === 'all') {
    return results;
  }
  
  return results.filter(result => {
    if (type === 'api' && result.type === 'documentation') {
      return true;
    }
    if (type === 'guide' && result.type === 'documentation') {
      return true;
    }
    if (type === 'sample' && result.type === 'sample') {
      return true;
    }
    if (type === 'video' && result.type === 'video') {
      return true;
    }
    return false;
  });
}
