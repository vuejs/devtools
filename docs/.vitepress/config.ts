import type { DefaultTheme } from 'vitepress'
import { defineConfig } from 'vitepress'
import vite from './vite.config'

const GETTING_STARTED: DefaultTheme.NavItemWithLink[] = [
  { text: 'Introduction', link: '/getting-started/introduction' },
  { text: 'Installation', link: '/getting-started/installation' },
  { text: 'Features', link: '/getting-started/features' },
  { text: 'Open in editor', link: '/getting-started/open-in-editor' },
]

const GUIDES: DefaultTheme.NavItemWithLink[] = [
  { text: 'Vite Plugin', link: '/guide/vite-plugin' },
  { text: 'Browser Extension', link: '/guide/browser-extension' },
  { text: 'Standalone App', link: '/guide/standalone' },
]

const HELP: DefaultTheme.NavItemWithLink[] = [
  { text: 'Migration Guide', link: '/guide/migration' },
  { text: 'Contributing', link: '/help/contributing' },
  { text: 'FAQ', link: '/help/faq' },
  { text: 'Troubleshooting', link: '/help/troubleshooting' },
]

const PLUGINS: DefaultTheme.NavItemWithLink[] = [
  { text: 'API', link: '/plugins/api' },
]

// const VERSIONS: DefaultTheme.NavItemWithLink[] = [
//   { text: `v${version} (current)`, link: 'https://github.com/vuejs/devtools/releases' },
// ]

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: 'Vue DevTools',
  description: 'Unleash Vue Developer Experience',
  markdown: {
    theme: {
      light: 'vitesse-light',
      dark: 'vitesse-dark',
    },
  },

  cleanUrls: true,
  vite,
  themeConfig: {
    siteTitle: false,
    logo: { src: '/logo-mini.svg', width: 60, height: 60 },
    nav: [
      {
        text: 'Guide',
        link: '/getting-started/introduction',
      },
      {
        text: 'Plugins',
        items: [
          {
            items: PLUGINS,
          },
        ],
      },
      {
        text: 'Migration Guide',
        link: '/guide/migration',
      },
      {
        text: '💚️ Sponsor',
        link: 'https://github.com/sponsors/webfansplz',
      },
      {
        text: 'Playground',
        link: 'https://stackblitz.com/github/vuejs/create-vue-templates/tree/main/devtools-router-pinia',
      },
    ],

    sidebar: Object.assign(
      {},
      {
        '/': [
          {
            text: 'Getting Started',
            items: GETTING_STARTED,
          },
          {
            text: 'Installation Guide',
            items: GUIDES,
          },
          {
            text: 'Help',
            items: HELP,
          },
          {
            text: 'Plugins',
            items: [
              {
                items: PLUGINS,
              },
            ],
          },
        ],
        // '/plugins/': [
        //   {
        //     text: 'Guide',
        //     items: GUIDES,
        //   },
        //   {
        //     text: 'Plugins',
        //     items: [
        //       {
        //         items: PLUGINS,
        //       },
        //     ],
        //   },
        // ],
      },

    ),

    editLink: {
      pattern: 'https://github.com/vuejs/devtools/edit/main/docs/:path',
      text: 'Suggest changes to this page',
    },
    search: {
      provider: 'local',
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/vuejs/devtools' },
    ],

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2023-PRESENT Arlo(webfansplz).',
    },
  },

  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/logo-mini.svg' }],
    ['meta', { name: 'theme-color', content: '#ffffff' }],
    ['link', { rel: 'icon', href: '/logo.svg', type: 'image/svg+xml' }],
    ['meta', { name: 'author', content: 'Arlo(webfansplz)' }],
    ['meta', { name: 'og:site_name', content: 'Vue DevTools' }],
    ['meta', { property: 'og:title', content: 'Vue DevTools' }],
    ['meta', { property: 'og:image', content: '' }],
    ['meta', { property: 'og:description', content: 'Unleash Vue Developer Experience' }],
    ['meta', { name: 'og:type', content: 'website' }],
    ['meta', { name: 'og:locale', content: 'en' }],
    ['meta', { name: 'viewport', content: 'width=device-width, initial-scale=1.0, viewport-fit=cover' }],
  ],
})
