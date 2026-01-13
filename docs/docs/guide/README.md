# Getting Started

Zephyr is a lightweight service worker caching library that provides intelligent caching strategies for web applications using Service Workers and IndexedDB.

## Why Zephyr?

- **Simple Setup**: Get caching working in under 5 minutes
- **Flexible Rules**: Use regex patterns to define what gets cached
- **Smart Invalidation**: Multiple strategies for keeping cache fresh
- **Production Ready**: Used in enterprise CMS environments

## Prerequisites

- A web application served over HTTPS (or localhost for development)
- Modern browser with Service Worker support (Chrome 60+, Firefox 44+, Safari 11.1+)

## Next Steps

1. [Install Zephyr](./installation.md) in your project
2. Follow the [Quick Start](./quick-start.md) guide
3. Learn about [Configuration](./configuration.md) options

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      Your Web Application                    │
├─────────────────────────────────────────────────────────────┤
│  zephrInstall.js  │  Registers SW, exposes window.zephyr    │
├───────────────────┼─────────────────────────────────────────┤
│  zephyrWorker.js  │  Service Worker with caching logic      │
├───────────────────┼─────────────────────────────────────────┤
│  IndexedDB        │  Cache storage with metadata            │
└─────────────────────────────────────────────────────────────┘
```

Zephyr intercepts fetch requests, checks against your rules, and serves from cache when appropriate. It stores responses in IndexedDB with metadata for TTL, ETag, and LRU tracking.
