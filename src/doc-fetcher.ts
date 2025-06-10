import fetch from 'node-fetch';
import { formatJsonDocumentation } from './doc-parsers.js';

/**
 * Interface for Apple Documentation JSON reference
 */
interface AppleDocReference {
  title: string;
  url: string;
  type?: string;
  role?: string;
  abstract?: any[];
}

/**
 * Interface for Apple Documentation JSON
 */
interface AppleDocJSON {
  references?: Record<string, AppleDocReference>;
  identifier?: string;
  title?: string;
  url?: string;
  abstract?: any[];
  primaryContentSections?: any[];
  topics?: any[];
  relationshipsSections?: any[];
  availability?: any;
  metadata?: {
    title?: string;
    roleHeading?: string;
    sourceLanguage?: string;
  };
}

/**
 * Convert a web URL to a JSON API URL
 */
function convertToJsonApiUrl(webUrl: string): string {
  // Remove trailing slash if present
  if (webUrl.endsWith('/')) {
    webUrl = webUrl.slice(0, -1);
  }

  // Extract the path from the URL
  let path = new URL(webUrl).pathname;

  // For documentation URLs, format for the JSON API
  if (path.includes('/documentation/')) {
    // Remove /documentation/ prefix
    path = path.replace('/documentation/', '');
    // Convert to JSON API URL format
    return `https://developer.apple.com/tutorials/data/documentation/${path}.json`;
  }

  // If not a documentation URL, return the original
  return webUrl;
}

/**
 * Fetch JSON documentation from Apple Developer Documentation
 * @param url The URL of the documentation page
 * @param maxDepth Maximum recursion depth (to prevent infinite loops)
 * @returns Formatted documentation content
 */
export async function fetchAppleDocJson(url: string, maxDepth: number = 2): Promise<any> {
  try {
    // Validate that this is an Apple Developer URL
    if (!url.includes('developer.apple.com')) {
      throw new Error('URL must be from developer.apple.com');
    }

    // Convert web URL to JSON API URL if needed
    const jsonApiUrl = url.includes('.json') ? url : convertToJsonApiUrl(url);

    console.error(`Fetching Apple doc JSON from: ${jsonApiUrl}`);

    // Fetch the documentation JSON
    const response = await fetch(jsonApiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch JSON content: ${response.status}`);
    }

    // Parse the JSON response
    const jsonData = await response.json() as AppleDocJSON;

    // If the JSON doesn't have primary content but has references to other docs,
    // fetch the first reference if we haven't exceeded max depth
    if (!jsonData.primaryContentSections &&
      jsonData.references &&
      Object.keys(jsonData.references).length > 0 &&
      maxDepth > 0) {

      // Find the main reference to follow (usually first in the list)
      const mainReferenceKey = Object.keys(jsonData.references)[0];
      const mainReference = jsonData.references[mainReferenceKey];

      if (mainReference && mainReference.url) {
        // Recursively fetch the referenced documentation
        const refUrl = `https://developer.apple.com/tutorials/data/documentation/${mainReference.url}.json`;
        return await fetchAppleDocJson(refUrl, maxDepth - 1);
      }
    }

    // Format and return the JSON documentation
    return formatJsonDocumentation(jsonData, url);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error fetching Apple doc JSON:', errorMessage);

    return {
      content: [
        {
          type: "text" as const,
          text: `Error: Failed to get Apple doc content: ${errorMessage}\n\nPlease try accessing the documentation directly at: ${url}`,
        }
      ],
      isError: true
    };
  }
}
