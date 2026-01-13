# Caching Rules

Rules define which requests get cached and how they're managed.

## Rule Structure

```javascript
{
  test: '.*\\.(png|jpg)$',   // Regex pattern
  method: 'GET',              // HTTP method
  cache: 60,                  // TTL in minutes
  maxEntries: 100,            // Maximum entries
  timeout: 10000              // Request timeout (ms)
}
```

## Pattern Matching

The `test` property uses JavaScript regex patterns:

```javascript
// Match image files
'.*\\.(png|jpg|jpeg|gif|webp|svg)$'

// Match specific API endpoint
'.*\\/api\\/v1\\/products$'

// Match domain
'^https://api\\.example\\.com/.*'

// Match JSON files
'.*\\.json$'

// Match any path segment
'.*\\/users\\/\\d+$'  // /users/123
```

### Common Patterns

| Pattern | Matches |
|---------|---------|
| `.*\\.(png\|jpg)$` | Files ending in .png or .jpg |
| `.*\\/api\\/.*` | Any path containing /api/ |
| `^https://cdn\\..*` | URLs starting with https://cdn. |
| `.*\\.json$` | JSON files |
| `.*\\?.*` | URLs with query strings |

## HTTP Methods

Specify which HTTP method to cache:

```javascript
// GET requests only (most common)
{ test: '.*\\/api\\/.*', method: 'GET', cache: 5 }

// POST requests (uses payload hashing)
{ test: '.*\\/api\\/search', method: 'POST', cache: 5 }

// All methods (omit method property)
{ test: '.*\\.json$', cache: 60 }
```

### POST Caching

POST requests are cached using a hash of the request body:

```javascript
// Same endpoint, different payloads = different cache entries
POST /api/search { query: "shoes" }  → Cache key: hash1
POST /api/search { query: "hats" }   → Cache key: hash2
```

## TTL (Time To Live)

The `cache` property sets expiration in **minutes**:

```javascript
{ cache: 1 }      // 1 minute
{ cache: 60 }     // 1 hour
{ cache: 1440 }   // 24 hours
{ cache: 10080 }  // 1 week
```

After TTL expires, the entry is considered stale. Behavior depends on your [fallback strategy](./fallback-strategies.md).

## Max Entries

Limit cache size per rule with `maxEntries`:

```javascript
{
  test: '.*\\/api\\/products',
  cache: 60,
  maxEntries: 50  // Keep only 50 most recent
}
```

When the limit is reached, the **least recently used (LRU)** entries are evicted.

## Request Timeout

Set a timeout for network requests:

```javascript
{
  test: '.*\\/api\\/.*',
  cache: 5,
  timeout: 5000  // 5 seconds (default: 10000)
}
```

If the request times out, Zephyr will use the fallback strategy.

## Multiple Rules

Rules are evaluated in order. First match wins:

```javascript
const config = {
  rules: [
    // Specific rule first
    { test: '.*\\/api\\/checkout', cache: 1, fallback: { strategy: 'network-only' } },

    // General rule second
    { test: '.*\\/api\\/.*', cache: 5 },

    // Static assets last
    { test: '.*\\.(png|jpg|css|js)$', cache: 1440 }
  ]
};
```

## Examples

### E-commerce Site

```javascript
rules: [
  // Product images - long cache
  { test: '.*\\/products\\/.*\\.(jpg|png|webp)$', cache: 1440, maxEntries: 500 },

  // Product API - short cache with background refresh
  { test: '.*\\/api\\/products', cache: 5, fallback: { strategy: 'stale-while-revalidate' } },

  // Cart/Checkout - always fresh
  { test: '.*\\/api\\/(cart|checkout)', cache: 1, fallback: { strategy: 'network-only' } },

  // Static assets
  { test: '.*\\.(css|js)$', cache: 1440 }
]
```

### News Site

```javascript
rules: [
  // Breaking news - very short cache
  { test: '.*\\/api\\/breaking', cache: 1 },

  // Article content - moderate cache
  { test: '.*\\/api\\/articles', cache: 30 },

  // Images - long cache
  { test: '.*\\.(jpg|png|gif)$', cache: 1440 }
]
```
