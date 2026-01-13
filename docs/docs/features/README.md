# Features Overview

Zephyr provides a comprehensive set of features for intelligent caching in web applications.

## Core Features

### [Caching Rules](./caching-rules.md)
Define what gets cached using regex patterns. Support for GET and POST requests with TTL-based expiration and LRU eviction.

### [Fallback Strategies](./fallback-strategies.md)
Configure behavior when cache is stale or network fails. Choose from stale-while-revalidate, stale-if-error, or network-only.

### [Cache Invalidation](./invalidation.md)
Multiple strategies to keep cache fresh: HTTP headers, manifest polling, custom headers, and manual API.

### [Quota Management](./quota-management.md)
Monitor and manage storage usage with configurable limits, warnings, and automatic eviction policies.

## Technical Highlights

| Feature | Description |
|---------|-------------|
| **IndexedDB Storage** | Reliable storage with metadata for TTL and access tracking |
| **ETag Support** | Conditional requests for efficient revalidation |
| **POST Caching** | Intelligent payload hashing for POST request caching |
| **Debug Mode** | Detailed logging for troubleshooting |
| **TypeScript** | Full type definitions included |

## Security

Zephyr includes built-in security features:

- Skips error responses (4xx, 5xx)
- Respects `Cache-Control: no-store`
- Ignores responses with `Set-Cookie` headers
- Configurable request timeouts
- Uses conditional requests (If-None-Match)
