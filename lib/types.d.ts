/**
 * Zephyr - TypeScript Definitions
 *
 * @version 0.2.0
 * @license Apache-2.0
 * @copyright 2019-2025 SOLUTAS GmbH
 */

// ============================================================================
// Invalidation Configuration
// ============================================================================

/**
 * Manifest-based invalidation configuration
 */
export interface ManifestInvalidationConfig {
  type: 'manifest';
  /** URL of the cache manifest endpoint */
  url: string;
  /** Polling interval in milliseconds (default: 60000) */
  interval?: number;
  /** Custom parser for manifest response */
  parser?: (response: Response) => Promise<CacheManifest>;
}

/**
 * Header-based invalidation configuration
 */
export interface HeaderInvalidationConfig {
  type: 'header';
  /** Header name to use for version checking (e.g., 'X-Cache-Version') */
  header: string;
  /** Custom version comparator */
  compare?: (cached: string, current: string) => boolean;
}

/**
 * HTTP standard header invalidation (default)
 */
export interface HttpHeaderInvalidationConfig {
  type?: 'http';
  /** Whether to respect standard HTTP cache headers (default: true) */
  respectHttpHeaders?: boolean;
}

export type InvalidationConfig =
  | ManifestInvalidationConfig
  | HeaderInvalidationConfig
  | HttpHeaderInvalidationConfig;

/**
 * Cache manifest format for manifest-based invalidation
 */
export interface CacheManifest {
  /** Global version string (triggers full revalidation on change) */
  version?: string;
  /** Pattern-specific timestamps for selective invalidation */
  patterns?: Record<string, string>;
}

// ============================================================================
// Quota Configuration
// ============================================================================

export interface QuotaConfig {
  /** Maximum cache size in bytes (default: 50MB) */
  maxSize?: number;
  /** Warning threshold as decimal (default: 0.8 = 80%) */
  warningThreshold?: number;
  /** Action when quota is exceeded */
  onQuotaExceeded?: 'evict-lru' | 'stop-caching' | 'clear-all';
}

export interface QuotaUsage {
  /** Bytes currently used */
  used: number;
  /** Maximum bytes allowed */
  max: number;
  /** Usage as percentage string (e.g., "45.2%") */
  percentage: string;
  /** Bytes available */
  available: number;
}

export interface QuotaWarningEvent {
  /** Usage as decimal (0-1) */
  percentage: number;
  /** Bytes used */
  used: number;
  /** Maximum bytes */
  max: number;
}

// ============================================================================
// Eager Cache Configuration
// ============================================================================

/**
 * Precache configuration - URLs to cache during SW install
 */
export interface PrecacheConfig {
  /**
   * Static URLs to cache during installation
   * These are fetched immediately on SW install
   */
  urls?: string[];

  /**
   * URL patterns for matching during link prediction
   * Note: These cannot be "fetched" directly - they are used to
   * match URLs discovered from link prediction against caching rules
   */
  patterns?: string[];

  /**
   * Retry failed precache fetches (default: 2)
   */
  retries?: number;

  /**
   * Fail silently if precache fails (default: true)
   * If false, SW installation will fail on precache error
   */
  failSilently?: boolean;
}

/**
 * Link prediction (prefetch on hover/touch) configuration
 */
export interface LinkPredictionConfig {
  /** Enable/disable link prediction (default: false) */
  enabled: boolean;

  /**
   * Scope of links to prefetch:
   * - 'rules-only': Only prefetch URLs that match existing cache rules
   * - 'same-origin': Prefetch any same-origin link
   */
  scope: 'rules-only' | 'same-origin';

  /**
   * Debounce delay in ms before initiating prefetch (default: 150)
   * Prevents prefetching on quick mouse movements
   */
  delay?: number;

  /**
   * Events that trigger prefetch (default: ['mouseenter', 'touchstart'])
   */
  triggers?: ('mouseenter' | 'touchstart' | 'focus')[];

  /**
   * CSS selector to limit which links are observed (default: 'a[href]')
   */
  selector?: string;

  /**
   * Maximum concurrent prefetch requests (default: 2)
   */
  maxConcurrent?: number;

  /**
   * Respect user's data-saver preference (default: true)
   */
  respectDataSaver?: boolean;

