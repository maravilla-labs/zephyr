# Basic Caching Example

Cache static assets like images, CSS, and JavaScript.

## Configuration

```javascript
// zephyrConfig.js
importScripts('https://unpkg.com/@maravilla-labs/zephyr@0.2.0/lib/zephyrWorker.js');

const config = {
  rules: [
    // Images - cache for 24 hours
    {
      test: '.*\\.(png|jpg|jpeg|gif|webp|svg|ico)$',
      method: 'GET',
      cache: 1440,
      maxEntries: 200,
      fallback: {
        strategy: 'stale-if-error',
        maxStaleAge: 2880  // Serve stale up to 48h if network fails
      }
    },

    // CSS files - cache for 24 hours
    {
      test: '.*\\.css$',
      method: 'GET',
      cache: 1440,
      maxEntries: 50
    },

    // JavaScript files - cache for 24 hours
    {
      test: '.*\\.js$',
      method: 'GET',
      cache: 1440,
      maxEntries: 50
    },

    // Fonts - cache for 1 week
    {
      test: '.*\\.(woff|woff2|ttf|otf|eot)$',
      method: 'GET',
      cache: 10080,
      maxEntries: 20
    },

    // JSON data - cache for 1 hour
    {
      test: '.*\\.json$',
      method: 'GET',
      cache: 60,
      maxEntries: 30
    }
  ],

  quota: {
    maxSize: 30 * 1024 * 1024,  // 30MB
    warningThreshold: 0.8,
    onQuotaExceeded: 'evict-lru'
  }
};

initZephyr(config);
```

## HTML Setup

```html
<!DOCTYPE html>
<html>
<head>
  <title>My Website</title>
  <link rel="stylesheet" href="/css/styles.css">
</head>
<body>
  <img src="/images/logo.png" alt="Logo">
  <img src="/images/hero.jpg" alt="Hero">

  <script src="/js/app.js"></script>

  <!-- Register Zephyr -->
  <script type="module" src="https://unpkg.com/@maravilla-labs/zephyr@0.2.0/lib/zephrInstall.js"></script>
</body>
</html>
```

## Testing

1. Open your site in Chrome
2. Open DevTools → Application → Service Workers
3. Verify `zephyrConfig.js` is registered
4. Add `?zephyrDebug=true` to URL
5. Reload and check console for cache logs:

```
[Zephyr] Cache MISS: /images/logo.png
[Zephyr] Cached: /images/logo.png (TTL: 1440min)
[Zephyr] Cache MISS: /css/styles.css
[Zephyr] Cached: /css/styles.css (TTL: 1440min)
```

6. Reload again and see cache hits:

```
[Zephyr] Cache HIT: /images/logo.png
[Zephyr] Cache HIT: /css/styles.css
```

## Statistics

Check cache statistics from browser console:

```javascript
const stats = await zephyr.stats();
console.log(`Hit rate: ${stats.hitRate}`);
console.log(`Entries: ${stats.entries}`);
console.log(`Storage: ${stats.storageUsedMB}`);
```

## Versioning with Query Strings

For cache busting with query strings:

```html
<link rel="stylesheet" href="/css/styles.css?v=1.2.3">
<script src="/js/app.js?v=1.2.3"></script>
```

The query string makes each version a unique cache entry.

## CDN Integration

If using a CDN, include the CDN domain in your patterns:

```javascript
{
  test: '^https://cdn\\.example\\.com/.*\\.(png|jpg|css|js)$',
  cache: 1440,
  maxEntries: 300
}
```
