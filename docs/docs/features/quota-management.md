# Quota Management

Monitor and control cache storage usage.

## Configuration

```javascript
const config = {
  quota: {
    maxSize: 50 * 1024 * 1024,  // 50MB
    warningThreshold: 0.8,      // Warn at 80%
    onQuotaExceeded: 'evict-lru'
  },
  rules: [...]
};
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxSize` | number | - | Maximum cache size in bytes |
| `warningThreshold` | number | 0.8 | Percentage to trigger warning |
| `onQuotaExceeded` | string | `'evict-lru'` | Action when limit reached |

## Quota Actions

### evict-lru (Recommended)

Removes least recently used entries to make space:

```javascript
quota: {
  maxSize: 50 * 1024 * 1024,
  onQuotaExceeded: 'evict-lru'
}
```

This keeps frequently accessed content while removing old/unused entries.

### stop-caching

Stops caching new entries when limit is reached:

```javascript
quota: {
  maxSize: 50 * 1024 * 1024,
  onQuotaExceeded: 'stop-caching'
}
```

Existing cached content continues to be served.

### clear-all

Clears entire cache when limit is reached:

```javascript
quota: {
  maxSize: 50 * 1024 * 1024,
  onQuotaExceeded: 'clear-all'
}
```

Use with caution - this removes all cached content.

## Quota Events

Listen for quota warnings in your page:

```javascript
zephyr.onQuotaWarning((event) => {
  console.warn(`Cache usage: ${(event.percentage * 100).toFixed(1)}%`);
  console.log(`Used: ${formatBytes(event.used)} / ${formatBytes(event.max)}`);

  // Optionally notify user or take action
  if (event.percentage > 0.9) {
    showNotification('Cache storage is almost full');
  }
});

function formatBytes(bytes) {
  return (bytes / 1024 / 1024).toFixed(2) + ' MB';
}
```

## Check Usage

Query current usage programmatically:

```javascript
const usage = await zephyr.quota();
console.log(usage);
// {
//   used: 25165824,
//   max: 52428800,
//   percentage: "48.0%",
//   available: 27262976
// }
```

## Size Recommendations

| Use Case | Recommended Size |
|----------|-----------------|
| Simple blog | 10-20 MB |
| News site | 30-50 MB |
| E-commerce | 50-100 MB |
| Media-heavy app | 100-200 MB |

## Browser Limits

Browsers impose storage limits:

| Browser | Limit |
|---------|-------|
| Chrome | 80% of available disk |
| Firefox | 50% of disk (max 2GB) |
| Safari | 1GB |
| Edge | Similar to Chrome |

Set your `maxSize` well below browser limits to avoid issues.

## Clearing Cache

### Clear All

```javascript
await zephyr.clear();
```

### Clear by Pattern

```javascript
// Clear all images
await zephyr.clearPattern('.*\\.(jpg|png|gif|webp)$');

// Clear API cache
await zephyr.clearPattern('.*\\/api\\/.*');
```

## Best Practices

1. **Set reasonable limits** - Don't use all available storage
2. **Use `evict-lru`** - It's the safest default
3. **Monitor usage** - Add quota warning handlers
4. **Provide clear option** - Let users clear cache if needed
5. **Test on low-storage devices** - Mobile browsers have lower limits
