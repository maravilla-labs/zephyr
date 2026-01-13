<p align="center">
  <img src="logo.webp" alt="Zephyr Logo" height="150">
</p>

<h1 align="center">Zephyr</h1>

<p align="center">
  <strong>Lightweight service worker caching library for web applications</strong>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#installation">Installation</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#configuration">Configuration</a> •
  <a href="#invalidation">Invalidation</a> •
  <a href="#quota-monitoring">Quota Monitoring</a> •
  <a href="#fallback-strategies">Fallback Strategies</a> •
  <a href="#api">API</a> •
  <a href="#license">License</a>
</p>

---

Zephyr provides intelligent caching strategies for web applications using Service Workers and IndexedDB. It enables offline access, reduces network requests, and improves performance with minimal configuration.

## Features

- **Simple Configuration** - Define caching rules with regex patterns
- **Multiple HTTP Methods** - Cache GET and POST requests (POST uses payload hashing)
- **TTL-based Expiration** - Configure cache lifetime per rule
- **LRU Eviction** - Automatic cache size management with configurable limits
- **Cache Invalidation** - Multiple strategies for enterprise CMS integration
- **HTTP Header Support** - Respects Cache-Control, ETag, Last-Modified
- **Quota Monitoring** - Track storage usage with configurable limits
- **Configurable Fallback** - stale-while-revalidate, stale-if-error, network-only
- **Cache Management API** - Clear cache, invalidate patterns, get statistics
- **TypeScript Support** - Full type definitions included
- **Lightweight** - No dependencies, ~8KB minified

## Installation

### npm

```bash
npm install @maravilla-labs/zephyr
```

### CDN

```html
<script type="module" src="https://unpkg.com/@maravilla-labs/zephyr@0.2.0/lib/zephrInstall.js"></script>
```

## Quick Start

### 1. Create Configuration File

Create `zephyrConfig.js` in your project root:

```javascript
// Import the worker (CDN or local path)
importScripts('https://unpkg.com/@maravilla-labs/zephyr@0.2.0/lib/zephyrWorker.js');

const config = {
  rules: [
    // Cache images for 1 hour
    {
      test: '.*\\.(png|jpg|jpeg|gif|webp|svg)$',
      method: 'GET',
      cache: 60,
      maxEntries: 100
    },
    // Cache API responses for 24 hours
    {
      test: '.*\\/api\\/products',
      method: 'POST',
      cache: 1440,
      maxEntries: 50
    }
  ]
};

initZephyr(config);
```

### 2. Register the Service Worker

Add to your HTML:

```html
<script type="module" src="https://unpkg.com/@maravilla-labs/zephyr@0.2.0/lib/zephrInstall.js"></script>
```

Or register manually:

```javascript
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./zephyrConfig.js', { scope: '/' });
}
```

That's it! Zephyr will now cache matching requests.

## Configuration

### Rule Options

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `test` | `string` | ✓ | Regex pattern to match request URLs |
| `method` | `string` | | HTTP method (`GET`, `POST`, etc.). Matches all if omitted |
| `cache` | `number` | ✓ | Cache TTL in minutes |
| `maxEntries` | `number` | | Max cached entries for this rule (default: 100) |
| `timeout` | `number` | | Request timeout in ms (default: 10000) |
| `fallback` | `object` | | Fallback strategy configuration |

### Pattern Examples

```javascript
// Match any .jpg or .png file
'.*\\.(jpg|png)$'

// Match specific API endpoint
'.*\\/api\\/v1\\/products$'

// Match any request to a domain
'^https://api\\.example\\.com/.*'

// Match JSON files
'.*\\.json$'
```

### Complete Example

```javascript
importScripts('https://unpkg.com/@maravilla-labs/zephyr@0.2.0/lib/zephyrWorker.js');

const config = {
  rules: [
    // Static assets - long cache with stale fallback
    {
      test: '.*\\.(png|jpg|jpeg|gif|webp|svg|ico)$',
      method: 'GET',
      cache: 1440,      // 24 hours
      maxEntries: 200,
      fallback: {
        strategy: 'stale-if-error',
        maxStaleAge: 2880  // Serve stale up to 48h on error
      }
    },
    // API with background refresh
    {
      test: '.*\\/api\\/.*',
      method: 'GET',
      cache: 5,         // 5 minutes
      maxEntries: 100,
      fallback: {
        strategy: 'stale-while-revalidate'
      }
    },
    // Critical endpoints - never stale
    {
      test: '.*\\/api\\/checkout',
      method: 'POST',
      cache: 1,
      fallback: {
        strategy: 'network-only'
      }
    }
  ],

  // Quota monitoring
  quota: {
    maxSize: 50 * 1024 * 1024,  // 50MB
    warningThreshold: 0.8,
    onQuotaExceeded: 'evict-lru'
  }
};

initZephyr(config);
```

