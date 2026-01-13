# Configuration

Complete guide to configuring Zephyr.

## Configuration Structure

```javascript
const config = {
  // Caching rules (required)
  rules: [...],

  // Cache invalidation settings
  invalidation: {...},

  // Storage quota management
  quota: {...}
};

initZephyr(config);
```

## Rules

Each rule defines what to cache and how:

```javascript
{
  test: '.*\\.(png|jpg)$',   // Regex pattern to match URLs
  method: 'GET',              // HTTP method (optional)
  cache: 60,                  // TTL in minutes
  maxEntries: 100,            // Max entries for this rule
  timeout: 10000,             // Request timeout in ms
  fallback: {                 // Fallback strategy
    strategy: 'stale-if-error',
    maxStaleAge: 1440
  }
}
```

### Rule Properties

| Property | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `test` | string | ✓ | - | Regex pattern to match URLs |
| `method` | string | - | all | HTTP method to match |
| `cache` | number | ✓ | - | Cache TTL in minutes |
| `maxEntries` | number | - | 100 | Max cached entries |
| `timeout` | number | - | 10000 | Request timeout (ms) |
| `fallback` | object | - | - | Fallback strategy |

## Invalidation

```javascript
invalidation: {
  type: 'http',              // 'http', 'manifest', or 'header'
  respectHttpHeaders: true,  // Respect Cache-Control headers
  url: '/api/manifest.json', // For manifest type
  interval: 60000,           // Polling interval (ms)
  header: 'X-Cache-Version'  // For header type
}
```

See [Cache Invalidation](/features/invalidation.md) for details.

## Quota

```javascript
quota: {
  maxSize: 50 * 1024 * 1024,  // 50MB limit
  warningThreshold: 0.8,      // Warn at 80%
  onQuotaExceeded: 'evict-lru' // What to do when full
}
```

### Quota Actions

| Action | Description |
|--------|-------------|
| `evict-lru` | Remove least recently used entries |
| `stop-caching` | Stop caching new entries |
| `clear-all` | Clear entire cache |

See [Quota Management](/features/quota-management.md) for details.

## Complete Example

```javascript
importScripts('https://unpkg.com/@maravilla-labs/zephyr@0.2.0/lib/zephyrWorker.js');

const config = {
  rules: [
    // Static assets - long cache
    {
      test: '.*\\.(png|jpg|jpeg|gif|webp|svg|ico)$',
      method: 'GET',
      cache: 1440,
      maxEntries: 200,
      fallback: {
        strategy: 'stale-if-error',
        maxStaleAge: 2880
      }
    },
    // API with background refresh
    {
      test: '.*\\/api\\/.*',
      method: 'GET',
      cache: 5,
      maxEntries: 100,
      fallback: {
        strategy: 'stale-while-revalidate'
      }
    },
    // Critical endpoints - always fresh
    {
      test: '.*\\/api\\/checkout',
      method: 'POST',
      cache: 1,
      fallback: {
        strategy: 'network-only'
      }
    }
  ],

  invalidation: {
    type: 'http',
    respectHttpHeaders: true
  },

  quota: {
    maxSize: 50 * 1024 * 1024,
    warningThreshold: 0.8,
    onQuotaExceeded: 'evict-lru'
  }
};

initZephyr(config);
```
