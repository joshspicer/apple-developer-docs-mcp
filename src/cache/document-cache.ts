import { createHash } from 'crypto';

/**
 * Represents a cached Apple Developer documentation document
 */
export interface CachedDocument {
  /** Original documentation URL */
  url: string;
  /** URL hash for cache key/resource URI */
  hash: string;
  /** Formatted markdown content */
  markdown: string;
  /** Document title */
  title: string;
  /** Documentation type (api, guide, framework, etc.) */
  type: string;
  /** Cache creation timestamp */
  timestamp: Date;
  /** Usage tracking for LRU eviction */
  accessCount: number;
}

/**
 * Cache statistics for monitoring and optimization
 */
export interface CacheStats {
  /** Total number of cached documents */
  totalDocuments: number;
  /** Total access count across all documents */
  totalAccessCount: number;
  /** Average access count per document */
  averageAccessCount: number;
  /** Memory usage estimation in bytes */
  estimatedMemoryUsage: number;
}

/**
 * In-memory cache for Apple Developer documentation markdown content
 * Uses URL-based hashing for consistent cache keys and resource URIs
 */
export class DocumentCache {
  private cache: Map<string, CachedDocument> = new Map();

  /**
   * Generate a consistent cache key from a URL using SHA-256 hashing
   * @param url The documentation URL
   * @returns 64-character hexadecimal hash string
   */
  generateCacheKey(url: string): string {
    return createHash('sha256').update(url).digest('hex');
  }

  /**
   * Store a document in the cache
   * @param url The documentation URL
   * @param document The cached document data
   */
  set(url: string, document: CachedDocument): void {
    // Ensure hash matches URL
    document.hash = this.generateCacheKey(url);
    document.accessCount = 0; // Reset access count on cache
    document.timestamp = new Date(); // Update cache timestamp
    
    this.cache.set(document.hash, document);
  }

  /**
   * Retrieve a document from the cache and increment access count
   * @param url The documentation URL
   * @returns The cached document or undefined if not found
   */
  get(url: string): CachedDocument | undefined {
    const hash = this.generateCacheKey(url);
    const document = this.cache.get(hash);
    
    if (document) {
      // Increment access count for LRU tracking
      document.accessCount++;
    }
    
    return document;
  }

  /**
   * Check if a document exists in the cache
   * @param url The documentation URL
   * @returns True if the document is cached
   */
  has(url: string): boolean {
    const hash = this.generateCacheKey(url);
    return this.cache.has(hash);
  }

  /**
   * Get a document by its hash (used for resource access)
   * @param hash The document hash
   * @returns The cached document or undefined if not found
   */
  getByHash(hash: string): CachedDocument | undefined {
    const document = this.cache.get(hash);
    
    if (document) {
      // Increment access count for LRU tracking
      document.accessCount++;
    }
    
    return document;
  }

  /**
   * Remove a document from the cache
   * @param url The documentation URL
   * @returns True if the document was removed
   */
  delete(url: string): boolean {
    const hash = this.generateCacheKey(url);
    return this.cache.delete(hash);
  }

  /**
   * Remove a document from the cache by hash
   * @param hash The document hash
   * @returns True if the document was removed
   */
  deleteByHash(hash: string): boolean {
    return this.cache.delete(hash);
  }

  /**
   * Get all cached documents
   * @returns Array of all cached documents
   */
  getAll(): CachedDocument[] {
    return Array.from(this.cache.values());
  }

  /**
   * Get all document hashes (useful for resource listing)
   * @returns Array of all document hashes
   */
  getAllHashes(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Get the current cache size
   * @returns Number of cached documents
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Clear all cached documents
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics for monitoring
   * @returns Cache statistics object
   */
  getStats(): CacheStats {
    const documents = this.getAll();
    const totalDocuments = documents.length;
    const totalAccessCount = documents.reduce((sum, doc) => sum + doc.accessCount, 0);
    const averageAccessCount = totalDocuments > 0 ? totalAccessCount / totalDocuments : 0;
    
    // Estimate memory usage (rough approximation)
    const estimatedMemoryUsage = documents.reduce((sum, doc) => {
      return sum + 
        doc.url.length * 2 +         // URL string (UTF-16)
        doc.hash.length * 2 +        // Hash string (UTF-16)
        doc.markdown.length * 2 +    // Markdown content (UTF-16)
        doc.title.length * 2 +       // Title string (UTF-16)
        doc.type.length * 2 +        // Type string (UTF-16)
        100;                         // Overhead for object structure
    }, 0);

    return {
      totalDocuments,
      totalAccessCount,
      averageAccessCount,
      estimatedMemoryUsage
    };
  }

  /**
   * Get least recently used documents for eviction
   * @param count Number of documents to return
   * @returns Array of documents sorted by access count (ascending)
   */
  getLeastRecentlyUsed(count: number): CachedDocument[] {
    return this.getAll()
      .sort((a, b) => {
        // First sort by access count (ascending)
        if (a.accessCount !== b.accessCount) {
          return a.accessCount - b.accessCount;
        }
        // Then by timestamp (oldest first)
        return a.timestamp.getTime() - b.timestamp.getTime();
      })
      .slice(0, count);
  }

  /**
   * Evict least recently used documents to free memory
   * @param count Number of documents to evict
   * @returns Array of evicted document hashes
   */
  evictLRU(count: number): string[] {
    const toEvict = this.getLeastRecentlyUsed(count);
    const evictedHashes: string[] = [];
    
    for (const doc of toEvict) {
      if (this.cache.delete(doc.hash)) {
        evictedHashes.push(doc.hash);
      }
    }
    
    return evictedHashes;
  }
}
