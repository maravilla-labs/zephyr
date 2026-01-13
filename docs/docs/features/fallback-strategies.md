# Fallback Strategies

Fallback strategies define behavior when cache is stale or the network fails.

## Available Strategies

| Strategy | Behavior |
|----------|----------|
| `stale-if-error` | Return stale only if network fails |
| `stale-while-revalidate` | Return stale immediately, refresh in background |
| `network-only` | Never use stale cache |

## stale-if-error (Default)

Returns stale cache **only** when the network request fails:

```javascript
{
  test: '.*\\/api\\/.*',
  cache: 5,
  fallback: {
    strategy: 'stale-if-error',
    maxStaleAge: 1440  // Serve stale up to 24 hours
  }
}
```

### Flow

```
Request → Check Cache
  ├─ Fresh? → Return cached response
  └─ Stale? → Try network
              ├─ Success → Return fresh, update cache
              └─ Error → Return stale (if within maxStaleAge)
```

### Best For

- API endpoints where freshness matters
- Data that changes frequently
- When you want fresh data but need a safety net

## stale-while-revalidate

Returns cached response **immediately**, then refreshes in the background:

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

### Flow

```
Request → Check Cache
  ├─ Fresh? → Return cached response
  └─ Stale? → Return stale immediately
              └─ Background: Fetch fresh, update cache
```

### Best For

- Product catalogs
- User preferences
- Data where slight staleness is acceptable
- Improving perceived performance

## network-only

**Never** serves stale cache. Always requires fresh data:

```javascript
{
  test: '.*\\/api\\/checkout',
  cache: 1,
  fallback: {
    strategy: 'network-only'
  }
}
```

### Flow

```
Request → Check Cache
  ├─ Fresh? → Return cached response
  └─ Stale? → Fetch from network (no fallback)
              ├─ Success → Return fresh
              └─ Error → Return error to client
```

### Best For

- Payment processing
- Authentication endpoints
- Real-time data (stock prices, live scores)
- Security-sensitive operations

## maxStaleAge

Limits how long stale content can be served:

```javascript
fallback: {
  strategy: 'stale-if-error',
  maxStaleAge: 2880  // 48 hours max
}
```

| Value | Duration |
|-------|----------|
| 60 | 1 hour |
| 1440 | 24 hours |
| 2880 | 48 hours |
| 10080 | 1 week |

If stale content exceeds `maxStaleAge`, it won't be served even with `stale-if-error`.

## Choosing a Strategy

```
┌─────────────────────────────────────────────────────────┐
│              How critical is data freshness?            │
├───────────────────────┬─────────────────────────────────┤
│    Very Critical      │        Moderately Important     │
│   (payments, auth)    │        (content, products)      │
├───────────────────────┼─────────────────────────────────┤
│    network-only       │     Can user wait for data?     │
│                       ├────────────────┬────────────────┤
│                       │      Yes       │       No       │
│                       │ stale-if-error │ stale-while-   │
│                       │                │ revalidate     │
└───────────────────────┴────────────────┴────────────────┘
```

## Examples

### Mixed Strategy Configuration

```javascript
rules: [
  // Critical: Always fresh
  {
    test: '.*\\/api\\/(auth|payment|checkout)',
    cache: 1,
    fallback: { strategy: 'network-only' }
  },

  // Important: Fresh preferred, stale if needed
  {
    test: '.*\\/api\\/user',
    cache: 5,
    fallback: {
      strategy: 'stale-if-error',
      maxStaleAge: 60
    }
  },

  // Performance: Fast response, background refresh
  {
    test: '.*\\/api\\/products',
    cache: 5,
    fallback: {
      strategy: 'stale-while-revalidate',
      maxStaleAge: 1440
    }
  },

  // Static: Long cache, stale fallback
  {
    test: '.*\\.(jpg|png|css|js)$',
    cache: 1440,
    fallback: {
      strategy: 'stale-if-error',
      maxStaleAge: 2880
    }
  }
]
```
