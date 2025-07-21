import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { DocumentCache, CachedDocument } from './document-cache.js';

/**
 * Resource metadata for MCP resource registration
 */
export interface ResourceMetadata {
  /** Resource title */
  title: string;
  /** Resource description */
  description: string;
  /** MIME type */
  mimeType: string;
  /** Original source URL */
  sourceUrl: string;
  /** Documentation type */
  type: string;
  /** Cache timestamp */
  cachedAt: Date;
}

/**
 * Resource registration result
 */
export interface ResourceRegistration {
  /** Resource URI */
  uri: string;
  /** Resource name for MCP */
  name: string;
  /** Registration success status */
  success: boolean;
  /** Error message if registration failed */
  error?: string;
}

/**
 * Resource manager statistics
 */
export interface ResourceManagerStats {
  /** Total registered resources */
  totalResources: number;
  /** Successful registrations */
  successfulRegistrations: number;
  /** Failed registrations */
  failedRegistrations: number;
  /** Resource types breakdown */
  resourceTypes: Record<string, number>;
}

/**
 * Manages MCP resource registration and lifecycle for cached Apple Developer documentation
 */
export class ResourceManager {
  private server: McpServer;
  private cache: DocumentCache;
  private registeredResources: Map<string, ResourceRegistration> = new Map();
  private registrationStats: ResourceManagerStats = {
    totalResources: 0,
    successfulRegistrations: 0,
    failedRegistrations: 0,
    resourceTypes: {}
  };

  constructor(server: McpServer, cache: DocumentCache) {
    this.server = server;
    this.cache = cache;
  }

