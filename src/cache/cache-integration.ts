import { DocumentCache, CachedDocument } from './document-cache.js';
import { ResourceManager } from './resource-manager.js';

/**
 * Cache integration configuration
 */
export interface CacheIntegrationConfig {
  /** Enable/disable caching */
  enabled: boolean;
  /** Enable/disable resource registration */
  registerResources: boolean;
  /** Cache size limit (0 = unlimited) */
  maxCacheSize: number;
  /** Enable/disable automatic LRU eviction */
  autoEvict: boolean;
}

/**
 * Cache integration result
 */
export interface CacheIntegrationResult {
  /** Formatted content */
  content: any;
  /** Whether content was served from cache */
  fromCache: boolean;
  /** Cache key used */
  cacheKey: string;
  /** Resource URI if registered */
  resourceUri?: string;
  /** Any errors during caching/registration */
  error?: string;
}

/**
 * Document type detection from URL and content
 */
export function detectDocumentType(url: string, content?: string): string {
  // Analyze URL path to determine document type
  const path = new URL(url).pathname.toLowerCase();
  
  if (path.includes('/documentation/')) {
    if (path.includes('/tutorials/')) return 'tutorial';
    if (path.includes('/sample-code/')) return 'sample';
    if (path.includes('/guides/')) return 'guide';
    
    // Check for API documentation patterns
    const segments = path.split('/').filter(s => s.length > 0);
    if (segments.length >= 3) {
      // /documentation/framework/class or /documentation/framework/protocol
      const lastSegment = segments[segments.length - 1];
      if (lastSegment.includes('protocol')) return 'protocol';
      if (lastSegment.includes('class')) return 'class';
      if (lastSegment.includes('struct')) return 'struct';
      if (lastSegment.includes('enum')) return 'enum';
      if (segments.length === 2) return 'framework'; // /documentation/swiftui
      return 'api';
    }
  }
  
  // Content-based detection if available
  if (content) {
    if (content.includes('## Declaration')) return 'api';
    if (content.includes('## Tutorial')) return 'tutorial';
    if (content.includes('## Sample Code')) return 'sample';
  }
  
  return 'documentation';
}

/**
 * Extract title from formatted content
 */
export function extractTitle(content: string): string {
  // Look for first H1 heading
  const h1Match = content.match(/^#\s+(.+)$/m);
  if (h1Match) {
    return h1Match[1].trim();
  }
  
  // Look for first H2 heading as fallback
  const h2Match = content.match(/^##\s+(.+)$/m);
  if (h2Match) {
    return h2Match[1].trim();
  }
  
  // Extract from URL as last resort
  const urlMatch = content.match(/\*\*Source:\*\*\s+\[([^\]]+)\]/);
  if (urlMatch) {
    return urlMatch[1];
  }
  
  return 'Untitled Document';
}

/**
 * Cache integration helper for markdown formatting functions
 */
export class CacheIntegration {
  private cache: DocumentCache;
  private resourceManager: ResourceManager;
  private config: CacheIntegrationConfig;

  constructor(
    cache: DocumentCache,
    resourceManager: ResourceManager,
    config: Partial<CacheIntegrationConfig> = {}
  ) {
    this.cache = cache;
    this.resourceManager = resourceManager;
    this.config = {
      enabled: true,
      registerResources: true,
      maxCacheSize: 1000,
      autoEvict: true,
      ...config
    };
  }

  /**
   * Cache-aware wrapper for markdown formatting functions
   */
  async cacheAwareFormat(
    url: string,
    formatFunction: () => any,
    options: { skipCache?: boolean } = {}
  ): Promise<CacheIntegrationResult> {
    const cacheKey = this.cache.generateCacheKey(url);
    
    // Check cache first (unless explicitly skipped)
    if (this.config.enabled && !options.skipCache) {
      const cached = this.cache.get(url);
      if (cached) {
        console.error(`📋 Cache hit for ${url}`);
        return {
          content: {
            content: [{
              type: "text" as const,
              text: cached.markdown,
            }],
          },
          fromCache: true,
          cacheKey,
          resourceUri: this.resourceManager.getResourceUri(cached.hash)
        };
      }
    }

    // Execute the formatting function
    console.error(`🔄 Formatting and caching ${url}`);
    const result = formatFunction();
    
    // Handle async results
    const content = await Promise.resolve(result);
    
    // Cache the result if enabled
    if (this.config.enabled && content && !content.isError) {
      try {
        const markdown = content.content[0].text;
        const title = extractTitle(markdown);
        const type = detectDocumentType(url, markdown);
        
        // Create cached document
        const cachedDoc: CachedDocument = {
          url,
          hash: cacheKey,
          markdown,
          title,
          type,
          timestamp: new Date(),
          accessCount: 0
        };
        
        // Handle cache size limit
        if (this.config.maxCacheSize > 0 && this.cache.size() >= this.config.maxCacheSize) {
          if (this.config.autoEvict) {
            const evicted = this.cache.evictLRU(1);
            console.error(`🗑️ Evicted ${evicted.length} documents from cache`);
            
            // Clean up associated resources
            for (const hash of evicted) {
              await this.resourceManager.unregisterResource(hash);
            }
          } else {
            console.error('⚠️ Cache size limit reached, skipping cache');
            return {
              content,
              fromCache: false,
              cacheKey,
              error: 'Cache size limit reached'
            };
          }
        }
        
        // Store in cache
        this.cache.set(url, cachedDoc);
        console.error(`💾 Cached document: ${title} (${type})`);
        
        // Register as MCP resource if enabled
        let resourceUri: string | undefined;
        if (this.config.registerResources) {
          const registration = await this.resourceManager.registerResource(cachedDoc);
          if (registration.success) {
            resourceUri = registration.uri;
          } else {
            console.error(`❌ Failed to register resource: ${registration.error}`);
          }
        }
        
        return {
          content,
          fromCache: false,
          cacheKey,
          resourceUri
        };
        
      } catch (error) {
        console.error('❌ Error during caching:', error);
        return {
          content,
          fromCache: false,
          cacheKey,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    }
    
    // Return content without caching
    return {
      content,
      fromCache: false,
      cacheKey
    };
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return this.cache.getStats();
  }

  /**
   * Get resource manager statistics
   */
  getResourceStats() {
    return this.resourceManager.getStats();
  }

  /**
   * Get configuration
   */
  getConfig(): CacheIntegrationConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<CacheIntegrationConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Clear cache and unregister all resources
   */
  async clearAll(): Promise<void> {
    const allHashes = this.cache.getAllHashes();
    
    // Unregister all resources
    for (const hash of allHashes) {
      await this.resourceManager.unregisterResource(hash);
    }
    
    // Clear cache
    this.cache.clear();
    
    console.error('🧹 Cleared all cache and resources');
  }
}
