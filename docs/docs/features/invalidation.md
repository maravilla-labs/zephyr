# Cache Invalidation

Zephyr supports multiple strategies for keeping cache fresh.

## Strategies Overview

| Strategy | Use Case |
|----------|----------|
| HTTP Headers | Standard web caching (default) |
| Manifest Polling | CMS integration |
| Custom Header | Version-based invalidation |
| Manual API | Programmatic control |

## HTTP Headers (Default)

Zephyr respects standard HTTP cache headers:

```javascript
const config = {
  invalidation: {
    type: 'http',
    respectHttpHeaders: true  // Default
  },
  rules: [...]
};
```

### Supported Headers

| Header | Effect |
|--------|--------|
| `Cache-Control: max-age=X` | Override rule TTL |
| `Cache-Control: s-maxage=X` | Shared cache TTL (priority) |
| `Cache-Control: no-store` | Don't cache |
| `Cache-Control: no-cache` | Revalidate every request |
| `Expires: <date>` | Fallback if no max-age |
| `ETag` | Conditional request support |
| `Last-Modified` | Conditional request support |

### ETag Revalidation

When a cached response has an ETag, Zephyr sends conditional requests:

```
GET /api/data
If-None-Match: "abc123"

Server Response:
  304 Not Modified → Use cached response
  200 OK → Update cache with new response
```

## Manifest Polling

Poll a manifest file to detect content changes:

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

### Manifest Format

```json
{
  "version": "2026-01-13T12:00:00Z",
  "patterns": {
    ".*\\/api\\/products": "2026-01-13T11:30:00Z",
    ".*\\.(jpg|png)": "2026-01-12T10:00:00Z"
  }
}
```

### How It Works

1. **Version Change**: All cache is invalidated
2. **Pattern Timestamps**: Entries matching patterns are invalidated if cached before the timestamp

## Custom Header

Invalidate based on a custom response header:

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

Your server includes version in responses:

```
HTTP/1.1 200 OK
X-Cache-Version: v2.5.0
Content-Type: application/json
```

When the version changes, cached responses with older versions are invalidated.

## Manual API

Invalidate cache programmatically from your page:

```javascript
// Invalidate by pattern
await zephyr.invalidate('.*\\/api\\/products');

// Invalidate specific URL
await zephyr.invalidateUrl('https://example.com/api/user/123');

// Clear all cache
await zephyr.clear();

// Clear by pattern
await zephyr.clearPattern('.*\\.jpg$');
```

### Real-time Invalidation

Combine with WebSockets or Server-Sent Events:

```javascript
// Connect to your CMS event stream
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

## Combining Strategies

You can use HTTP headers with manual invalidation:

```javascript
const config = {
  invalidation: {
    type: 'http',
    respectHttpHeaders: true
  },
  rules: [...]
};

// Later, trigger manual invalidation
document.getElementById('refresh-btn').onclick = async () => {
  await zephyr.invalidate('.*\\/api\\/.*');
  location.reload();
};
```

## Best Practices

1. **Use HTTP headers** for standard web content
2. **Use manifest polling** for CMS-managed content
3. **Use manual API** for user-triggered refreshes
4. **Combine strategies** as needed
