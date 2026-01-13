# Examples

Practical examples for common use cases.

## Quick Links

- [Basic Caching](./basic-caching.md) - Cache images, CSS, JS
- [CMS Integration](./cms-integration.md) - Manifest polling, real-time invalidation
- [Offline-First App](./offline-first.md) - Full offline support

## Use Case Overview

| Use Case | Key Features |
|----------|--------------|
| Static Sites | Long TTL, stale-if-error fallback |
| E-commerce | Product caching, cart exclusion |
| News/Media | Short TTL, background refresh |
| SPA | API caching, offline support |
| CMS | Manifest invalidation, SSE |

## Configuration Templates

### Minimal Setup

```javascript
importScripts('https://unpkg.com/@maravilla-labs/zephyr@0.2.0/lib/zephyrWorker.js');

const config = {
  rules: [
    { test: '.*\\.(png|jpg|css|js)$', cache: 60 }
  ]
};

initZephyr(config);
```

### Production Setup

```javascript
importScripts('https://unpkg.com/@maravilla-labs/zephyr@0.2.0/lib/zephyrWorker.js');

const config = {
  rules: [
    // Static assets
    {
      test: '.*\\.(png|jpg|jpeg|gif|webp|svg|ico)$',
      cache: 1440,
      maxEntries: 200,
      fallback: { strategy: 'stale-if-error', maxStaleAge: 2880 }
    },
    // CSS/JS
    {
      test: '.*\\.(css|js)$',
      cache: 1440,
      maxEntries: 50
    },
    // API
    {
      test: '.*\\/api\\/.*',
      method: 'GET',
      cache: 5,
      maxEntries: 100,
      fallback: { strategy: 'stale-while-revalidate' }
    }
  ],
  quota: {
    maxSize: 50 * 1024 * 1024,
    warningThreshold: 0.8,
    onQuotaExceeded: 'evict-lru'
  }
};

initZephyr(config);
```
