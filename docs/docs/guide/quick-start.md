# Quick Start

Get Zephyr running in 5 minutes.

## Step 1: Create Configuration

Create `zephyrConfig.js` in your project root:

```javascript
// zephyrConfig.js
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
    // Cache CSS and JS for 24 hours
    {
      test: '.*\\.(css|js)$',
      method: 'GET',
      cache: 1440,
      maxEntries: 50
    }
  ]
};

initZephyr(config);
```

## Step 2: Register Service Worker

Add the install script to your HTML:

```html
<!DOCTYPE html>
<html>
<head>
  <title>My App</title>
</head>
<body>
  <!-- Your content -->

  <!-- Register Zephyr -->
  <script type="module" src="https://unpkg.com/@maravilla-labs/zephyr@0.2.0/lib/zephrInstall.js"></script>
</body>
</html>
```

Or register manually:

```javascript
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./zephyrConfig.js', { scope: '/' });
}
```

## Step 3: Verify It Works

1. Open your browser DevTools
2. Go to **Application** → **Service Workers**
3. You should see `zephyrConfig.js` registered
4. Add `?zephyrDebug=true` to your URL to see cache logs

```
[Zephyr] Cache HIT: /images/logo.png
[Zephyr] Cache MISS: /api/data
[Zephyr] Cached: /api/data (TTL: 60min)
```

5. Reload and see cache hits:

```
[Zephyr] Cache HIT: /images/logo.png
[Zephyr] Cache HIT: /css/styles.css
```

## What Gets Cached?

Only requests matching your rules are cached:

| Rule | Matches |
|------|---------|
| `.*\\.(png\|jpg)$` | `/images/logo.png`, `/photo.jpg` |
| `.*\\/api\\/.*` | `/api/users`, `/api/products/123` |
| `^https://cdn\\.example\\.com/.*` | Any request to cdn.example.com |

## Next Steps

- Learn about [Configuration](./configuration.md) options
- Explore [Caching Rules](/features/caching-rules.md) in depth
- Set up [Cache Invalidation](/features/invalidation.md)