  /**
   * Custom priority for prefetch requests (default: 'low')
   */
  priority?: 'low' | 'auto';

  /**
   * Exclude patterns - URLs matching these won't be prefetched
   */
  exclude?: string[];
}

/**
 * Eager caching configuration
 */
export interface EagerCacheConfig {
  /** Precache configuration - URLs to cache during SW install */
  precache?: PrecacheConfig;

  /** Link prediction (prefetch on hover/touch) configuration */
  linkPrediction?: LinkPredictionConfig;
}

// ============================================================================
// Fallback Configuration
// ============================================================================

export interface FallbackConfig {
  /**
   * Fallback strategy:
   * - 'stale-if-error': Return stale cache only on network error (default)
   * - 'stale-while-revalidate': Return cache immediately, refresh in background
   * - 'network-only': Never use stale cache
   */
  strategy?: 'stale-if-error' | 'stale-while-revalidate' | 'network-only';
  /** Maximum age of stale cache to serve, in minutes (default: 1440 = 24h) */
  maxStaleAge?: number;
}

// ============================================================================
// Rule Configuration
// ============================================================================

export interface ZephyrRule {
  /** Regex pattern to match request URLs */
  test: string;
  /** HTTP method to match (optional, matches all if not specified) */
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  /** Cache TTL in minutes */
  cache: number | string;
  /** Maximum entries for this pattern (default: 100) */
  maxEntries?: number;
  /** Request timeout in ms (default: 10000) */
  timeout?: number;
  /** Fallback strategy configuration */
  fallback?: FallbackConfig;
}

// ============================================================================
// Main Configuration
// ============================================================================

export interface ZephyrConfig {
  /** Caching rules */
  rules: ZephyrRule[];
  /** Invalidation configuration */
  invalidation?: InvalidationConfig;
  /** Quota monitoring configuration */
  quota?: QuotaConfig;
  /** Eager caching (precache + link prediction) configuration */
  eagerCache?: EagerCacheConfig;
}

// ============================================================================
// Statistics
// ============================================================================

export interface ZephyrStats {
  hits: number;
  misses: number;
  errors: number;
  evictions: number;
  revalidations: number;
  entries: number;
  storageUsed: number;
  storageUsedMB: string;
  hitRate: string;
  /** Prefetch statistics (if eager caching enabled) */
  prefetches?: number;
}

/**
 * Result of a prefetch operation
 */
export interface PrefetchResult {
  status: 'prefetched' | 'already-cached' | 'quota-exceeded' | 'fetch-failed' | 'not-cacheable' | 'error';
  url: string;
  httpStatus?: number;
  error?: string;
}

// ============================================================================
// Client API
// ============================================================================

export interface ZephyrClient {
  /** Clear all cached entries */
  clear(): Promise<boolean>;
  /** Clear entries matching a URL pattern */
  clearPattern(pattern: string): Promise<number>;
  /** Alias for clearPattern */
  invalidate(pattern: string): Promise<number>;
  /** Invalidate a specific URL */
  invalidateUrl(url: string): Promise<boolean>;
  /** Get cache statistics */
  stats(): Promise<ZephyrStats>;
  /** Get quota usage */
  quota(): Promise<QuotaUsage>;
  /** Toggle debug mode */
  debug(): Promise<{ debugMode: boolean }>;
  /** Check if service worker is ready */
  ready(): Promise<boolean>;
  /** Listen for quota warning events */
  onQuotaWarning(callback: (event: QuotaWarningEvent) => void): void;
  /** Manually prefetch a URL */
  prefetch(url: string): Promise<PrefetchResult>;
}

// ============================================================================
// Functions
// ============================================================================

/**
 * Initialize Zephyr service worker
 */
export function initZephyr(config: ZephyrConfig): void;

// ============================================================================
// Global Declarations
// ============================================================================

declare global {
  interface Window {
    zephyr: ZephyrClient;
  }

  interface ServiceWorkerGlobalScope {
    initZephyr: typeof initZephyr;
    zephyr: {
      clear(): Promise<boolean>;
      clearPattern(pattern: string): Promise<number>;
      invalidate(pattern: string): Promise<number>;
      invalidateUrl(url: string): Promise<boolean>;
      stats(): Promise<ZephyrStats>;
      quota(): Promise<QuotaUsage>;
      debug(): boolean;
    };
  }
}
