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
  devtools: {
    apply: 'serve',
  },
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

In v9, set `devtools: { apply: 'serve' }` to enable the Vite DevTools host during development.
Earlier versions start Vue DevTools through `vueDevTools()` alone and do not require this option.

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

Vue DevTools' runtime integration runs only during development, so `apply: 'serve'` is the
recommended default. Use `devtools: true` only when you also want the Vite DevTools host during
builds.
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

## Agent tools

Vue DevTools provides read-only runtime tools to coding agents through the Vite DevTools MCP host. This integration requires `@vitejs/devtools` 0.7.6 or later:

```ts
import { defineConfig } from 'vite'
import vueDevTools from 'vite-plugin-vue-devtools'

export default defineConfig({
  devtools: { apply: 'serve' },
  plugins: [vueDevTools()],
})
```

Open the application and allow its Vite DevTools connection. Agents can inspect Vue apps, component trees and state, render code, plugin inspectors such as Pinia, registered plugins, routes, and encoded values. The Vue panel can stay closed. The host exposes MCP automatically when Agent capabilities and the MCP implementation are available. Set `devtools.mcp` to `true` to explicitly enable it or `false` to disable it. A host exposing MCP makes application state available to connected agents.

Register the Vue DevTools connector once in your coding agent's global MCP configuration:

```json
{
  "mcpServers": {
    "vue-devtools": {
      "command": "npx",
      "args": ["-y", "@vue/devtools-agentic", "connect"]
    }
  }
}
```

The configuration location depends on your agent client. Call `devframe_connect_list-instances` to discover running projects and their tools, then use `devframe_connect_call-tool` with the selected port, tool name and arguments. Match the project's `rootDir` first and use a page's `list-apps` tool to identify its URL and app IDs. `page.url` follows the document location after client-side navigations; use the router tool for the Vue route. Tools accepting an options object advertise it under `arg0`.

The connector sends no bearer token unless `DEVFRAME_MCP_AUTH_TOKEN` is set. The default host route trusts a same-machine caller, so leave it unset unless `devtools.mcp` is configured with a bearer token. To probe a port that is not already in the Devframe instance registry, run the connector with `--base /__devtools/` so the probe finds Vite's `__connection.json`.

Each page has a unique document namespace. Reloading invalidates that namespace, component IDs and value handles; discover tools again before continuing. State snapshots include the page identity and capture time, and can contain partial sections that require follow-up reads. A component-tree filter matches component name or source file. Reading the tree again drops open child cursors.

The tool module loads when the host connection metadata advertises MCP. Its runtime connection opens on the first query and stays open until that page's registration is disposed. Discovery alone does not connect. Value handles expire on reload and when the registration is disposed.

The integration applies during development. Vite DevTools owns the MCP endpoint, instance discovery and authentication; an explicit host `mcp: false` disables MCP access. See [Devframe MCP](https://devfra.me/adapters/mcp) for host configuration. The Chromium extension provides its own DevTools panel; the MCP integration described here uses the Vite host.
