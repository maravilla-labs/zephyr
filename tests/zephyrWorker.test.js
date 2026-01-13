/**
 * Zephyr Worker Tests
 *
 * These tests verify the logic of Zephyr functions without requiring
 * full Service Worker/IndexedDB environment.
 */

import { describe, it, expect } from 'vitest';

// ============================================================================
// Helper function implementations for testing
// (These mirror the logic in zephyrWorker.js)
// ============================================================================

function guessContentType(url) {
  const extension = url.split('.').pop().split(/[#?]/)[0].toLowerCase();
  const mimeTypes = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'svg': 'image/svg+xml',
    'ico': 'image/x-icon',
    'css': 'text/css',
    'html': 'text/html',
    'js': 'application/javascript',
    'json': 'application/json',
    'pdf': 'application/pdf',
  };
  return mimeTypes[extension] || 'application/octet-stream';
}

function shouldCacheResponse(response) {
  if (!response.ok) return false;

  const cacheControl = response.headers?.get?.('Cache-Control') ||
                       response.headers?.['cache-control'];
  if (cacheControl) {
    const directives = cacheControl.toLowerCase();
    if (directives.includes('no-store') || directives.includes('no-cache')) {
      return false;
    }
  }

  const setCookie = response.headers?.get?.('Set-Cookie') ||
                    response.headers?.['set-cookie'];
  if (setCookie) return false;

  return true;
}

function findMatchingRule(rules, url, method) {
  return rules.find(rule => {
    try {
      const regex = new RegExp(rule.test);
      return regex.test(url) && (!rule.method || rule.method === method);
    } catch (e) {
      return false;
    }
  });
}

function validateRule(rule, index) {
  const errors = [];
  if (!rule.test) {
    errors.push(`Rule ${index}: missing 'test' pattern`);
  } else {
    try {
      new RegExp(rule.test);
    } catch (e) {
      errors.push(`Rule ${index}: invalid regex pattern`);
    }
  }
  return errors;
}

function validateConfig(config) {
  return config && Array.isArray(config.rules);
}

function calculateExpiration(ttlMinutes) {
  return Date.now() + ttlMinutes * 60000;
}

// ============================================================================
// Tests
// ============================================================================

describe('Content Type Detection', () => {
  it('should detect image content types', () => {
    expect(guessContentType('photo.jpg')).toBe('image/jpeg');
    expect(guessContentType('photo.jpeg')).toBe('image/jpeg');
    expect(guessContentType('icon.png')).toBe('image/png');
    expect(guessContentType('animation.gif')).toBe('image/gif');
    expect(guessContentType('image.webp')).toBe('image/webp');
    expect(guessContentType('logo.svg')).toBe('image/svg+xml');
    expect(guessContentType('favicon.ico')).toBe('image/x-icon');
  });

  it('should detect text content types', () => {
    expect(guessContentType('styles.css')).toBe('text/css');
    expect(guessContentType('page.html')).toBe('text/html');
  });

  it('should detect application content types', () => {
    expect(guessContentType('app.js')).toBe('application/javascript');
    expect(guessContentType('data.json')).toBe('application/json');
    expect(guessContentType('document.pdf')).toBe('application/pdf');
  });

  it('should handle URLs with query strings', () => {
    expect(guessContentType('image.jpg?v=123')).toBe('image/jpeg');
    expect(guessContentType('script.js?cache=false')).toBe('application/javascript');
  });

  it('should handle URLs with hash fragments', () => {
    expect(guessContentType('image.jpg#section')).toBe('image/jpeg');
  });

  it('should return octet-stream for unknown types', () => {
    expect(guessContentType('file.xyz')).toBe('application/octet-stream');
    expect(guessContentType('data.bin')).toBe('application/octet-stream');
  });

  it('should handle URLs without extensions', () => {
    expect(guessContentType('/api/data')).toBe('application/octet-stream');
  });
});

describe('Response Validation', () => {
  it('should not cache error responses', () => {
    expect(shouldCacheResponse({ ok: false, status: 500, headers: {} })).toBe(false);
    expect(shouldCacheResponse({ ok: false, status: 404, headers: {} })).toBe(false);
    expect(shouldCacheResponse({ ok: false, status: 401, headers: {} })).toBe(false);
  });

  it('should not cache responses with no-store directive', () => {
    const response = {
      ok: true,
      headers: { 'cache-control': 'no-store' }
    };
    expect(shouldCacheResponse(response)).toBe(false);
  });

  it('should not cache responses with no-cache directive', () => {
    const response = {
      ok: true,
      headers: { 'cache-control': 'no-cache' }
    };
    expect(shouldCacheResponse(response)).toBe(false);
  });

  it('should not cache responses with Set-Cookie header', () => {
    const response = {
      ok: true,
      headers: { 'set-cookie': 'session=abc123' }
    };
    expect(shouldCacheResponse(response)).toBe(false);
  });

  it('should cache valid responses', () => {
    expect(shouldCacheResponse({ ok: true, headers: {} })).toBe(true);
    expect(shouldCacheResponse({ ok: true, headers: { 'cache-control': 'max-age=3600' } })).toBe(true);
  });

  it('should handle responses without headers', () => {
    expect(shouldCacheResponse({ ok: true })).toBe(true);
  });
});

describe('Rule Matching', () => {
  const rules = [
    { test: '.*\\.jpg$', method: 'GET', cache: 60 },
    { test: '.*\\.png$', method: 'GET', cache: 60 },
    { test: '.*\\/api\\/.*', method: 'POST', cache: 1440 },
    { test: '.*\\.css$', cache: 30 }, // No method restriction
  ];

  it('should match URL patterns', () => {
    expect(findMatchingRule(rules, 'https://example.com/image.jpg', 'GET')).toBeDefined();
    expect(findMatchingRule(rules, 'https://example.com/icon.png', 'GET')).toBeDefined();
  });

  it('should respect method restrictions', () => {
    expect(findMatchingRule(rules, 'https://example.com/api/products', 'POST')).toBeDefined();
    expect(findMatchingRule(rules, 'https://example.com/api/products', 'GET')).toBeUndefined();
  });

  it('should match without method restriction', () => {
    expect(findMatchingRule(rules, 'https://example.com/style.css', 'GET')).toBeDefined();
    expect(findMatchingRule(rules, 'https://example.com/style.css', 'POST')).toBeDefined();
  });

  it('should not match non-matching URLs', () => {
    expect(findMatchingRule(rules, 'https://example.com/page.html', 'GET')).toBeUndefined();
    expect(findMatchingRule(rules, 'https://example.com/data.xml', 'GET')).toBeUndefined();
  });

  it('should handle complex regex patterns', () => {
    const complexRules = [
      { test: '^https://api\\.example\\.com/v[0-9]+/.*', method: 'GET', cache: 60 }
    ];
    expect(findMatchingRule(complexRules, 'https://api.example.com/v1/users', 'GET')).toBeDefined();
    expect(findMatchingRule(complexRules, 'https://api.example.com/v2/products', 'GET')).toBeDefined();
    expect(findMatchingRule(complexRules, 'https://other.com/v1/users', 'GET')).toBeUndefined();
  });
});

describe('Configuration Validation', () => {
  it('should validate rule structure', () => {
    expect(validateRule({ test: '.*\\.jpg$', cache: 60 }, 0)).toHaveLength(0);
    expect(validateRule({ test: '.*\\.png$', method: 'GET', cache: 30 }, 0)).toHaveLength(0);
  });

  it('should detect missing test pattern', () => {
    const errors = validateRule({ cache: 60 }, 0);
    expect(errors).toContain("Rule 0: missing 'test' pattern");
  });

  it('should detect invalid regex patterns', () => {
    const errors = validateRule({ test: '[invalid', cache: 60 }, 0);
    expect(errors).toContain('Rule 0: invalid regex pattern');
  });

  it('should require rules array in config', () => {
    expect(validateConfig({ rules: [] })).toBe(true);
    expect(validateConfig({ rules: [{ test: '.*', cache: 60 }] })).toBe(true);
  });

  it('should reject invalid config', () => {
    expect(validateConfig({})).toBeFalsy();
    expect(validateConfig(null)).toBeFalsy();
    expect(validateConfig(undefined)).toBeFalsy();
    expect(validateConfig({ rules: 'not an array' })).toBeFalsy();
  });
});

describe('TTL Calculation', () => {
  it('should calculate expiration correctly', () => {
    const now = Date.now();
    const ttlMinutes = 60;
    const expiration = calculateExpiration(ttlMinutes);

    expect(expiration).toBeGreaterThan(now);
    // Allow 100ms tolerance for test execution time
    expect(expiration - now).toBeGreaterThanOrEqual(3600000 - 100);
    expect(expiration - now).toBeLessThanOrEqual(3600000 + 100);
  });

  it('should handle different TTL values', () => {
    const now = Date.now();

    // 1 minute
    expect(calculateExpiration(1) - now).toBeCloseTo(60000, -2);

    // 1 day (1440 minutes)
    expect(calculateExpiration(1440) - now).toBeCloseTo(86400000, -2);
  });

  it('should parse string TTL values', () => {
    expect(parseInt('1440', 10)).toBe(1440);
    expect(parseInt('60', 10)).toBe(60);
    expect(parseInt('5', 10)).toBe(5);
  });
});

describe('Statistics', () => {
  it('should calculate hit rate correctly', () => {
    const calculateHitRate = (hits, misses) => {
      if (hits + misses === 0) return 'N/A';
      return (hits / (hits + misses) * 100).toFixed(1) + '%';
    };

    expect(calculateHitRate(0, 0)).toBe('N/A');
    expect(calculateHitRate(100, 0)).toBe('100.0%');
    expect(calculateHitRate(0, 100)).toBe('0.0%');
    expect(calculateHitRate(75, 25)).toBe('75.0%');
    expect(calculateHitRate(2, 1)).toBe('66.7%');
  });

  it('should track statistics correctly', () => {
    const stats = { hits: 0, misses: 0, errors: 0, evictions: 0 };

    stats.hits++;
    stats.hits++;
    stats.misses++;
    stats.errors++;
    stats.evictions++;

    expect(stats.hits).toBe(2);
    expect(stats.misses).toBe(1);
    expect(stats.errors).toBe(1);
    expect(stats.evictions).toBe(1);
  });
});

describe('Cache Key Generation', () => {
  it('should use URL as base key', () => {
    const generateKey = (url, method, payloadHash) => {
      let key = url;
      if (method === 'POST' && payloadHash) {
        key += `-${payloadHash}`;
      }
      return key;
    };

    expect(generateKey('https://example.com/api/data', 'GET')).toBe('https://example.com/api/data');
  });

  it('should include payload hash for POST requests', () => {
    const generateKey = (url, method, payloadHash) => {
      let key = url;
      if (method === 'POST' && payloadHash) {
        key += `-${payloadHash}`;
      }
      return key;
    };

    const key = generateKey('https://example.com/api/data', 'POST', 'abc123');
    expect(key).toBe('https://example.com/api/data-abc123');
  });
});

describe('LRU Eviction Logic', () => {
  it('should sort entries by last access time', () => {
    const entries = [
      { url: 'a', lastAccess: 3000 },
      { url: 'b', lastAccess: 1000 },
      { url: 'c', lastAccess: 2000 },
    ];

    entries.sort((a, b) => a.lastAccess - b.lastAccess);

    expect(entries[0].url).toBe('b'); // oldest
    expect(entries[1].url).toBe('c');
    expect(entries[2].url).toBe('a'); // newest
  });

  it('should identify entries to evict', () => {
    const maxEntries = 3;
    const entries = [
      { url: 'a', lastAccess: 1000 },
      { url: 'b', lastAccess: 2000 },
      { url: 'c', lastAccess: 3000 },
      { url: 'd', lastAccess: 4000 },
      { url: 'e', lastAccess: 5000 },
    ];

    entries.sort((a, b) => a.lastAccess - b.lastAccess);
    const toEvict = entries.slice(0, entries.length - maxEntries);

    expect(toEvict).toHaveLength(2);
    expect(toEvict[0].url).toBe('a');
    expect(toEvict[1].url).toBe('b');
  });
});

describe('Timeout Logic', () => {
  it('should create proper timeout error message', () => {
    const timeout = 10000;
    const error = new Error(`Request timeout after ${timeout}ms`);
    expect(error.message).toBe('Request timeout after 10000ms');
  });
});

// ============================================================================
// v0.2.0 Feature Tests
// ============================================================================

describe('HTTP Header Parsing', () => {
  function parseCacheControl(header) {
    if (!header) return {};
    const directives = {};
    header.split(',').forEach(part => {
      const [key, value] = part.trim().split('=');
      directives[key.toLowerCase()] = value ? parseInt(value, 10) : true;
    });
    return directives;
  }

  it('should parse max-age directive', () => {
    const result = parseCacheControl('max-age=3600');
    expect(result['max-age']).toBe(3600);
  });

  it('should parse s-maxage directive', () => {
    const result = parseCacheControl('s-maxage=7200');
    expect(result['s-maxage']).toBe(7200);
  });

  it('should parse multiple directives', () => {
    const result = parseCacheControl('max-age=3600, s-maxage=7200, must-revalidate');
    expect(result['max-age']).toBe(3600);
    expect(result['s-maxage']).toBe(7200);
    expect(result['must-revalidate']).toBe(true);
  });

  it('should parse no-store and no-cache', () => {
    const result = parseCacheControl('no-store, no-cache');
    expect(result['no-store']).toBe(true);
    expect(result['no-cache']).toBe(true);
  });

  it('should handle empty header', () => {
    expect(parseCacheControl('')).toEqual({});
    expect(parseCacheControl(null)).toEqual({});
    expect(parseCacheControl(undefined)).toEqual({});
  });
});

describe('Expires Header Parsing', () => {
  function parseExpires(header) {
    if (!header) return null;
    const date = new Date(header);
    if (isNaN(date.getTime())) return null;
    return date.getTime();
  }

  it('should parse valid date string', () => {
    const expires = parseExpires('Wed, 15 Jan 2025 12:00:00 GMT');
    expect(expires).toBe(new Date('Wed, 15 Jan 2025 12:00:00 GMT').getTime());
  });

  it('should return null for invalid date', () => {
    expect(parseExpires('invalid')).toBeNull();
    expect(parseExpires('not-a-date-string')).toBeNull();
  });

  it('should return null for empty header', () => {
    expect(parseExpires('')).toBeNull();
    expect(parseExpires(null)).toBeNull();
  });
});

describe('TTL Calculation', () => {
  function calculateTTL(metadata, ruleTTL, respectHeaders = true) {
    const ruleTTLMs = ruleTTL * 60000;

    if (!respectHeaders || !metadata) {
      return ruleTTLMs;
    }

    // Priority: s-maxage > max-age > Expires > rule TTL
    if (metadata.sMaxAge !== undefined) {
      return metadata.sMaxAge * 1000;
    }

    if (metadata.maxAge !== undefined) {
      return metadata.maxAge * 1000;
    }

    if (metadata.expires) {
      return Math.max(0, metadata.expires - Date.now());
    }

    return ruleTTLMs;
  }

  it('should use rule TTL when no headers', () => {
    const ttl = calculateTTL({}, 60, true);
    expect(ttl).toBe(3600000); // 60 minutes in ms
  });

  it('should prefer s-maxage over max-age', () => {
    const metadata = { sMaxAge: 7200, maxAge: 3600 };
    const ttl = calculateTTL(metadata, 60, true);
    expect(ttl).toBe(7200000); // 7200 seconds in ms
  });

  it('should use max-age when no s-maxage', () => {
    const metadata = { maxAge: 3600 };
    const ttl = calculateTTL(metadata, 60, true);
    expect(ttl).toBe(3600000);
  });

  it('should use Expires when no max-age', () => {
    const futureTime = Date.now() + 1800000; // 30 minutes from now
    const metadata = { expires: futureTime };
    const ttl = calculateTTL(metadata, 60, true);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(1800000);
  });

  it('should ignore headers when respectHeaders is false', () => {
    const metadata = { sMaxAge: 7200, maxAge: 3600 };
    const ttl = calculateTTL(metadata, 60, false);
    expect(ttl).toBe(3600000); // Rule TTL
  });

  it('should handle zero max-age', () => {
    const metadata = { maxAge: 0 };
    const ttl = calculateTTL(metadata, 60, true);
    expect(ttl).toBe(0);
  });
});

describe('Quota Monitoring', () => {
  function checkQuotaThreshold(used, max, threshold) {
    const percentage = used / max;
    return percentage >= threshold;
  }

  function calculateQuotaUsage(used, max) {
    return {
      used,
      max,
      percentage: (used / max * 100).toFixed(1) + '%',
      available: max - used
    };
  }

  it('should detect when threshold is exceeded', () => {
    expect(checkQuotaThreshold(80, 100, 0.8)).toBe(true);
    expect(checkQuotaThreshold(81, 100, 0.8)).toBe(true);
    expect(checkQuotaThreshold(79, 100, 0.8)).toBe(false);
  });

  it('should calculate quota usage correctly', () => {
    const usage = calculateQuotaUsage(25 * 1024 * 1024, 50 * 1024 * 1024);
    expect(usage.percentage).toBe('50.0%');
    expect(usage.available).toBe(25 * 1024 * 1024);
  });

  it('should handle zero usage', () => {
    const usage = calculateQuotaUsage(0, 50 * 1024 * 1024);
    expect(usage.percentage).toBe('0.0%');
    expect(usage.available).toBe(50 * 1024 * 1024);
  });

  it('should handle full usage', () => {
    const usage = calculateQuotaUsage(50 * 1024 * 1024, 50 * 1024 * 1024);
    expect(usage.percentage).toBe('100.0%');
    expect(usage.available).toBe(0);
  });
});

describe('Fallback Strategy', () => {
  function shouldUseFallback(strategy, isExpired, isNetworkError, maxStaleAge, cachedAt) {
    if (strategy === 'network-only') {
      return false;
    }

    if (strategy === 'stale-while-revalidate') {
      // Always return stale if within maxStaleAge
      if (maxStaleAge) {
        const staleLimit = cachedAt + maxStaleAge * 60000;
        return Date.now() < staleLimit;
      }
      return true;
    }

    if (strategy === 'stale-if-error') {
      // Only return stale on network error
      if (!isNetworkError) return false;
      if (maxStaleAge) {
        const staleLimit = cachedAt + maxStaleAge * 60000;
        return Date.now() < staleLimit;
      }
      return true;
    }

    return false;
  }

  it('should never use fallback for network-only strategy', () => {
    const now = Date.now();
    expect(shouldUseFallback('network-only', true, true, 1440, now - 60000)).toBe(false);
  });

  it('should use fallback for stale-while-revalidate when cache valid', () => {
    const now = Date.now();
    expect(shouldUseFallback('stale-while-revalidate', true, false, 1440, now - 60000)).toBe(true);
  });

  it('should not use fallback for stale-while-revalidate when too old', () => {
    const now = Date.now();
    const tooOld = now - (1500 * 60000); // 1500 minutes ago, exceeds 1440 maxStaleAge
    expect(shouldUseFallback('stale-while-revalidate', true, false, 1440, tooOld)).toBe(false);
  });

  it('should use fallback for stale-if-error only on network error', () => {
    const now = Date.now();
    expect(shouldUseFallback('stale-if-error', true, true, 1440, now - 60000)).toBe(true);
    expect(shouldUseFallback('stale-if-error', true, false, 1440, now - 60000)).toBe(false);
  });

  it('should respect maxStaleAge for stale-if-error', () => {
    const now = Date.now();
    const tooOld = now - (1500 * 60000);
    expect(shouldUseFallback('stale-if-error', true, true, 1440, tooOld)).toBe(false);
  });
});

describe('Manifest Parsing', () => {
  function parseManifest(data) {
    if (!data || typeof data !== 'object') return null;
    return {
      version: data.version || null,
      patterns: data.patterns || {}
    };
  }

  function shouldInvalidateByManifest(cachedAt, patternTimestamp) {
    if (!patternTimestamp) return false;
    const patternTime = new Date(patternTimestamp).getTime();
    return cachedAt < patternTime;
  }

  it('should parse valid manifest', () => {
    const manifest = parseManifest({
      version: '2025-01-11T22:00:00Z',
      patterns: {
        '.*\\/api\\/products': '2025-01-11T21:30:00Z'
      }
    });
    expect(manifest.version).toBe('2025-01-11T22:00:00Z');
    expect(manifest.patterns['.*\\/api\\/products']).toBe('2025-01-11T21:30:00Z');
  });

  it('should handle manifest without version', () => {
    const manifest = parseManifest({ patterns: {} });
    expect(manifest.version).toBeNull();
    expect(manifest.patterns).toEqual({});
  });

  it('should handle invalid manifest', () => {
    expect(parseManifest(null)).toBeNull();
    expect(parseManifest('string')).toBeNull();
    expect(parseManifest(123)).toBeNull();
  });

  it('should invalidate entries cached before pattern timestamp', () => {
    const cachedAt = new Date('2025-01-11T20:00:00Z').getTime();
    const patternTimestamp = '2025-01-11T21:00:00Z';
    expect(shouldInvalidateByManifest(cachedAt, patternTimestamp)).toBe(true);
  });

  it('should not invalidate entries cached after pattern timestamp', () => {
    const cachedAt = new Date('2025-01-11T22:00:00Z').getTime();
    const patternTimestamp = '2025-01-11T21:00:00Z';
    expect(shouldInvalidateByManifest(cachedAt, patternTimestamp)).toBe(false);
  });
});

describe('Conditional Request Headers', () => {
  function buildConditionalHeaders(metadata) {
    const headers = {};
    if (metadata.etag) {
      headers['If-None-Match'] = metadata.etag;
    }
    if (metadata.lastModified) {
      headers['If-Modified-Since'] = metadata.lastModified;
    }
    return headers;
  }

  it('should include If-None-Match for ETag', () => {
    const headers = buildConditionalHeaders({ etag: '"abc123"' });
    expect(headers['If-None-Match']).toBe('"abc123"');
  });

  it('should include If-Modified-Since for Last-Modified', () => {
    const headers = buildConditionalHeaders({ lastModified: 'Wed, 15 Jan 2025 12:00:00 GMT' });
    expect(headers['If-Modified-Since']).toBe('Wed, 15 Jan 2025 12:00:00 GMT');
  });

  it('should include both headers when available', () => {
    const headers = buildConditionalHeaders({
      etag: '"abc123"',
      lastModified: 'Wed, 15 Jan 2025 12:00:00 GMT'
    });
    expect(headers['If-None-Match']).toBe('"abc123"');
    expect(headers['If-Modified-Since']).toBe('Wed, 15 Jan 2025 12:00:00 GMT');
  });

  it('should return empty object when no metadata', () => {
    expect(buildConditionalHeaders({})).toEqual({});
  });
});

describe('Storage Size Estimation', () => {
  function estimateSize(data) {
    if (data === null || data === undefined) {
      return 0;
    }
    if (typeof data === 'string') {
      return data.length * 2; // UTF-16
    }
    if (data instanceof ArrayBuffer) {
      return data.byteLength;
    }
    if (typeof data === 'object') {
      return JSON.stringify(data).length * 2;
    }
    return 0;
  }

  it('should estimate string size', () => {
    expect(estimateSize('hello')).toBe(10); // 5 chars * 2 bytes
  });

  it('should estimate object size', () => {
    const obj = { key: 'value' };
    const jsonLength = JSON.stringify(obj).length;
    expect(estimateSize(obj)).toBe(jsonLength * 2);
  });

  it('should handle ArrayBuffer', () => {
    const buffer = new ArrayBuffer(1024);
    expect(estimateSize(buffer)).toBe(1024);
  });

  it('should return 0 for unknown types', () => {
    expect(estimateSize(undefined)).toBe(0);
    expect(estimateSize(null)).toBe(0);
  });
});
