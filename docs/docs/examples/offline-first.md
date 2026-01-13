# Offline-First App Example

Build an app that works fully offline.

## Configuration

```javascript
// zephyrConfig.js
importScripts('https://unpkg.com/@maravilla-labs/zephyr@0.2.0/lib/zephyrWorker.js');

const config = {
  rules: [
    // App shell (HTML, CSS, JS)
    {
      test: '.*\\.(html|css|js)$',
      method: 'GET',
      cache: 1440,
      maxEntries: 50,
      fallback: {
        strategy: 'stale-if-error',
        maxStaleAge: 10080  // Serve stale up to 1 week
      }
    },

    // Images
    {
      test: '.*\\.(png|jpg|jpeg|gif|webp|svg|ico)$',
      method: 'GET',
      cache: 1440,
      maxEntries: 200,
      fallback: {
        strategy: 'stale-if-error',
        maxStaleAge: 10080
      }
    },

    // API data
    {
      test: '.*\\/api\\/.*',
      method: 'GET',
      cache: 60,
      maxEntries: 100,
      fallback: {
        strategy: 'stale-if-error',
        maxStaleAge: 1440  // Use day-old data if offline
      }
    },

    // User data (POST)
    {
      test: '.*\\/api\\/user\\/.*',
      method: 'POST',
      cache: 30,
      maxEntries: 50,
      fallback: {
        strategy: 'stale-if-error',
        maxStaleAge: 1440
      }
    }
  ],

  // Precache critical assets on install
  precache: {
    urls: [
      '/',
      '/index.html',
      '/css/app.css',
      '/js/app.js',
      '/images/logo.png',
      '/api/config'
    ]
  },

  quota: {
    maxSize: 100 * 1024 * 1024,
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
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Offline App</title>
  <link rel="stylesheet" href="/css/app.css">
</head>
<body>
  <div id="app">
    <header>
      <img src="/images/logo.png" alt="Logo">
      <span id="online-status"></span>
    </header>
    <main id="content"></main>
  </div>

  <script src="/js/app.js"></script>
  <script type="module" src="https://unpkg.com/@maravilla-labs/zephyr@0.2.0/lib/zephrInstall.js"></script>
</body>
</html>
```

## Offline Detection

```javascript
// app.js
const statusEl = document.getElementById('online-status');

function updateOnlineStatus() {
  if (navigator.onLine) {
    statusEl.textContent = 'Online';
    statusEl.className = 'status-online';
  } else {
    statusEl.textContent = 'Offline (cached data)';
    statusEl.className = 'status-offline';
  }
}

window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);
updateOnlineStatus();
```

## Optimistic Updates

Handle offline writes with optimistic UI:

```javascript
async function saveData(data) {
  // Update UI immediately
  updateUI(data);

  try {
    const response = await fetch('/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (!response.ok) throw new Error('Save failed');

    showNotification('Saved successfully');
  } catch (error) {
    if (!navigator.onLine) {
      // Queue for later sync
      queueForSync(data);
      showNotification('Saved locally, will sync when online');
    } else {
      showNotification('Save failed', 'error');
      revertUI();
    }
  }
}

// Background sync queue
const syncQueue = [];

function queueForSync(data) {
  syncQueue.push(data);
  localStorage.setItem('syncQueue', JSON.stringify(syncQueue));
}

window.addEventListener('online', async () => {
  const queue = JSON.parse(localStorage.getItem('syncQueue') || '[]');

  for (const data of queue) {
    try {
      await fetch('/api/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
    } catch (e) {
      console.error('Sync failed for item:', data);
    }
  }

  localStorage.removeItem('syncQueue');
  showNotification('Data synced');
});
```

## Precache on Install

Ensure critical assets are available immediately:

```javascript
zephyr.onPrecacheComplete((event) => {
  console.log(`Precached ${event.succeeded}/${event.total} assets`);

  if (event.failed > 0) {
    console.warn(`Failed to precache ${event.failed} assets`);
  }
});
```

## Testing Offline

1. Load your app with network enabled
2. Open DevTools → Application → Service Workers
3. Check "Offline" checkbox
4. Navigate around - app should work
5. Try saving data - should queue for sync
6. Uncheck "Offline"
7. Data should sync automatically

## Cache Status UI

Show cache status to users:

```javascript
async function showCacheStatus() {
  const stats = await zephyr.stats();
  const quota = await zephyr.quota();

  document.getElementById('cache-status').innerHTML = `
    <p>Cached: ${stats.entries} items (${stats.storageUsedMB})</p>
    <p>Storage: ${quota.percentage} used</p>
    <p>Hit rate: ${stats.hitRate}</p>
    <button onclick="clearCache()">Clear Cache</button>
  `;
}

async function clearCache() {
  await zephyr.clear();
  showNotification('Cache cleared');
  showCacheStatus();
}
```

## Progressive Enhancement

Ensure the app works without service worker:

```javascript
// Check for service worker support
if ('serviceWorker' in navigator) {
  // Full offline experience
  enableOfflineFeatures();
} else {
  // Graceful degradation
  showNotification('Offline mode not supported in this browser');
}
```
