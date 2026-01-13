import { Page } from '@playwright/test';

interface ZephyrStats {
  hits: number;
  misses: number;
  errors: number;
  evictions: number;
  revalidations: number;
  entries: number;
  storageUsed: number;
  storageUsedMB: string;
  hitRate: string;
  prefetches?: number;
}

interface QuotaUsage {
  used: number;
  max: number;
  percentage: string;
  available: number;
}

interface PrefetchResult {
  status: string;
  url: string;
  error?: string;
  httpStatus?: number;
}

/**
 * Helper class for interacting with the window.zephyr API
 */
export class ZephyrAPIHelper {
  constructor(private page: Page) {}

  /**
   * Wait for zephyr API to be available and service worker ready
   */
  async waitForReady(timeout = 30000): Promise<void> {
    await this.page.waitForFunction(
      () =>
        typeof window.zephyr !== 'undefined' &&
        typeof window.zephyr.ready === 'function',
      { timeout }
    );
    await this.page.evaluate(() => window.zephyr.ready());
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<ZephyrStats> {
    return this.page.evaluate(() => window.zephyr.stats());
  }

  /**
   * Clear all cache
   */
  async clear(): Promise<boolean> {
    return this.page.evaluate(() => window.zephyr.clear());
  }

  /**
   * Clear cache by pattern
   */
  async clearPattern(pattern: string): Promise<number> {
    return this.page.evaluate((p) => window.zephyr.clearPattern(p), pattern);
  }

  /**
   * Invalidate specific URL
   */
  async invalidateUrl(url: string): Promise<boolean> {
    return this.page.evaluate((u) => window.zephyr.invalidateUrl(u), url);
  }

  /**
   * Get quota usage
   */
  async getQuota(): Promise<QuotaUsage> {
    return this.page.evaluate(() => window.zephyr.quota());
  }

  /**
   * Manually prefetch a URL
   */
  async prefetch(url: string): Promise<PrefetchResult> {
    return this.page.evaluate((u) => window.zephyr.prefetch(u), url);
  }

  /**
   * Toggle debug mode
   */
  async toggleDebug(): Promise<boolean> {
    const result = await this.page.evaluate(() => window.zephyr.debug());
    return result.debugMode;
  }

  /**
   * Check if zephyr API is available
   */
  async isAvailable(): Promise<boolean> {
    return this.page.evaluate(() => typeof window.zephyr !== 'undefined');
  }

  /**
   * Get hit rate as a number (0-100)
   */
  async getHitRate(): Promise<number> {
    const stats = await this.getStats();
    if (stats.hitRate === 'N/A') return 0;
    return parseFloat(stats.hitRate.replace('%', ''));
  }

  /**
   * Wait for a specific number of cache entries
   */
  async waitForEntries(count: number, timeout = 10000): Promise<void> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      const stats = await this.getStats();
      if (stats.entries >= count) return;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`Did not reach ${count} entries within ${timeout}ms`);
  }
}

// Extend Window interface for TypeScript
declare global {
  interface Window {
    zephyr: {
      clear(): Promise<boolean>;
      clearPattern(pattern: string): Promise<number>;
      invalidate(pattern: string): Promise<number>;
      invalidateUrl(url: string): Promise<boolean>;
      stats(): Promise<ZephyrStats>;
      quota(): Promise<QuotaUsage>;
      debug(): Promise<{ debugMode: boolean }>;
      ready(): Promise<boolean>;
      prefetch(url: string): Promise<PrefetchResult>;
      onQuotaWarning(
        callback: (event: { percentage: number; used: number; max: number }) => void
      ): void;
      onPrecacheComplete(
        callback: (event: { succeeded: number; failed: number; total: number }) => void
      ): void;
    };
    zephyrConfig?: unknown;
    zephyrLinkPredictor?: unknown;
    zephyrInitLinkPrediction?: (config: unknown) => Promise<unknown>;
    ZephyrLinkPredictor?: new (config: unknown, rules: unknown[]) => unknown;
  }
}
