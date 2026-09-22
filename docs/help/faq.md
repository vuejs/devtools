# Frequently Asked Questions

## I can't use the open-in-editor feature

Starting with Vue DevTools v9, the Vite plugin only supports Vite 8.3.0+.
Open-in-editor is provided by the connected `@vitejs/devtools` host. Make sure the source file is
inside the workspace root and the Vite DevTools host is connected. See the [path validation diagnostic](https://devtools.vite.dev/errors/dtk0028)
for rejected paths.

## How is the editor selected?

The v8 `launchEditor` option has been removed. Set `LAUNCH_EDITOR` when you start Vite, for
example `cursor` or `code`. When that variable is unset, Vite DevTools chooses an editor from the
ones currently running. See [Open component in editor](/getting-started/open-in-editor).

## How do I use Vue DevTools with the Laravel Vite plugin?

```ts [vite.config.ts]
import laravel from 'laravel-vite-plugin'
import { defineConfig } from 'vite'
import VueDevTools from 'vite-plugin-vue-devtools'

export default defineConfig({
  devtools: {
    apply: 'serve',
  },
  plugins: [
    VueDevTools({
      appendTo: 'resources/js/app.js',
    }),
    laravel(['resources/js/app.js']),
  ],
})
```

## How do I use Vue DevTools with Nuxt 3? (v7.1.3+)

:::tip Recommendation
We still recommend using [Nuxt DevTools](https://github.com/nuxt/devtools) for a better development experience.
:::

```ts [nuxt.config.ts]
export default defineNuxtConfig({
  vite: {
    devtools: {
      apply: 'serve',
    },
    plugins: [
      VueDevTools({
        appendTo: /\/entry\.m?js$/,
      }),
    ],
  },
})
```

## How do I use Vue DevTools with [Vite Ruby](https://vite-ruby.netlify.app/)?

```ts [vite.config.ts]
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import RubyPlugin from 'vite-plugin-ruby'
import VueDevTools from 'vite-plugin-vue-devtools'

export default defineConfig({
  devtools: {
    apply: 'serve',
  },
  plugins: [
    VueDevTools({
      appendTo: 'app/frontend/entrypoints/application.js', // your app entrypoint (wherever you call createApp())
    }),
    RubyPlugin(),
    vue(),
  ],
})
```

## How do I use Vue DevTools with [WXT](https://wxt.dev/)?

```ts [wxt.config.ts]
import devtools from 'vite-plugin-vue-devtools'
import { defineConfig } from 'wxt'

export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  vite: () => ({
    devtools: {
      apply: 'serve',
    },
    plugins: [
      devtools({
        // your app entrypoint (wherever you call createApp())
        appendTo: '/entrypoints/popup/main.ts',
      }),
    ],
  }),
})
```
