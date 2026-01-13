# Installation

## npm / pnpm / yarn

Install Zephyr from npm:

```bash
# npm
npm install @maravilla-labs/zephyr

# pnpm
pnpm add @maravilla-labs/zephyr

# yarn
yarn add @maravilla-labs/zephyr
```

## CDN

Use Zephyr directly from a CDN without installation:

```html
<!-- Auto-register service worker -->
<script type="module" src="https://unpkg.com/@maravilla-labs/zephyr@0.2.0/lib/zephrInstall.js"></script>
```

For the service worker configuration file:

```javascript
// zephyrConfig.js
importScripts('https://unpkg.com/@maravilla-labs/zephyr@0.2.0/lib/zephyrWorker.js');
```

## File Structure

After installation, you need two files:

```
your-project/
├── index.html          # Include zephrInstall.js
└── zephyrConfig.js     # Your caching configuration
```

## Requirements

| Requirement | Details |
|-------------|---------|
| HTTPS | Service Workers require a secure context |
| Browser | Chrome 60+, Firefox 44+, Safari 11.1+, Edge 17+ |
| IndexedDB | Required for cache storage |

::: tip Localhost Exception
Service Workers work on `localhost` without HTTPS for development purposes.
:::

## Next Steps

Continue to [Quick Start](./quick-start.md) to set up your first caching rule.
