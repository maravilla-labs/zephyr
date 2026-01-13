/**
 * Zephyr - Lightweight Service Worker Caching Library
 *
 * @version 0.2.0
 * @license Apache-2.0
 * @copyright 2019-2025 SOLUTAS GmbH
 * @see https://github.com/maravilla-labs/zephyr
 */

// ============================================================================
// Configuration & Constants
// ============================================================================

const DB_NAME = 'zephyr-cache-db';
const DB_VERSION = 3; // Bumped for new schema
const STORE_NAME = 'responses';
const DEFAULT_TIMEOUT = 10000;
const DEFAULT_MAX_ENTRIES = 100;
const DEFAULT_MAX_STALE_AGE = 1440; // 24 hours in minutes
const DEFAULT_QUOTA_MAX_SIZE = 50 * 1024 * 1024; // 50MB
const DEFAULT_QUOTA_WARNING_THRESHOLD = 0.8;

// Global state
let debugMode = false;
let globalConfig = null;
let manifestPollInterval = null;
let lastManifestVersion = null;
let currentStorageSize = 0;

// Stats tracking
const stats = {
  hits: 0,
  misses: 0,
  errors: 0,
  evictions: 0,
  revalidations: 0,
  prefetches: 0
};

// ============================================================================
// Utility Functions
// ============================================================================

function debugLog(message, ...args) {
  if (debugMode) {
    console.log(`[Zephyr] ${message}`, ...args);
  }
}

function logCacheHit(url) {
  if (debugMode) {
    console.log('%c[Zephyr] Cache HIT:%c %s',
      'background: #4CAF50; color: white; padding: 2px 6px; border-radius: 3px;',
      'color: #4CAF50;', url);
  }
}

function logCacheMiss(url) {
  if (debugMode) {
    console.log('%c[Zephyr] Cache MISS:%c %s',
      'background: #FF9800; color: white; padding: 2px 6px; border-radius: 3px;',
      'color: #FF9800;', url);
  }
}

function logRevalidation(url) {
  if (debugMode) {
    console.log('%c[Zephyr] Revalidating:%c %s',
      'background: #2196F3; color: white; padding: 2px 6px; border-radius: 3px;',
      'color: #2196F3;', url);
  }
}

async function hashPayload(payload) {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(payload);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (error) {
    let hash = 0;
    for (let i = 0; i < payload.length; i++) {
      const char = payload.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }
}

async function generateCacheKey(request) {
  let key = request.url;
  if (request.method === 'POST') {
    try {
      const payload = await request.clone().text();
      const payloadHash = await hashPayload(payload);
      key += `-${payloadHash}`;
    } catch (error) {
      debugLog('Failed to hash POST payload:', error.message);
    }
  }
  return key;
}

function guessContentType(url) {
  const extension = url.split('.').pop().split(/[#?]/)[0].toLowerCase();
  const mimeTypes = {
    'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png',
    'gif': 'image/gif', 'webp': 'image/webp', 'svg': 'image/svg+xml',
    'ico': 'image/x-icon', 'css': 'text/css', 'html': 'text/html',
    'js': 'application/javascript', 'mjs': 'application/javascript',
    'json': 'application/json', 'xml': 'application/xml', 'txt': 'text/plain',
    'woff': 'font/woff', 'woff2': 'font/woff2', 'ttf': 'font/ttf',
    'mp4': 'video/mp4', 'webm': 'video/webm', 'pdf': 'application/pdf',
  };
  return mimeTypes[extension] || 'application/octet-stream';
}

function fetchWithTimeout(request, timeout = DEFAULT_TIMEOUT) {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
      reject(new Error(`Request timeout after ${timeout}ms`));
    }, timeout);

    fetch(request, { signal: controller.signal })
      .then(response => { clearTimeout(timeoutId); resolve(response); })
      .catch(error => { clearTimeout(timeoutId); reject(error); });
  });
}

// ============================================================================
// HTTP Header Parsing
// ============================================================================

/**
 * Parse Cache-Control header into directives
 */
function parseCacheControl(header) {
  if (!header) return {};
  const directives = {};
  header.split(',').forEach(part => {
    const [key, value] = part.trim().split('=');
    directives[key.toLowerCase()] = value ? parseInt(value, 10) : true;
  });
  return directives;
}

/**
 * Parse Expires header to timestamp
 */
