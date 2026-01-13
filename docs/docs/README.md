---
home: true
title: Zephyr
heroImage: /logo.webp
actions:
  - text: Get Started
    link: /guide/
    type: primary

  - text: View on GitHub
    link: https://github.com/maravilla-labs/zephyr
    type: secondary

features:
  - title: Simple Configuration
    details: Define caching rules with regex patterns. No complex setup required.
  - title: Multiple HTTP Methods
    details: Cache GET and POST requests. POST uses intelligent payload hashing.
  - title: TTL-based Expiration
    details: Configure cache lifetime per rule with automatic expiration.
  - title: LRU Eviction
    details: Automatic cache size management with configurable limits.
  - title: Cache Invalidation
    details: Multiple strategies for enterprise CMS integration.
  - title: HTTP Header Support
    details: Respects Cache-Control, ETag, and Last-Modified headers.
  - title: Quota Monitoring
    details: Track storage usage with configurable limits and warnings.
  - title: Configurable Fallback
    details: stale-while-revalidate, stale-if-error, or network-only strategies.
  - title: TypeScript Support
    details: Full type definitions included for better developer experience.

footer: Apache-2.0 Licensed | Copyright © 2026 Maravilla Labs
---

## Quick Install

```bash
npm install @maravilla-labs/zephyr
```

Or use the CDN:

```html
<script type="module" src="https://unpkg.com/@maravilla-labs/zephyr@0.2.0/lib/zephrInstall.js"></script>
```

## Quick Example

```javascript
// zephyrConfig.js
importScripts('https://unpkg.com/@maravilla-labs/zephyr@0.2.0/lib/zephyrWorker.js');

const config = {
  rules: [
    {
      test: '.*\\.(png|jpg|jpeg|gif|webp|svg)$',
      method: 'GET',
      cache: 60,
      maxEntries: 100
    }
  ]
};

initZephyr(config);
```
