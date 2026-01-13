import { Page } from '@playwright/test';

interface CacheEntry {
  url: string;
  validUntil: number;
  size: number;
  etag?: string;
  lastAccess: number;
  pattern?: string;
}

/**
 * Helper class for inspecting IndexedDB cache in tests
 */
export class CacheHelper {
  constructor(private page: Page) {}

  /**
   * Get all cached entries from IndexedDB
   */
  async getAllCachedEntries(): Promise<CacheEntry[]> {
    return this.page.evaluate(async () => {
      return new Promise((resolve) => {
        const request = indexedDB.open('zephyr-cache-db', 3);
        request.onsuccess = () => {
          const db = request.result;
          try {
            const tx = db.transaction('responses', 'readonly');
            const store = tx.objectStore('responses');
            const getAllRequest = store.getAll();
            getAllRequest.onsuccess = () => {
              resolve(
                getAllRequest.result.map((r: any) => ({
                  url: r.url,
                  validUntil: r.validUntil,
                  size: r.size,
                  etag: r.etag,
                  lastAccess: r.lastAccess,
                  pattern: r.pattern,
                }))
              );
            };
            getAllRequest.onerror = () => resolve([]);
          } catch {
            resolve([]);
          }
        };
        request.onerror = () => resolve([]);
      });
    });
  }

  /**
   * Check if a specific URL is cached
   */
  async isCached(url: string): Promise<boolean> {
    const entries = await this.getAllCachedEntries();
    return entries.some((e) => e.url.includes(url));
  }

  /**
   * Get cache entry details for a URL
   */
  async getCacheEntry(
    url: string
  ): Promise<{
    url: string;
    validUntil: number;
    size: number;
    etag?: string;
    headers: Record<string, string>;
  } | null> {
    return this.page.evaluate(async (targetUrl) => {
      return new Promise((resolve) => {
        const request = indexedDB.open('zephyr-cache-db', 3);
        request.onsuccess = () => {
          const db = request.result;
          try {
            const tx = db.transaction('responses', 'readonly');
            const store = tx.objectStore('responses');
            const getRequest = store.get(targetUrl);
            getRequest.onsuccess = () => {
              const r = getRequest.result;
              if (!r) resolve(null);
              else
                resolve({
                  url: r.url,
                  validUntil: r.validUntil,
                  size: r.size,
                  etag: r.etag,
                  headers: r.headers,
                });
            };
            getRequest.onerror = () => resolve(null);
          } catch {
            resolve(null);
          }
        };
        request.onerror = () => resolve(null);
      });
    }, url);
  }

  /**
   * Get total cache size in bytes
   */
  async getTotalCacheSize(): Promise<number> {
    const entries = await this.getAllCachedEntries();
    return entries.reduce((sum, e) => sum + (e.size || 0), 0);
  }

  /**
   * Get count of cached entries
   */
  async getCacheCount(): Promise<number> {
    const entries = await this.getAllCachedEntries();
    return entries.length;
  }

  /**
   * Wait for URL to be cached
   */
  async waitForCached(url: string, timeout = 10000): Promise<void> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      if (await this.isCached(url)) return;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`URL ${url} was not cached within ${timeout}ms`);
  }

  /**
   * Clear all IndexedDB data
   */
  async clearAll(): Promise<void> {
    await this.page.evaluate(async () => {
      return new Promise<void>((resolve) => {
        const request = indexedDB.open('zephyr-cache-db', 3);
        request.onsuccess = () => {
          const db = request.result;
          try {
            const tx = db.transaction('responses', 'readwrite');
            const store = tx.objectStore('responses');
            store.clear();
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
          } catch {
            resolve();
          }
        };
        request.onerror = () => resolve();
      });
    });
  }
}