function parseExpires(header) {
  if (!header) return null;
  const date = new Date(header);
  return isNaN(date.getTime()) ? null : date.getTime();
}

/**
 * Extract cache metadata from response headers
 */
function extractCacheMetadata(response) {
  const cacheControl = parseCacheControl(response.headers.get('Cache-Control'));
  const expires = parseExpires(response.headers.get('Expires'));

  return {
    etag: response.headers.get('ETag'),
    lastModified: response.headers.get('Last-Modified'),
    maxAge: cacheControl['max-age'],
    mustRevalidate: cacheControl['must-revalidate'] || cacheControl['no-cache'] === true,
    noStore: cacheControl['no-store'] === true,
    expires: expires,
    sMaxAge: cacheControl['s-maxage']
  };
}

/**
 * Calculate TTL from response headers or rule config
 */
function calculateTTL(metadata, ruleTTL, respectHeaders = true) {
  if (!respectHeaders) {
    return ruleTTL;
  }

  // Priority: s-maxage > max-age > Expires > rule TTL
  if (metadata.sMaxAge !== undefined) {
    return metadata.sMaxAge / 60; // Convert seconds to minutes
  }
  if (metadata.maxAge !== undefined) {
    return metadata.maxAge / 60;
  }
  if (metadata.expires) {
    const ttlMs = metadata.expires - Date.now();
    return Math.max(0, ttlMs / 60000);
  }
  return ruleTTL;
}

// ============================================================================
// Response Validation
// ============================================================================

function shouldCacheResponse(response, metadata) {
  if (!response.ok) {
    debugLog('Not caching: response not ok (status:', response.status, ')');
    return false;
  }

  if (metadata.noStore) {
    debugLog('Not caching: Cache-Control: no-store');
    return false;
  }

  if (response.headers.get('Set-Cookie')) {
    debugLog('Not caching: response contains Set-Cookie header');
    return false;
  }

  return true;
}

// ============================================================================
// IndexedDB Operations
// ============================================================================

async function openIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(new Error(`IndexedDB error: ${request.error?.message || 'Unknown error'}`));
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Delete old store if exists (schema change)
      if (db.objectStoreNames.contains(STORE_NAME)) {
        db.deleteObjectStore(STORE_NAME);
      }

      const store = db.createObjectStore(STORE_NAME, { keyPath: 'url' });
      store.createIndex('validUntil', 'validUntil', { unique: false });
      store.createIndex('pattern', 'pattern', { unique: false });
      store.createIndex('lastAccess', 'lastAccess', { unique: false });
      store.createIndex('cachedAt', 'cachedAt', { unique: false });
    };

    request.onsuccess = () => resolve(request.result);
  });
}

async function storeResponseInIndexedDB(request, response, ttl, pattern, metadata = {}) {
  try {
    const db = await openIndexedDB();
    const body = await response.clone().arrayBuffer();
    const key = await generateCacheKey(request);
    const bodySize = body.byteLength;

    // Check quota before storing
    if (globalConfig?.quota) {
      const quotaCheck = await checkQuota(bodySize);
      if (!quotaCheck.canStore) {
        debugLog('Quota exceeded, applying strategy:', globalConfig.quota.onQuotaExceeded);
        return;
      }
    }

    const headers = {};
    response.headers.forEach((value, headerKey) => {
      if (headerKey.toLowerCase() !== 'set-cookie') {
        headers[headerKey] = value;
      }
    });

    if (!headers['content-type']) {
      headers['content-type'] = guessContentType(request.url);
    }

    const now = Date.now();
    const record = {
      url: key,
      body: body,
      headers: headers,
      status: response.status,
      statusText: response.statusText,
      validUntil: now + ttl * 60000,
      lastAccess: now,
      cachedAt: now,
      pattern: pattern,
      size: bodySize,
      // HTTP cache metadata
      etag: metadata.etag,
      lastModified: metadata.lastModified,
      mustRevalidate: metadata.mustRevalidate,
      cacheVersion: metadata.cacheVersion
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(record);

      tx.oncomplete = () => {
        currentStorageSize += bodySize;
        debugLog('Stored in cache:', key, `(${(bodySize/1024).toFixed(1)}KB)`);
        resolve();
      };

      tx.onerror = () => {
        stats.errors++;
        reject(new Error(`Failed to store: ${tx.error?.message}`));
      };
    });
  } catch (error) {
    debugLog('Store error:', error.message);
    stats.errors++;
  }
}

