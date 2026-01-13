# API Reference

Zephyr exposes a client-side API via `window.zephyr`.

## Ready State

### zephyr.ready()

Wait for the service worker to be active:

```javascript
await zephyr.ready();
console.log('Service worker is active');
```

**Returns:** `Promise<void>`

## Cache Management

### zephyr.clear()

Clear all cached entries:

```javascript
await zephyr.clear();
```

**Returns:** `Promise<void>`

### zephyr.clearPattern(pattern)

Clear entries matching a regex pattern:

```javascript
// Clear all images
await zephyr.clearPattern('.*\\.(jpg|png|gif)$');

// Clear API cache
await zephyr.clearPattern('.*\\/api\\/.*');
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `pattern` | string | Regex pattern to match URLs |

**Returns:** `Promise<void>`

### zephyr.invalidate(pattern)

Alias for `clearPattern`. Invalidate entries matching a pattern:

```javascript
await zephyr.invalidate('.*\\/api\\/products');
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `pattern` | string | Regex pattern to match URLs |

**Returns:** `Promise<void>`

### zephyr.invalidateUrl(url)

Invalidate a specific URL:

```javascript
await zephyr.invalidateUrl('https://example.com/api/user/123');
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `url` | string | Full URL to invalidate |

**Returns:** `Promise<void>`

## Statistics

### zephyr.stats()

Get cache statistics:

```javascript
const stats = await zephyr.stats();
console.log(stats);
```

**Returns:** `Promise<ZephyrStats>`

```typescript
interface ZephyrStats {
  hits: number;           // Cache hits
  misses: number;         // Cache misses
  errors: number;         // Network errors
  evictions: number;      // LRU evictions
  revalidations: number;  // Conditional request revalidations
  prefetches: number;     // Prefetch operations
  entries: number;        // Current cached entries
  storageUsed: number;    // Storage used in bytes
  storageUsedMB: string;  // Formatted storage (e.g., "5.00 MB")
  hitRate: string;        // Hit rate percentage (e.g., "86.7%")
}
```

## Quota

### zephyr.quota()

Get storage quota information:

```javascript
const quota = await zephyr.quota();
console.log(quota);
```

**Returns:** `Promise<QuotaInfo>`

```typescript
interface QuotaInfo {
  used: number;         // Bytes used
  max: number;          // Maximum bytes
  percentage: string;   // Usage percentage (e.g., "48.0%")
  available: number;    // Bytes available
}
```

## Events

### zephyr.onQuotaWarning(callback)

Register a callback for quota warnings:

```javascript
zephyr.onQuotaWarning((event) => {
  console.warn(`Cache at ${(event.percentage * 100).toFixed(1)}%`);
  console.log(`Used: ${event.used} / ${event.max} bytes`);
});
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `callback` | function | Called when quota threshold exceeded |

**Callback receives:**

```typescript
interface QuotaWarningEvent {
  percentage: number;  // 0.0 to 1.0
  used: number;        // Bytes used
  max: number;         // Maximum bytes
}
```

### zephyr.onPrecacheComplete(callback)

Register a callback for precache completion:

```javascript
zephyr.onPrecacheComplete((event) => {
  console.log(`Precached: ${event.succeeded}/${event.total}`);
  if (event.failed > 0) {
    console.warn(`Failed: ${event.failed}`);
  }
});
```

**Callback receives:**

```typescript
interface PrecacheCompleteEvent {
  succeeded: number;  // Successfully cached
  failed: number;     // Failed to cache
  total: number;      // Total attempted
}
```

## Debug Mode

### zephyr.debug()

Toggle debug mode for detailed logging:

```javascript
await zephyr.debug();
```

Or enable via URL parameter:

```
https://example.com/?zephyrDebug=true
```

Debug output:

```
[Zephyr] Cache HIT: /images/logo.png
[Zephyr] Cache MISS: /api/data
[Zephyr] Cached: /api/data (TTL: 60min)
[Zephyr] Evicted: /old/image.png (LRU)
```

## Prefetch

### zephyr.prefetch(urls)

Prefetch URLs into the cache:

```javascript
await zephyr.prefetch([
  '/images/hero.jpg',
  '/api/featured-products',
  '/css/critical.css'
]);
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `urls` | string[] | Array of URLs to prefetch |

**Returns:** `Promise<void>`

## TypeScript Types

Import types for TypeScript projects:

```typescript
import type {
  ZephyrConfig,
  ZephyrRule,
  ZephyrStats,
  QuotaConfig,
  FallbackConfig,
  InvalidationConfig
} from '@maravilla-labs/zephyr';
```

### ZephyrConfig

```typescript
interface ZephyrConfig {
  rules: ZephyrRule[];
  invalidation?: InvalidationConfig;
  quota?: QuotaConfig;
  precache?: PrecacheConfig;
}
```

### ZephyrRule

```typescript
interface ZephyrRule {
  test: string;
  method?: string;
  cache: number;
  maxEntries?: number;
  timeout?: number;
  fallback?: FallbackConfig;
}
```

### FallbackConfig

```typescript
interface FallbackConfig {
  strategy: 'stale-if-error' | 'stale-while-revalidate' | 'network-only';
  maxStaleAge?: number;
}
```

### InvalidationConfig

```typescript
interface InvalidationConfig {
  type: 'http' | 'manifest' | 'header';
  respectHttpHeaders?: boolean;
  url?: string;
  interval?: number;
  header?: string;
  compare?: (cached: string, current: string) => boolean;
}
```

### QuotaConfig

```typescript
interface QuotaConfig {
  maxSize: number;
  warningThreshold?: number;
  onQuotaExceeded?: 'evict-lru' | 'stop-caching' | 'clear-all';
}
```