## Invalidation

Zephyr supports multiple cache invalidation strategies for enterprise use cases.

### HTTP Standard Headers (Default)

By default, Zephyr respects standard HTTP cache headers:

```javascript
const config = {
  invalidation: {
    type: 'http',
    respectHttpHeaders: true  // Default
  },
  rules: [...]
};
```

**Supported headers:**
- `Cache-Control: max-age=X` - Override rule TTL
- `Cache-Control: s-maxage=X` - Shared cache TTL (takes priority)
- `Cache-Control: must-revalidate` - Always check with server
- `Expires: <date>` - Fallback TTL if no max-age
- `ETag` - Used for conditional requests (`If-None-Match`)
- `Last-Modified` - Used for conditional requests (`If-Modified-Since`)

### Manifest-Based Polling

For CMS integration, use manifest polling:

```javascript
const config = {
  invalidation: {
    type: 'manifest',
    url: '/api/cache-manifest.json',
    interval: 60000  // Poll every 60 seconds
  },
  rules: [...]
};
```

**Expected manifest format:**
```json
{
  "version": "2025-01-11T22:00:00Z",
  "patterns": {
    ".*\\/api\\/products": "2025-01-11T21:30:00Z",
    ".*\\.(jpg|png)": "2025-01-10T10:00:00Z"
  }
}
```

When `version` changes, all cache is invalidated. Pattern-specific timestamps invalidate matching entries cached before that time.

### Custom Header Invalidation

For version-based invalidation via response headers:

```javascript
const config = {
  invalidation: {
    type: 'header',
    header: 'X-Cache-Version',
    compare: (cached, current) => cached !== current
  },
  rules: [...]
};
```

### Manual Invalidation API

Invalidate cache programmatically from your page:

```javascript
// Invalidate all entries matching pattern
await zephyr.invalidate('.*\\/api\\/products');

// Invalidate specific URL
await zephyr.invalidateUrl('https://example.com/api/user/123');

// Clear all cache
await zephyr.clear();
```

## Quota Monitoring

Track and manage cache storage usage:

```javascript
const config = {
  quota: {
    maxSize: 50 * 1024 * 1024,  // 50MB limit
    warningThreshold: 0.8,      // Warn at 80%
    onQuotaExceeded: 'evict-lru'  // or 'stop-caching' or 'clear-all'
  },
  rules: [...]
};
```

### Quota Events

Listen for quota warnings in your page:

```javascript
zephyr.onQuotaWarning((event) => {
  console.warn(`Cache at ${(event.percentage * 100).toFixed(1)}%`);
  console.log(`Used: ${event.used} / ${event.max} bytes`);
});
```

### Check Usage

```javascript
const usage = await zephyr.quota();
// {
//   used: 25165824,
//   max: 52428800,
//   percentage: "48.0%",
//   available: 27262976
// }
```

## Fallback Strategies

Configure per-rule behavior when cache is stale or network fails:

### stale-if-error (Default)

Return stale cache only when network request fails:

```javascript
{
  test: '.*\\/api\\/.*',
  cache: 5,
  fallback: {
    strategy: 'stale-if-error',
    maxStaleAge: 1440  // Max 24 hours stale
  }
}
```

### stale-while-revalidate

Return cache immediately, refresh in background:

```javascript
{
  test: '.*\\/api\\/products',
  cache: 5,
  fallback: {
    strategy: 'stale-while-revalidate',
    maxStaleAge: 60  // Max 1 hour stale
  }
}
```

### network-only

Never use stale cache - always require fresh data:

```javascript
{
  test: '.*\\/api\\/checkout',
  cache: 1,
  fallback: {
    strategy: 'network-only'
  }
}
```

## API

Zephyr exposes a client-side API via `window.zephyr`:

### Cache Management

```javascript
// Clear all cached entries
await zephyr.clear();

// Clear entries matching a pattern
await zephyr.clearPattern('.*\\.jpg$');

// Invalidate by pattern (alias for clearPattern)
await zephyr.invalidate('.*\\/api\\/.*');

// Invalidate specific URL
await zephyr.invalidateUrl('https://example.com/api/data');
```

