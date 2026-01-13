# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0] - 2025-01-11

### Added
- **Cache Invalidation**: Multiple strategies for enterprise CMS integration
  - Manifest-based polling with configurable interval and custom parser
  - Custom header-based invalidation (e.g., `X-Cache-Version`)
  - HTTP standard header support (Cache-Control, Expires, ETag, Last-Modified)
  - Conditional requests with `If-None-Match` and `If-Modified-Since`
  - 304 Not Modified handling for efficient revalidation
  - New APIs: `zephyr.invalidate(pattern)`, `zephyr.invalidateUrl(url)`

- **Quota Monitoring**: Storage size tracking and management
  - Configurable `maxSize` limit (default: 50MB)
  - Warning threshold with `onQuotaWarning` event
  - Configurable actions: `evict-lru`, `stop-caching`, `clear-all`
  - New API: `zephyr.quota()` returns usage stats

- **Configurable Fallback Strategies**: Per-rule fallback behavior
  - `stale-if-error`: Return stale cache only on network errors (default)
  - `stale-while-revalidate`: Return cache immediately, refresh in background
  - `network-only`: Never use stale cache
  - Configurable `maxStaleAge` to limit staleness

- **Enhanced Statistics**: New metrics
  - `revalidations`: Count of conditional request validations
  - `storageUsed`: Total bytes used
  - `storageUsedMB`: Human-readable storage size
  - `prefetches`: Count of eager cache operations (when enabled)

- **Eager Caching**: Proactive caching for improved performance
  - Precache on Install: Define static URLs to cache during SW installation
  - Link Prediction: Prefetch URLs on `mouseenter`/`touchstart` before user clicks
  - Configurable scope: `rules-only` (match cache rules) or `same-origin` (any link)
  - Debounce delay to prevent excessive prefetching
  - Respects data-saver mode and slow connections
  - Pattern matching for link prediction eligibility
  - New API: `zephyr.prefetch(url)` for manual prefetching
  - New API: `zephyr.onPrecacheComplete(callback)` for precache status
  - `ZephyrLinkPredictor` class for client-side link observation

### Changed
- HTTP cache headers now respected by default (can be disabled)
- `s-maxage` takes priority over `max-age` for shared cache behavior
- Improved TTL calculation: server headers > rule config

### Compatibility
- Manifest endpoint is a stub - enterprise defines the integration
- All new features are backward compatible

## [0.1.0] - 2025-01-11

### Added
- **Security**: Response validation - only cache successful (2xx) responses
- **Security**: Respect `Cache-Control: no-store` and `no-cache` headers
- **Security**: Skip caching responses with `Set-Cookie` headers
- **Security**: Request timeout with configurable duration (default 10s)
- **Feature**: LRU cache eviction with configurable `maxEntries` per rule
- **Feature**: Cache management API (`zephyr.clear()`, `zephyr.clearPattern()`, `zephyr.stats()`)
- **Feature**: Stale-while-revalidate fallback on network errors
- **Feature**: Statistics tracking (hits, misses, errors, evictions, hit rate)
- **DX**: TypeScript definitions (`lib/types.d.ts`)
- **DX**: Improved error messages with actionable hints
- **DX**: Debug mode toggle via API or URL parameter
- **Build**: Vite build configuration
- **Build**: Vitest test suite
- **Docs**: Comprehensive README with examples

### Changed
- Bumped version to 0.1.0 (first production-ready release)
- Refactored codebase for better maintainability
- Improved IndexedDB schema with indexes for LRU and pattern queries
- Console logging now only in debug mode

### Fixed
- Version mismatch between package.json and CDN references
- Missing error handling for fetch failures
- Missing error handling for IndexedDB operations
- Unhandled promise rejections

### Security
- Added response validation to prevent cache poisoning
- Added timeout to prevent hanging requests
- Removed sensitive data from cached responses (Set-Cookie headers)

## [0.0.4] - 2024-03-15

### Added
- Initial public release
- Basic service worker caching
- Regex-based URL matching
- TTL-based cache expiration
- POST request caching with payload hashing
- Debug mode via URL parameter

## [0.0.2] - 2024-02-01

### Added
- Initial development version