async function getResponseFromIndexedDB(request, options = {}) {
  try {
    const db = await openIndexedDB();
    const key = await generateCacheKey(request);

    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const getRequest = store.get(key);

      getRequest.onerror = () => {
        stats.errors++;
        resolve({ response: null, record: null });
      };

      getRequest.onsuccess = () => {
        const record = getRequest.result;

        if (!record || !record.body || !record.headers) {
          resolve({ response: null, record: null });
          return;
        }

        const now = Date.now();
        const isExpired = now > record.validUntil;
        const isStale = isExpired;

        // Check max stale age for fallback
        const maxStaleAge = options.maxStaleAge || DEFAULT_MAX_STALE_AGE;
        const staleAge = (now - record.validUntil) / 60000; // in minutes
        const isTooStale = staleAge > maxStaleAge;

        // Update last access time
        record.lastAccess = now;
        store.put(record);

        const contentType = record.headers['content-type'] || 'application/octet-stream';
        const blob = new Blob([record.body], { type: contentType });
        const response = new Response(blob, {
          status: record.status || 200,
          statusText: record.statusText || 'OK',
          headers: record.headers
        });

        resolve({
          response,
          record,
          isExpired,
          isStale,
          isTooStale,
          needsRevalidation: record.mustRevalidate || isExpired
        });
      };
    });
  } catch (error) {
    debugLog('Cache retrieval error:', error.message);
    stats.errors++;
    return { response: null, record: null };
  }
}

async function deleteCacheEntry(key) {
  try {
    const db = await openIndexedDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      // Get size before delete for quota tracking
      const getReq = store.get(key);
      getReq.onsuccess = () => {
        if (getReq.result?.size) {
          currentStorageSize -= getReq.result.size;
        }
        store.delete(key);
      };

      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (error) {
    return false;
  }
}

async function clearAllCache() {
  try {
    const db = await openIndexedDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.clear();
      tx.oncomplete = () => {
        currentStorageSize = 0;
        debugLog('Cache cleared');
        resolve(true);
      };
      tx.onerror = () => resolve(false);
    });
  } catch (error) {
    return false;
  }
}

async function clearCacheByPattern(pattern) {
  try {
    const db = await openIndexedDB();
    const regex = new RegExp(pattern);
    let deleted = 0;
    let freedBytes = 0;

    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.openCursor();

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          if (regex.test(cursor.value.url)) {
            freedBytes += cursor.value.size || 0;
            cursor.delete();
            deleted++;
          }
          cursor.continue();
        }
      };

      tx.oncomplete = () => {
        currentStorageSize -= freedBytes;
        debugLog(`Cleared ${deleted} entries matching: ${pattern}`);
        resolve(deleted);
      };
      tx.onerror = () => resolve(0);
    });
  } catch (error) {
    return 0;
  }
}

async function clearCacheByUrl(url) {
  return deleteCacheEntry(url);
}

async function getCacheStats() {
  try {
    const db = await openIndexedDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const countRequest = store.count();

      countRequest.onsuccess = () => {
        const result = {
          ...stats,
          entries: countRequest.result,
          storageUsed: currentStorageSize,
          storageUsedMB: (currentStorageSize / (1024 * 1024)).toFixed(2),
          hitRate: stats.hits + stats.misses > 0
            ? (stats.hits / (stats.hits + stats.misses) * 100).toFixed(1) + '%'
            : 'N/A'
        };
        // Only include prefetches if eager caching is configured
        if (globalConfig?.eagerCache) {
          result.prefetches = stats.prefetches;
        }
        resolve(result);
      };

      countRequest.onerror = () => {
        resolve({ ...stats, entries: 0, hitRate: 'N/A' });
      };
    });
  } catch (error) {
    return { ...stats, entries: 0, hitRate: 'N/A', error: error.message };
  }
}