### Statistics

```javascript
const stats = await zephyr.stats();
// {
//   hits: 150,
//   misses: 23,
//   errors: 0,
//   evictions: 5,
//   revalidations: 12,
//   entries: 47,
//   storageUsed: 5242880,
//   storageUsedMB: "5.00 MB",
//   hitRate: "86.7%"
// }
```

### Quota Usage

```javascript
const quota = await zephyr.quota();
// {
//   used: 5242880,
//   max: 52428800,
//   percentage: "10.0%",
//   available: 47185920
// }
```

### Quota Events

```javascript
zephyr.onQuotaWarning((event) => {
  console.warn('Cache usage at', event.percentage * 100, '%');
});
```

### Debug Mode

```javascript
// Toggle debug mode
await zephyr.debug();
```

Or add `?zephyrDebug=true` to any URL.

### Ready State

```javascript
await zephyr.ready();
console.log('Service worker is active');
```


### Real-time Invalidation

For immediate cache invalidation (without polling), use WebSockets or SSE:

```javascript
// In your page - connect to CMS dispatcher
const eventSource = new EventSource('/api/cache-events');

eventSource.addEventListener('publish', (event) => {
  const data = JSON.parse(event.data);
  zephyr.invalidate(data.pattern);
});

eventSource.addEventListener('unpublish', (event) => {
  const data = JSON.parse(event.data);
  zephyr.invalidateUrl(data.url);
});
```

## How It Works

1. **Request Interception**: Service worker intercepts fetch requests
2. **Rule Matching**: Checks if URL matches any configured rule
3. **Cache Check**: Looks for valid cached response in IndexedDB
4. **Revalidation**: If stale, optionally revalidates with conditional request
5. **Network Fallback**: Fetches from network if cache miss or expired
6. **Response Validation**: Only caches successful responses (status 200-299)
7. **Storage**: Stores response with TTL, ETag, and updates access time
8. **Eviction**: Removes oldest entries when limits are reached

### Security Features

Zephyr automatically:
- **Skips error responses** (4xx, 5xx status codes)
- **Respects Cache-Control** headers (`no-store`, `no-cache`)
- **Ignores Set-Cookie** responses (user-specific data)
- **Applies request timeouts** (configurable, default 10s)
- **Uses conditional requests** (ETag, If-None-Match)

## Browser Support

| Browser | Support |
|---------|---------|
| Chrome | 60+ |
| Firefox | 44+ |
| Safari | 11.1+ |
| Edge | 17+ |
| Opera | 47+ |

**Requirements:**
- HTTPS or localhost (Service Workers require secure context)
- IndexedDB support

## Development

```bash
# Install dependencies
pnpm install

# Run dev server
pnpm dev

# Run tests
pnpm test

# Build for production
pnpm build
```

## TypeScript

Type definitions are included. Import types:

```typescript
import type {
  ZephyrConfig,
  ZephyrRule,
  ZephyrStats,
  QuotaConfig,
  FallbackConfig,
  InvalidationConfig
} from '@maravilla-labs/zephyr';

const config: ZephyrConfig = {
  rules: [
    {
      test: '.*\\.json$',
      cache: 60,
      maxEntries: 50,
      fallback: {
        strategy: 'stale-while-revalidate',
        maxStaleAge: 120
      }
    }
  ],
  quota: {
    maxSize: 50 * 1024 * 1024,
    warningThreshold: 0.8,
    onQuotaExceeded: 'evict-lru'
  }
};
```

## Troubleshooting

### Service worker not registering

- Ensure you're on HTTPS or localhost
- Check that `zephyrConfig.js` is in the root directory
- Look for errors in browser DevTools → Application → Service Workers

### Cache not working

- Enable debug mode: add `?zephyrDebug=true` to URL
- Check console for cache hit/miss logs
- Verify your regex patterns match the URLs

### Clear stuck cache

```javascript
// In browser console
await zephyr.clear();
// Or unregister service worker in DevTools
```

### Quota issues

```javascript
// Check current usage
const quota = await zephyr.quota();
console.log(quota.percentage);

// Clear if needed
await zephyr.clear();
```

## Contributing

Contributions welcome! Please read our contributing guidelines and submit PRs to the [GitHub repository](https://github.com/maravilla-labs/zephyr).

## License

Apache License 2.0 - see [LICENSE](LICENSE) for details.

---

<p align="center">
  Made with ♥ by <a href="https://www.maravillalabs.com">Maravilla Labs</a>
</p>
