# CMS Integration Example

Integrate Zephyr with a Content Management System for real-time cache invalidation.

## Manifest-Based Invalidation

### Zephyr Configuration

```javascript
// zephyrConfig.js
importScripts('https://unpkg.com/@maravilla-labs/zephyr@0.2.0/lib/zephyrWorker.js');

const config = {
  rules: [
    // Article content
    {
      test: '.*\\/api\\/articles.*',
      method: 'GET',
      cache: 60,
      maxEntries: 200,
      fallback: { strategy: 'stale-while-revalidate' }
    },
    // Images
    {
      test: '.*\\/uploads\\/.*\\.(jpg|png|webp)$',
      cache: 1440,
      maxEntries: 500
    },
    // Page content
    {
      test: '.*\\/api\\/pages.*',
      method: 'GET',
      cache: 30,
      maxEntries: 50
    }
  ],

  invalidation: {
    type: 'manifest',
    url: '/api/cache-manifest',
    interval: 30000  // Poll every 30 seconds
  },

  quota: {
    maxSize: 100 * 1024 * 1024,
    onQuotaExceeded: 'evict-lru'
  }
};

initZephyr(config);
```

### CMS Manifest Endpoint

Your CMS should expose a manifest endpoint:

```javascript
// Express.js example
app.get('/api/cache-manifest', (req, res) => {
  res.json({
    version: lastGlobalUpdate.toISOString(),
    patterns: {
      '.*\\/api\\/articles': lastArticleUpdate.toISOString(),
      '.*\\/api\\/pages': lastPageUpdate.toISOString(),
      '.*\\/uploads\\/.*': lastMediaUpdate.toISOString()
    }
  });
});
```

### How It Works

1. Zephyr polls `/api/cache-manifest` every 30 seconds
2. If `version` changes → all cache invalidated
3. If pattern timestamp changes → matching entries invalidated
4. When editor publishes content:
   - CMS updates manifest timestamps
   - Next poll invalidates affected cache
   - Users see fresh content

## Real-Time with SSE

For instant invalidation without polling:

### Client-Side

```javascript
// main.js - Connect to CMS events
const eventSource = new EventSource('/api/cache-events');

eventSource.addEventListener('publish', async (event) => {
  const data = JSON.parse(event.data);
  console.log('Content published:', data);

  // Invalidate matching cache
  await zephyr.invalidate(data.pattern);
});

eventSource.addEventListener('unpublish', async (event) => {
  const data = JSON.parse(event.data);
  await zephyr.invalidateUrl(data.url);
});

eventSource.addEventListener('media-update', async (event) => {
  await zephyr.invalidate('.*\\/uploads\\/.*');
});

eventSource.onerror = () => {
  console.warn('SSE connection lost, falling back to manifest polling');
};
```

### Server-Side (Node.js)

```javascript
// Express.js SSE endpoint
app.get('/api/cache-events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Keep connection alive
  const keepAlive = setInterval(() => {
    res.write(':keepalive\n\n');
  }, 30000);

  // Listen for CMS events
  cms.on('publish', (content) => {
    res.write(`event: publish\n`);
    res.write(`data: ${JSON.stringify({
      pattern: `.*\\/api\\/${content.type}.*`,
      id: content.id
    })}\n\n`);
  });

  cms.on('unpublish', (content) => {
    res.write(`event: unpublish\n`);
    res.write(`data: ${JSON.stringify({
      url: `/api/${content.type}/${content.id}`
    })}\n\n`);
  });

  req.on('close', () => {
    clearInterval(keepAlive);
  });
});
```

## WordPress Integration

### Zephyr Config for WordPress

```javascript
const config = {
  rules: [
    { test: '.*\\/wp-json\\/wp\\/v2\\/posts', cache: 30 },
    { test: '.*\\/wp-content\\/uploads\\/.*', cache: 1440 },
    { test: '.*\\/wp-content\\/themes\\/.*\\.(css|js)$', cache: 1440 }
  ],
  invalidation: {
    type: 'manifest',
    url: '/wp-json/zephyr/v1/manifest',
    interval: 60000
  }
};
```

## Editor Refresh Button

Add a manual refresh option for editors:

```javascript
// Admin panel
if (userIsEditor) {
  document.getElementById('refresh-cache').onclick = async () => {
    await zephyr.clear();
    location.reload();
  };
}
```