async function enforceCacheLimits(pattern, maxEntries = DEFAULT_MAX_ENTRIES) {
  try {
    const db = await openIndexedDB();

    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('pattern');
      const request = index.getAll(pattern);

      request.onsuccess = () => {
        const entries = request.result;
        if (entries.length <= maxEntries) {
          resolve(0);
          return;
        }

        entries.sort((a, b) => a.lastAccess - b.lastAccess);
        const toDelete = entries.slice(0, entries.length - maxEntries);

        toDelete.forEach(entry => {
          store.delete(entry.url);
          currentStorageSize -= entry.size || 0;
          stats.evictions++;
        });

        debugLog(`Evicted ${toDelete.length} entries for pattern: ${pattern}`);
        resolve(toDelete.length);
      };

      request.onerror = () => resolve(0);
    });
  } catch (error) {
    return 0;
  }
}

// ============================================================================
// Quota Monitoring
// ============================================================================

async function checkQuota(additionalBytes = 0) {
  if (!globalConfig?.quota) {
    return { canStore: true, usage: 0, percentage: 0 };
  }

  const maxSize = globalConfig.quota.maxSize || DEFAULT_QUOTA_MAX_SIZE;
  const warningThreshold = globalConfig.quota.warningThreshold || DEFAULT_QUOTA_WARNING_THRESHOLD;
  const projectedSize = currentStorageSize + additionalBytes;
  const percentage = projectedSize / maxSize;

  // Warning threshold
  if (percentage >= warningThreshold && percentage < 1) {
    debugLog(`Quota warning: ${(percentage * 100).toFixed(1)}% used`);
    notifyQuotaWarning(percentage);
  }

  // Exceeded
  if (percentage >= 1) {
    const strategy = globalConfig.quota.onQuotaExceeded || 'evict-lru';

    switch (strategy) {
      case 'evict-lru':
        await evictLRUEntries(additionalBytes);
        return { canStore: true, usage: currentStorageSize, percentage };
      case 'stop-caching':
        return { canStore: false, usage: currentStorageSize, percentage };
      case 'clear-all':
        await clearAllCache();
        return { canStore: true, usage: 0, percentage: 0 };
      default:
        return { canStore: false, usage: currentStorageSize, percentage };
    }
  }

  return { canStore: true, usage: currentStorageSize, percentage };
}

async function evictLRUEntries(bytesNeeded) {
  try {
    const db = await openIndexedDB();

    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('lastAccess');
      const request = index.openCursor();

      let freedBytes = 0;

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor && freedBytes < bytesNeeded) {
          freedBytes += cursor.value.size || 0;
          cursor.delete();
          stats.evictions++;
          cursor.continue();
        }
      };

      tx.oncomplete = () => {
        currentStorageSize -= freedBytes;
        debugLog(`Evicted entries to free ${(freedBytes/1024).toFixed(1)}KB`);
        resolve(freedBytes);
      };
    });
  } catch (error) {
    return 0;
  }
}

function notifyQuotaWarning(percentage) {
  // Notify via postMessage to all clients
  if (typeof clients !== 'undefined') {
    clients.matchAll().then(clientList => {
      clientList.forEach(client => {
        client.postMessage({
          type: 'zephyr-quota-warning',
          percentage: percentage,
          used: currentStorageSize,
          max: globalConfig?.quota?.maxSize || DEFAULT_QUOTA_MAX_SIZE
        });
      });
    });
  }
}

async function getQuotaUsage() {
  const maxSize = globalConfig?.quota?.maxSize || DEFAULT_QUOTA_MAX_SIZE;
  return {
    used: currentStorageSize,
    max: maxSize,
    percentage: (currentStorageSize / maxSize * 100).toFixed(1) + '%',
    available: maxSize - currentStorageSize
  };
}

// ============================================================================
// Manifest-based Invalidation
// ============================================================================

async function startManifestPolling(config) {
  if (!config?.invalidation?.type === 'manifest' || !config.invalidation.url) {
    return;
  }

  const interval = config.invalidation.interval || 60000;
  const url = config.invalidation.url;
  const parser = config.invalidation.parser || (r => r.json());

  debugLog('Starting manifest polling:', url, 'interval:', interval);

  const pollManifest = async () => {
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) {
        debugLog('Manifest fetch failed:', response.status);
        return;
      }

      const manifest = await parser(response);

      // Check global version change
      if (manifest.version && manifest.version !== lastManifestVersion) {
        debugLog('Manifest version changed:', lastManifestVersion, '->', manifest.version);
        lastManifestVersion = manifest.version;

        // Invalidate based on pattern timestamps
        if (manifest.patterns) {
          await invalidateByManifest(manifest.patterns);
        }
      }
    } catch (error) {
      debugLog('Manifest poll error:', error.message);
    }
  };

  // Initial poll
  await pollManifest();

  // Set up interval
  manifestPollInterval = setInterval(pollManifest, interval);
}

