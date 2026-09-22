# Plugins API

Plugins API for easier DevTools integrations.

:::tip Compatibility

Vue DevTools v9 continues to provide the v6-style plugin setup API for its supported custom
inspectors, component hooks, timeline layers and plugin settings.

:::

## Installation

::: code-group

```sh [npm]
npm add -D @vue/devtools-api
```

```sh [pnpm]
pnpm add -D @vue/devtools-api
```

```sh [yarn]
yarn add -D @vue/devtools-api
```

```sh [bun]
bun add -D @vue/devtools-api
```

:::

## `setupDevToolsPlugin`

Register a Vue DevTools plugin with its descriptor and setup callback:

```ts
import { setupDevToolsPlugin } from '@vue/devtools-api'

setupDevToolsPlugin(
  {
    id: 'example',
    label: 'Example',
    app,
  },
  (api) => {
    api.addInspector({
      id: 'example',
      label: 'Example',
    })
  },
)
```

The legacy `setupDevtoolsPlugin` spelling remains available as an alias.

## Connection lifecycle

Use `onDevToolsConnected` when the runtime is ready, or `onDevToolsClientConnected` when a
DevTools UI client is also attached:

```ts
import { onDevToolsClientConnected, onDevToolsConnected } from '@vue/devtools-api'

onDevToolsConnected(() => {
  console.log('devtools runtime connected')
})

onDevToolsClientConnected(() => {
  console.log('devtools client connected')
})
```

Importing `@vue/devtools-api` during SSR is safe. Its Node export intentionally performs no browser
work.

## APIs removed in v9

:::danger Breaking change

The following Vue-level APIs were available in Vue DevTools v8 but are deprecated and no longer
exported in Vue DevTools v9.

:::

| Removed API           | v9 replacement                                                                                                                                                                           |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `addCustomTab`        | Register an `iframe`, `custom-render`, `json-render`, or another dock entry with `ctx.docks.register()`. See the [Dock System documentation](https://devtools.vite.dev/kit/dock-system). |
| `addCustomCommand`    | Register a command with `ctx.commands.register()`. See the [Commands & Command Palette documentation](https://devtools.vite.dev/kit/commands).                                           |
| `removeCustomCommand` | Keep the handle returned by `ctx.commands.register()` and call `handle.unregister()`. See the [Command Handle documentation](https://devtools.vite.dev/kit/commands#command-handle).     |

These replacements live on the Devframe-based Vite DevTools Kit integration surface. For the
underlying framework-neutral dock and command registries, see the
[Devframe Hub documentation](https://devfra.me/guide/hub).
