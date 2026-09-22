# Vite Plugin

> If your project uses Vite, we recommend the Vue DevTools Vite plugin for its additional features.

:::tip Compatibility Note
Vue DevTools v9 requires **Vite 8.3.0+**. The setup below covers both v9 and earlier versions.
:::

## Installation

::: code-group

```sh [npm]
$ npm add -D vite-plugin-vue-devtools
```

```sh [pnpm]
$ pnpm add -D vite-plugin-vue-devtools
```

```sh [yarn]
$ yarn add -D vite-plugin-vue-devtools
```

```sh [bun]
$ bun add -D vite-plugin-vue-devtools
```

:::

To stay on v8, use `vite-plugin-vue-devtools@8` in the commands above.

### Additional dependencies for v9

If you are using v9, also install `@vitejs/devtools` in your project and upgrade Vite to 8.3.0+:

::: code-group

```sh [npm]
$ npm add -D vite@^8.3.0 @vitejs/devtools
```

```sh [pnpm]
$ pnpm add -D vite@^8.3.0 @vitejs/devtools
```

```sh [yarn]
$ yarn add -D vite@^8.3.0 @vitejs/devtools
```

```sh [bun]
$ bun add -D vite@^8.3.0 @vitejs/devtools
```

:::

Versions before v9 do not require `@vitejs/devtools`.

## Usage

::: code-group

```ts [v9]
import { defineConfig } from 'vite'
import vueDevTools from 'vite-plugin-vue-devtools'

export default defineConfig({
  devtools: true,
  plugins: [vueDevTools()],
})
```

```ts [Before v9]
import { defineConfig } from 'vite'
import vueDevTools from 'vite-plugin-vue-devtools'

export default defineConfig({
  plugins: [vueDevTools()],
})
```

:::

In v9, set `devtools: true` to enable the Vite DevTools host. Earlier versions start Vue DevTools
through `vueDevTools()` alone and do not require this option.

The v9 plugin logs a warning during development if Vite DevTools is disabled.
See the [v8 to v9 migration guide](/guide/migration#migrating-from-v8-to-v9) when upgrading.

### Configure Vite DevTools (v9)

Dock visibility, layout, built-in integrations, and branding are configured through Vite's
`devtools` option:

```ts [vite.config.ts]
import { defineConfig } from 'vite'
import vueDevTools from 'vite-plugin-vue-devtools'

export default defineConfig({
  devtools: {
    apply: 'serve',
    builtinDevTools: false,
    embeddedVisibility: 'passive',
    dockPreferences: {
      defaultMode: 'edge',
      defaultPosition: 'bottom',
    },
  },
  plugins: [vueDevTools()],
})
```

`devtools: true` enables the host for both development and builds. Vue DevTools' runtime integration
runs only during development. Use `apply: 'serve'` to limit the host to development as well.
See the [Vite DevTools guide](https://devtools.vite.dev/guide/) for host options and defaults.

## Options

The following options apply to v9.

```ts
interface VitePluginVueDevToolsOptions {
  /**
   * Whether to install Vue DevTools and register its dock entry.
   * @default true
   */
  enabled?: boolean

  /**
   * Inject the Vue DevTools client into matching browser entry modules instead
   * of relying on Vite's HTML transform.
   * @default undefined
   */
  appendTo?: string | RegExp | Array<string | RegExp>
}
```

### `enabled`

Set this to `false` to disable both the Vue runtime integration and its dock entry.

### `appendTo`

By default, the plugin installs the Vue DevTools client through Vite's HTML transform. For projects
without a Vite-managed HTML entry, set `appendTo` to one or more browser entry module matchers. A
string matches the end of the resolved module path, while a regular expression tests the complete
resolved path.

```ts
VueDevTools({
  appendTo: ['resources/js/app.ts', /\/entry\.client\.m?js$/],
})
```

Only matching client modules are modified. SSR transforms are skipped, and the same module is never
injected more than once.

:::info Changed in v9
Component inspection is now integrated into the Vue DevTools dock. Open-in-editor requests are
handled by `@vitejs/devtools`, including workspace path validation, editor launching, and
diagnostics. See the [v8 to v9 migration guide](/guide/migration#migrating-from-v8-to-v9).
:::
