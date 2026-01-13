import { defaultTheme } from '@vuepress/theme-default'
import { defineUserConfig } from 'vuepress'
import { viteBundler } from '@vuepress/bundler-vite'

export default defineUserConfig({
  lang: 'en-US',
  title: 'Zephyr',
  description: 'Lightweight service worker caching library for web applications',
  base: '/',

  theme: defaultTheme({
    logo: '/logo.webp',
    repo: 'maravilla-labs/zephyr',

    navbar: [
      { text: 'Guide', link: '/guide/' },
      { text: 'Features', link: '/features/' },
      { text: 'API', link: '/api/' },
      { text: 'Examples', link: '/examples/' },
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Guide',
          children: [
            '/guide/',
            '/guide/installation',
            '/guide/quick-start',
            '/guide/configuration',
          ],
        },
      ],
      '/features/': [
        {
          text: 'Features',
          children: [
            '/features/',
            '/features/caching-rules',
            '/features/fallback-strategies',
            '/features/invalidation',
            '/features/quota-management',
          ],
        },
      ],
      '/api/': [
        {
          text: 'API Reference',
          children: [
            '/api/',
          ],
        },
      ],
      '/examples/': [
        {
          text: 'Examples',
          children: [
            '/examples/',
            '/examples/basic-caching',
            '/examples/cms-integration',
            '/examples/offline-first',
          ],
        },
      ],
    },
  }),

  bundler: viteBundler(),
})
