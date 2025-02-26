# Frequently Asked Questions

## I can't use the open-in-editor feature

The feature is based on the [vite-plugin-vue-inspector](https://github.com/webfansplz/vite-plugin-vue-inspector) plugin and requires configuration, which you can do by looking at the [configuration documentation](https://github.com/webfansplz/vite-plugin-vue-inspector?tab=readme-ov-file#--configuration-ide--editor).

## How can I specify the editor for open-in-editor feature?

Starting from **v7.2.0**, you can specify the editor by `launchEditor` option:

This is a list of [supported editors](https://github.com/yyx990803/launch-editor?tab=readme-ov-file#supported-editors), please ensure that the editor's environment variables are correctly configured beforehand.

```ts
import VueDevTools from 'vite-plugin-vue-devtools'
export default defineConfig({
  plugins: [
    VueDevTools({
      launchEditor: 'webstorm',
    }),
    Unocss(),
  ],
})
```

## How to work with Laravel Vite Plugin?

```ts
import laravel from 'laravel-vite-plugin'
import { defineConfig } from 'vite'
import VueDevTools from 'vite-plugin-vue-devtools'

export default defineConfig({
  plugins: [
    VueDevTools({
      appendTo: 'resources/js/app.js'
    }),
    laravel([
      'resources/js/app.js',
    ]),
  ],
})
```

## How to work with Nuxt3? (v7.1.3+)

:::tip Recommendation
We still recommend using [Nuxt DevTools](https://github.com/nuxt/devtools) for a better development experience.
:::

```ts
// nuxt.config.ts

export default defineNuxtConfig({
  vite: {
    plugins: [
      VueDevTools({
        appendTo: /\/entry\.m?js$/,
      })
    ]
  }
})
```

## How to work with [Vite Ruby](https://vite-ruby.netlify.app/)?

```ts
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import RubyPlugin from 'vite-plugin-ruby'
import VueDevTools from 'vite-plugin-vue-devtools'

export default defineConfig({
  plugins: [
    VueDevTools({
      appendTo: 'app/frontend/entrypoints/application.js', // your app entrypoint (wherever you call createApp())
    }),
    RubyPlugin(),
    vue(),
  ],
})
```

## How to work with [WXT](https://wxt.dev/)?

```ts
// wxt.config.ts
import devtools from 'vite-plugin-vue-devtools'
import { defineConfig } from 'wxt'

export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  vite: () => ({
    plugins: [
      devtools({
        // your app entrypoint (wherever you call createApp())
        appendTo: '/entrypoints/popup/main.ts',
      }),
    ],
  }),
})
```