async function invalidateByManifest(patterns) {
  try {
    const db = await openIndexedDB();

    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.openCursor();
      let invalidated = 0;

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          const record = cursor.value;

          // Check each pattern
          for (const [pattern, timestamp] of Object.entries(patterns)) {
            try {
              const regex = new RegExp(pattern);
              if (regex.test(record.url)) {
                const patternTime = new Date(timestamp).getTime();
                if (record.cachedAt < patternTime) {
                  cursor.delete();
                  currentStorageSize -= record.size || 0;
                  invalidated++;
                  debugLog('Invalidated by manifest:', record.url);
                }
              }
            } catch (e) {
              // Invalid regex, skip
            }
          }
          cursor.continue();
        }
      };

      tx.oncomplete = () => {
        if (invalidated > 0) {
          debugLog(`Manifest invalidation: ${invalidated} entries removed`);
        }
        resolve(invalidated);
      };
    });
  } catch (error) {
    debugLog('Manifest invalidation error:', error.message);
    return 0;
  }
}

function stopManifestPolling() {
  if (manifestPollInterval) {
    clearInterval(manifestPollInterval);
    manifestPollInterval = null;
    debugLog('Stopped manifest polling');
  }
}

// ============================================================================
// Conditional Requests (ETag/Last-Modified)
// ============================================================================

async function revalidateWithServer(request, record, timeout) {
  const headers = new Headers(request.headers);

  if (record.etag) {
    headers.set('If-None-Match', record.etag);
  }
  if (record.lastModified) {
    headers.set('If-Modified-Since', record.lastModified);
  }

  const conditionalRequest = new Request(request.url, {
    method: request.method,
    headers: headers,
    mode: request.mode,
    credentials: request.credentials,
    cache: 'no-store'
  });

  try {
    logRevalidation(request.url);
    stats.revalidations++;

    const response = await fetchWithTimeout(conditionalRequest, timeout);

    if (response.status === 304) {
      debugLog('304 Not Modified, using cached response');
      return { notModified: true, response: null };
    }

    return { notModified: false, response };
  } catch (error) {
    debugLog('Revalidation failed:', error.message);
    return { notModified: false, response: null, error };
  }
}

// ============================================================================
// Fallback Strategies
// ============================================================================

function getFallbackStrategy(rule) {
  if (!rule.fallback) {
    return { strategy: 'stale-if-error', maxStaleAge: DEFAULT_MAX_STALE_AGE };
  }
  return {
    strategy: rule.fallback.strategy || 'stale-if-error',
    maxStaleAge: rule.fallback.maxStaleAge || DEFAULT_MAX_STALE_AGE
  };
}

// ============================================================================
// Debug & Logging
// ============================================================================

async function logAllCacheRecords() {
  if (!debugMode) return;

  try {
    const db = await openIndexedDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const records = request.result;
      if (records.length === 0) {
        console.log('[Zephyr] Cache is empty');
        return;
      }

      const tableData = records.map(r => ({
        url: r.url.substring(0, 50) + (r.url.length > 50 ? '...' : ''),
        size: r.size ? `${(r.size / 1024).toFixed(1)}KB` : 'N/A',
        validUntil: new Date(r.validUntil).toISOString(),
        etag: r.etag ? 'Yes' : 'No',
        mustRevalidate: r.mustRevalidate ? 'Yes' : 'No'
      }));

      console.log('[Zephyr] Cache contents:');
      console.table(tableData);
    };
  } catch (error) {
    console.log('[Zephyr] Error reading cache:', error.message);
  }
}

// ============================================================================
// Eager Caching (Precache & Prefetch)
// ============================================================================

/**
 * Find a matching rule for a URL and method
 */
function findMatchingRule(url, method = 'GET') {
  if (!globalConfig?.rules) return null;
  return globalConfig.rules.find(rule => {
    try {
      const regex = new RegExp(rule.test);
      return regex.test(url) && (!rule.method || rule.method === method);
    } catch {
      return false;
    }
  });
}

/**
 * Check if URL matches any precache pattern
 */