  /**
   * Generate resource URI from document URL
   * @param url Document URL
   * @returns Resource URI
   */
  private generateResourceUri(url: string): string {
    // Convert Apple Developer URL to a clean apple-docs://docs/{{slug}} URI pattern
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/').filter(p => p.length > 0);
      
      // Remove 'documentation' from path if present and create a clean slug
      const cleanParts = pathParts.filter(p => p !== 'documentation');
      const slug = cleanParts.join('/') || 'unknown';
      
      return `apple-docs://docs/${slug}`;
    } catch (error) {
      // Fallback for invalid URLs - use the cache's key generation
      const hash = this.cache.generateCacheKey(url);
      return `apple-docs://docs/doc-${hash.substring(0, 8)}`;
    }
  }

  /**
   * Generate resource name from document
   * @param document Cached document
   * @returns Resource name
   */
  private generateResourceName(document: CachedDocument): string {
    // Create a clean, readable name from the title
    const sanitizedTitle = document.title
      .replace(/[^a-zA-Z0-9\s\-\.]/g, '')
      .replace(/\s+/g, '-')
      .toLowerCase();
    
    // Include the type for clarity
    return `${sanitizedTitle}`;
  }

  /**
   * Create resource metadata from cached document
   * @param document Cached document
   * @returns Resource metadata
   */
  private createResourceMetadata(document: CachedDocument): ResourceMetadata {
    return {
      title: document.title,
      description: `Apple Developer documentation: ${document.title}`,
      mimeType: 'text/markdown',
      sourceUrl: document.url,
      type: document.type,
      cachedAt: document.timestamp
    };
  }

  /**
   * Register a cached document as an MCP resource
   * @param document Cached document to register
   * @returns Registration result
   */
  async registerResource(document: CachedDocument): Promise<ResourceRegistration> {
    const uri = this.generateResourceUri(document.url);
    const name = this.generateResourceName(document);
    const metadata = this.createResourceMetadata(document);

    const registration: ResourceRegistration = {
      uri,
      name,
      success: false
    };

    try {
      // Check if already registered
      if (this.registeredResources.has(document.hash)) {
        console.error(`Resource already registered: ${uri}`);
        registration.success = true; // Consider already registered as success
        return registration;
      }

      // Register the resource with MCP server
      this.server.resource(
        name,
        uri,
        {
          title: metadata.title,
          description: metadata.description,
          mimeType: metadata.mimeType
        },
        async () => {
          // Resource read callback - return the cached markdown content
          const cachedDoc = this.cache.getByHash(document.hash);
          if (!cachedDoc) {
            throw new Error(`Documentation not found: ${document.title}`);
          }

          return {
            contents: [{
              uri: uri,
              text: cachedDoc.markdown,
              mimeType: 'text/markdown'
            }]
          };
        }
      );

      // Track successful registration
      registration.success = true;
      this.registeredResources.set(document.hash, registration);
      
      // Update statistics
      this.registrationStats.totalResources++;
      this.registrationStats.successfulRegistrations++;
      this.registrationStats.resourceTypes[document.type] = 
        (this.registrationStats.resourceTypes[document.type] || 0) + 1;

      console.error(`✅ Registered Apple Developer documentation: ${document.title}`);
      
    } catch (error) {
      registration.success = false;
      registration.error = error instanceof Error ? error.message : String(error);
      
      // Update statistics
      this.registrationStats.totalResources++;
      this.registrationStats.failedRegistrations++;
      
      console.error(`❌ Failed to register documentation: ${document.title}`, error);
    }

    return registration;
  }

  /**
   * Register all cached documents as MCP resources
   * @returns Array of registration results
   */
  async registerAllCachedDocuments(): Promise<ResourceRegistration[]> {
    const documents = this.cache.getAll();
    const registrations: ResourceRegistration[] = [];

    console.error(`📋 Registering ${documents.length} Apple Developer documentation pages as MCP resources...`);

    for (const document of documents) {
      const registration = await this.registerResource(document);
      registrations.push(registration);
    }

    const successful = registrations.filter(r => r.success).length;
    const failed = registrations.length - successful;
    
    console.error(`✅ Documentation registration complete: ${successful} successful, ${failed} failed`);

    return registrations;
  }

  /**
   * Unregister a resource
   * @param hash Document hash
   * @returns True if resource was unregistered
   */
  async unregisterResource(hash: string): Promise<boolean> {
    const registration = this.registeredResources.get(hash);
    if (!registration) {
      return false;
    }

    try {
      // Note: MCP SDK doesn't provide a direct unregister method
      // Resources are typically managed through the resource callback lifecycle
      // We'll track the unregistration in our internal state
      
      this.registeredResources.delete(hash);
      
      // Update statistics
      const document = this.cache.getByHash(hash);
      if (document) {
        this.registrationStats.resourceTypes[document.type] = 
          Math.max(0, (this.registrationStats.resourceTypes[document.type] || 0) - 1);
      }
      
      console.error(`🗑️ Unregistered Apple Developer documentation: ${registration.uri}`);
      return true;
      
    } catch (error) {
      console.error(`❌ Failed to unregister documentation: ${registration.uri}`, error);
      return false;
    }
  }

  /**
   * Get resource registration by document hash
   * @param hash Document hash
   * @returns Resource registration or undefined
   */
  getResourceRegistration(hash: string): ResourceRegistration | undefined {
    return this.registeredResources.get(hash);
  }

  /**
   * Get all registered resources
   * @returns Array of all resource registrations
   */
  getAllRegistrations(): ResourceRegistration[] {
    return Array.from(this.registeredResources.values());
  }

  /**
   * Check if a document is registered as a resource
   * @param hash Document hash
   * @returns True if registered
   */
  isRegistered(hash: string): boolean {
    return this.registeredResources.has(hash);
  }

  /**
   * Get resource manager statistics
   * @returns Resource manager statistics
   */
  getStats(): ResourceManagerStats {
    return { ...this.registrationStats };
  }

  /**
   * Clean up resources that are no longer in cache
   * @returns Number of cleaned up resources
   */
  async cleanupStaleResources(): Promise<number> {
    const staleResources: string[] = [];
    
    for (const [hash, registration] of this.registeredResources) {
      if (!this.cache.getByHash(hash)) {
        staleResources.push(hash);
      }
    }

    let cleaned = 0;
    for (const hash of staleResources) {
      if (await this.unregisterResource(hash)) {
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.error(`🧹 Cleaned up ${cleaned} stale resources`);
    }

    return cleaned;
  }

  /**
   * Refresh all resource registrations
   * This is useful when the cache has been updated
   */
  async refreshAllRegistrations(): Promise<void> {
    console.error('🔄 Refreshing all resource registrations...');
    
    // Clean up stale resources first
    await this.cleanupStaleResources();
    
    // Register any new cached documents
    await this.registerAllCachedDocuments();
  }

  /**
   * Get resource URI by document hash
   * @param hash Document hash
   * @returns Resource URI
   */
  getResourceUri(hash: string): string {
    const document = this.cache.getByHash(hash);
    if (!document) {
      return `apple-docs://documentation/unknown-${hash}`;
    }
    return this.generateResourceUri(document.url);
  }

  /**
   * Get resource URIs for all registered resources
   * @returns Array of resource URIs
   */
  getAllResourceUris(): string[] {
    return Array.from(this.registeredResources.values()).map(r => r.uri);
  }
}
