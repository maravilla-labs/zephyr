/**
 * Zephyr Configuration Example
 *
 * Copy this file to your project root and customize the rules.
 *
 * @license Apache-2.0
 * @copyright 2019-2025 SOLUTAS GmbH
 * @see https://github.com/maravilla-labs/zephyr
 */

// Import the worker script (use CDN or local path)
// For production, use: importScripts('https://unpkg.com/@maravilla-labs/zephyr@latest/lib/zephyrWorker.js');
importScripts('./lib/zephyrWorker.js');

// Define your caching configuration
const config = {
  // ============================================================================
  // Caching Rules
  // ============================================================================
  rules: [
    // Test API rules (for E2E tests - requests flow through service worker)
    {
      test: '.*\\/test-api\\/.*\\.(jpg|jpeg|png|gif|webp|svg|css)$',
      method: 'GET',
      cache: 60,
      maxEntries: 100
    },
    {
      test: '.*\\/test-api\\/api\\/getProducts$',
      method: 'POST',
      cache: 60,
      maxEntries: 50
    },

    // Cache API responses for 24 hours with stale-while-revalidate
    {
      test: '.*\\/api\\/getProducts$',
      method: 'POST',
      cache: 1440,        // TTL in minutes (1440 = 24 hours)
      maxEntries: 50,     // Max cached entries for this pattern (LRU eviction)
      fallback: {
        strategy: 'stale-while-revalidate',
        maxStaleAge: 2880  // Serve stale up to 48h on error
      }
    },

    // Cache static assets for 1 hour
    {
      test: '.*\\.(png|jpg|jpeg|gif|webp|svg)$',
      method: 'GET',
      cache: 60,
      maxEntries: 100,
      fallback: {
        strategy: 'stale-if-error',
        maxStaleAge: 1440  // Serve stale up to 24h on network error
      }
    },

    // Cache JS/CSS for 30 minutes
    {
      test: '.*\\.(js|css)$',
      method: 'GET',
      cache: 30,
      maxEntries: 50
    },

    // Critical API - always fetch fresh, no stale fallback
    {
      test: '.*\\/api\\/checkout',
      method: 'POST',
      cache: 5,
      fallback: {
        strategy: 'network-only'
      }
    }
  ],

  // ============================================================================
  // Invalidation Configuration (Enterprise CMS Integration)
  // ============================================================================

  // Option A: Manifest-based polling (recommended for Magnolia/AEM)
  // invalidation: {
  //   type: 'manifest',
  //   url: '/api/cache-manifest.json',  // Your CMS publishes to this endpoint
  //   interval: 60000,                   // Poll every 60 seconds
  //   // Custom parser for your CMS format (optional)
  //   parser: async (response) => {
  //     const data = await response.json();
  //     return {
  //       version: data.globalVersion,
  //       patterns: data.invalidatedPatterns
  //     };
  //   }
  // },

  // Option B: Custom header-based invalidation
  // invalidation: {
  //   type: 'header',
  //   header: 'X-Cache-Version',  // CMS adds this header to responses
  //   compare: (cached, current) => cached !== current
  // },

  // Option C: HTTP standard headers (default - no config needed)
  // Respects Cache-Control, Expires, ETag, Last-Modified automatically
  invalidation: {
    type: 'http',
    respectHttpHeaders: true  // Default: true
  },

  // ============================================================================
  // Quota Monitoring
  // ============================================================================
  quota: {
    maxSize: 50 * 1024 * 1024,  // 50MB total cache limit
    warningThreshold: 0.8,      // Warn at 80% usage
    onQuotaExceeded: 'evict-lru'  // 'evict-lru' | 'stop-caching' | 'clear-all'
  },

  // ============================================================================
  // Eager Caching (Precache & Link Prediction)
  // ============================================================================

  // Precache critical assets on install + prefetch links on hover/touch
  eagerCache: {
    // URLs to cache immediately on service worker install
    precache: {
      urls: [
        '/css/main.css',
        '/js/app.js',
        '/images/logo.png',
        '/api/config'
      ],
      // Patterns for link prediction matching (regex)
      patterns: [
        '.*\\/products\\/.*',
        '.*\\/blog\\/.*'
      ],
      retries: 2,           // Retry failed fetches (default: 2)
      failSilently: true    // Don't fail SW install on precache error (default: true)
    },

    // Prefetch links on hover/touch (link prediction)
    linkPrediction: {
      enabled: true,
      scope: 'rules-only',  // 'rules-only' | 'same-origin'
      delay: 150,           // Debounce delay in ms (default: 150)
      triggers: ['mouseenter', 'touchstart'],  // Events that trigger prefetch
      maxConcurrent: 2,     // Max parallel prefetch requests (default: 2)
      respectDataSaver: true,  // Disable on slow connections (default: true)
      exclude: [            // URL patterns to never prefetch
        '.*\\/logout',
        '.*\\/checkout',
        '.*#.*'             // Skip hash links
      ]
    }
  }
};

// Initialize Zephyr
if (typeof initZephyr === 'function') {
  initZephyr(config);
} else {
  console.error('[Zephyr] Worker script not loaded. Check importScripts URL.');
}