function matchesPrecachePattern(url) {
  const patterns = globalConfig?.eagerCache?.precache?.patterns || [];
  return patterns.some(pattern => {
    try {
      const regex = new RegExp(pattern);
      return regex.test(url);
    } catch {
      return false;
    }
  });
}

/**
 * Execute precache during SW install
 */
async function executePrecache(precacheConfig) {
  const { urls = [], retries = 2, failSilently = true } = precacheConfig;

  if (urls.length === 0) {
    debugLog('No URLs to precache');
    return;
  }

  // Deduplicate URLs
  const urlsToCache = [...new Set(urls)];

  debugLog(`Precaching ${urlsToCache.length} URLs`);

  const results = await Promise.allSettled(
    urlsToCache.map(url => precacheUrl(url, retries))
  );

  const succeeded = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected').length;

  debugLog(`Precache complete: ${succeeded} succeeded, ${failed} failed`);

  // Notify clients of precache status
  notifyPrecacheComplete(succeeded, failed, urlsToCache.length);

  if (failed > 0 && !failSilently) {
    throw new Error(`Precache failed: ${failed} of ${urlsToCache.length} URLs failed`);
  }
}

/**
 * Precache a single URL with retries
 */
async function precacheUrl(url, retriesLeft) {
  try {
    // Normalize URL
    const absoluteUrl = new URL(url, self.location.origin).href;

    // Find matching rule for TTL
    const matchingRule = findMatchingRule(absoluteUrl, 'GET');
    const ttl = matchingRule ? parseInt(matchingRule.cache, 10) : 60;

    // Check if already cached
    const cached = await getResponseFromIndexedDB({ url: absoluteUrl, method: 'GET' });
    if (cached.response && !cached.isExpired) {
      debugLog('Precache skip (already cached):', absoluteUrl);
      return { status: 'already-cached', url: absoluteUrl };
    }

    // Fetch the resource
    const response = await fetch(absoluteUrl, {
      method: 'GET',
      credentials: 'same-origin'
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const metadata = extractCacheMetadata(response);

    if (shouldCacheResponse(response, metadata)) {
      const pattern = matchingRule?.test || 'precache';
      await storeResponseInIndexedDB(
        { url: absoluteUrl, method: 'GET' },
        response,
        ttl,
        pattern,
        metadata
      );
      stats.prefetches++;
      debugLog('Precached:', absoluteUrl);
      return { status: 'precached', url: absoluteUrl };
    }

    return { status: 'not-cacheable', url: absoluteUrl };
  } catch (error) {
    if (retriesLeft > 0) {
      debugLog(`Precache retry (${retriesLeft} left):`, url);
      await new Promise(resolve => setTimeout(resolve, 1000));
      return precacheUrl(url, retriesLeft - 1);
    }
    throw error;
  }
}

/**
 * Handle prefetch request from client (link prediction)
 */
async function handlePrefetch(url) {
  try {
    // Normalize URL
    const absoluteUrl = new URL(url, self.location.origin).href;

    // Check if already cached
    const cached = await getResponseFromIndexedDB({ url: absoluteUrl, method: 'GET' });
    if (cached.response && !cached.isExpired) {
      return { status: 'already-cached', url: absoluteUrl };
    }

    // Find matching rule
    const matchingRule = findMatchingRule(absoluteUrl, 'GET');

    // Check quota before fetching
    const quotaCheck = await checkQuota(0);
    if (!quotaCheck.canStore) {
      return { status: 'quota-exceeded', url: absoluteUrl };
    }

    // Fetch with low priority
    const response = await fetch(absoluteUrl, {
      method: 'GET',
      credentials: 'same-origin'
    });

    if (!response.ok) {
      return { status: 'fetch-failed', url: absoluteUrl, httpStatus: response.status };
    }

    const metadata = extractCacheMetadata(response);

    if (!shouldCacheResponse(response, metadata)) {
      return { status: 'not-cacheable', url: absoluteUrl };
    }

    // Calculate TTL
    const ruleTTL = matchingRule ? parseInt(matchingRule.cache, 10) : 60;
    const respectHeaders = globalConfig?.invalidation?.respectHttpHeaders !== false;
    const ttl = calculateTTL(metadata, ruleTTL, respectHeaders);

    const pattern = matchingRule?.test || 'prefetch';

    await storeResponseInIndexedDB(
      { url: absoluteUrl, method: 'GET' },
      response,
      ttl,
      pattern,
      metadata
    );

    // Enforce limits if rule exists
    if (matchingRule?.maxEntries) {
      await enforceCacheLimits(matchingRule.test, matchingRule.maxEntries);
    }

    stats.prefetches++;
    debugLog('Prefetched:', absoluteUrl);
    return { status: 'prefetched', url: absoluteUrl };

  } catch (error) {
    debugLog('Prefetch error:', error.message);
    return { status: 'error', url, error: error.message };
  }
}

/**
 * Notify clients of precache completion
 */
function notifyPrecacheComplete(succeeded, failed, total) {
  if (typeof clients !== 'undefined') {
    clients.matchAll().then(clientList => {
      clientList.forEach(client => {
        client.postMessage({
          type: 'zephyr-precache-complete',
          succeeded,
          failed,
          total
        });
      });
    });
  }
}

// ============================================================================
// Main Initialization
// ============================================================================

function initZephyr(config) {
  if (!config || !Array.isArray(config.rules)) {
    console.error('[Zephyr] Invalid configuration: missing rules array');
    return;
  }

  globalConfig = config;

  // Set defaults for invalidation
  const invalidation = config.invalidation || {};
  const respectHttpHeaders = invalidation.respectHttpHeaders !== false;

  // Validate rules
  config.rules.forEach((rule, index) => {
    if (!rule.test) {
      console.error(`[Zephyr] Rule ${index}: missing 'test' pattern`);
    }
    try {
      new RegExp(rule.test);
    } catch (e) {
      console.error(`[Zephyr] Rule ${index}: invalid regex pattern`);
    }
  });

  // Service Worker lifecycle
  self.addEventListener('install', (event) => {
    debugLog('Installing...');

    // Execute precache if configured
    if (config.eagerCache?.precache?.urls?.length > 0) {
      event.waitUntil(
        executePrecache(config.eagerCache.precache)
          .then(() => self.skipWaiting())
          .catch(error => {
            debugLog('Precache error:', error.message);
            // skipWaiting even on error if failSilently is true (default)
            return self.skipWaiting();
          })
      );
    } else {
      self.skipWaiting();
    }
  });

  self.addEventListener('activate', (event) => {
    debugLog('Activated');
    event.waitUntil(
      Promise.all([
        clients.claim(),
        // Start manifest polling if configured
        config.invalidation?.type === 'manifest'
          ? startManifestPolling(config)
          : Promise.resolve()
      ])
    );
  });

  // Message handler
  self.addEventListener('message', async (event) => {
    const { action, pattern, url } = event.data || {};
    let result;

    switch (action) {
      case 'clear':
        result = await clearAllCache();
        break;
      case 'clearPattern':
      case 'invalidate':
        result = await clearCacheByPattern(pattern);
        break;
      case 'invalidateUrl':
        result = await clearCacheByUrl(url);
        break;
      case 'stats':
        result = await getCacheStats();
        break;
      case 'quota':
        result = await getQuotaUsage();
        break;
      case 'debug':
        debugMode = !debugMode;
        result = { debugMode };
        break;
      case 'prefetch':
        result = await handlePrefetch(url);
        break;
      default:
        result = { error: 'Unknown action' };
    }

    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage(result);
    }
  });

  // Fetch handler
  self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);

    if (url.searchParams.get('zephyrDebug') === 'true') {
      debugMode = true;
      logAllCacheRecords();
    }

    const matchingRule = config.rules.find(rule => {
      try {
        const regex = new RegExp(rule.test);
        return regex.test(request.url) && (!rule.method || rule.method === request.method);
      } catch (e) {
        return false;
      }
    });

    if (!matchingRule) return;

    const ruleTTL = parseInt(matchingRule.cache, 10) || 60;
    const maxEntries = matchingRule.maxEntries || DEFAULT_MAX_ENTRIES;
    const timeout = matchingRule.timeout || DEFAULT_TIMEOUT;
    const fallback = getFallbackStrategy(matchingRule);
    const versionHeader = config.invalidation?.header;

    event.respondWith(
      (async () => {
        try {
          // Get from cache
          const cached = await getResponseFromIndexedDB(request, { maxStaleAge: fallback.maxStaleAge });

          // Stale-while-revalidate strategy
          if (fallback.strategy === 'stale-while-revalidate' && cached.response) {
            stats.hits++;
            logCacheHit(request.url);

            // Return cached, revalidate in background
            if (cached.needsRevalidation || cached.isExpired) {
              // Background revalidation
              (async () => {
                try {
                  const networkResponse = await fetchWithTimeout(request.clone(), timeout);
                  const metadata = extractCacheMetadata(networkResponse);

                  if (shouldCacheResponse(networkResponse, metadata)) {
                    const ttl = calculateTTL(metadata, ruleTTL, respectHttpHeaders);
                    await storeResponseInIndexedDB(request, networkResponse, ttl, matchingRule.test, metadata);
                    await enforceCacheLimits(matchingRule.test, maxEntries);
                  }
                } catch (e) {
                  debugLog('Background revalidation failed:', e.message);
                }
              })();
            }

            return cached.response;
          }

          // Check if needs revalidation (ETag/Last-Modified)
          if (cached.response && cached.needsRevalidation && (cached.record.etag || cached.record.lastModified)) {
            const revalidation = await revalidateWithServer(request, cached.record, timeout);

            if (revalidation.notModified) {
              stats.hits++;
              logCacheHit(request.url);

              // Update validUntil
              cached.record.validUntil = Date.now() + ruleTTL * 60000;
              const db = await openIndexedDB();
              const tx = db.transaction(STORE_NAME, 'readwrite');
              tx.objectStore(STORE_NAME).put(cached.record);

              return cached.response;
            }

            if (revalidation.response) {
              stats.misses++;
              const metadata = extractCacheMetadata(revalidation.response);

              if (shouldCacheResponse(revalidation.response, metadata)) {
                const ttl = calculateTTL(metadata, ruleTTL, respectHttpHeaders);
                storeResponseInIndexedDB(request, revalidation.response.clone(), ttl, matchingRule.test, metadata)
                  .then(() => enforceCacheLimits(matchingRule.test, maxEntries));
              }

              return revalidation.response;
            }
          }

          // Fresh cache hit
          if (cached.response && !cached.isExpired) {
            // Check version header invalidation
            if (versionHeader && cached.record.cacheVersion) {
              // Will be checked on next network request
            }

            stats.hits++;
            logCacheHit(request.url);
            return cached.response;
          }

          // Cache miss or expired - fetch from network
          stats.misses++;
          logCacheMiss(request.url);

          const networkResponse = await fetchWithTimeout(request.clone(), timeout);
          const metadata = extractCacheMetadata(networkResponse);

          // Store version header if configured
          if (versionHeader) {
            metadata.cacheVersion = networkResponse.headers.get(versionHeader);
          }

          if (shouldCacheResponse(networkResponse, metadata)) {
            const ttl = calculateTTL(metadata, ruleTTL, respectHttpHeaders);
            storeResponseInIndexedDB(request, networkResponse.clone(), ttl, matchingRule.test, metadata)
              .then(() => enforceCacheLimits(matchingRule.test, maxEntries))
              .catch(() => {});
          }

          return networkResponse;

        } catch (error) {
          debugLog('Fetch error:', error.message);
          stats.errors++;

          // Fallback strategies
          if (fallback.strategy === 'network-only') {
            throw error;
          }

          // stale-if-error: Try to return stale cache
          const stale = await getResponseFromIndexedDB(request, { maxStaleAge: fallback.maxStaleAge });

          if (stale.response && !stale.isTooStale) {
            debugLog('Returning stale cache due to network error');
            return stale.response;
          }

          return new Response(JSON.stringify({
            error: 'Network request failed',
            message: error.message
          }), {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'application/json' }
          });
        }
      })()
    );
  });

  debugLog('Initialized with', config.rules.length, 'rules');
  if (config.invalidation) {
    debugLog('Invalidation config:', config.invalidation.type || 'http-headers');
  }
  if (config.quota) {
    debugLog('Quota config:', (config.quota.maxSize / 1024 / 1024).toFixed(0), 'MB max');
  }
}

// Export for service worker context
if (typeof self !== 'undefined') {
  self.initZephyr = initZephyr;
  self.zephyr = {
    clear: clearAllCache,
    clearPattern: clearCacheByPattern,
    invalidate: clearCacheByPattern,
    invalidateUrl: clearCacheByUrl,
    stats: getCacheStats,
    quota: getQuotaUsage,
    debug: () => { debugMode = !debugMode; return debugMode; }
  };
}
