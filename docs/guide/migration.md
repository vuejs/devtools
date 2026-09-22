# Migration Guide

## Migrating from v8 to v9

:::warning v9 distribution
The standalone app, Electron hosts, and Firefox extension remain on v8 and are not included in v9.
:::

Vue DevTools v9 keeps the v6-style plugin setup API for its supported custom inspectors, component
hooks, timeline layers and plugin settings. The following Vue-level navigation and command APIs
have been removed:

| v8 API                | v9 replacement                                                                                                                                                                           |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `addCustomTab`        | Register an `iframe`, `custom-render`, `json-render`, or another dock entry with `ctx.docks.register()`. See the [Dock System documentation](https://devtools.vite.dev/kit/dock-system). |
| `addCustomCommand`    | Register a command with `ctx.commands.register()`. See the [Commands & Command Palette documentation](https://devtools.vite.dev/kit/commands).                                           |
| `removeCustomCommand` | Keep the handle returned by `ctx.commands.register()` and call `handle.unregister()`. See the [Command Handle documentation](https://devtools.vite.dev/kit/commands#command-handle).     |

The replacements are part of the Devframe-based Vite DevTools Kit integration surface. See the
[Devframe Hub documentation](https://devfra.me/guide/hub) for the framework-neutral foundation.

### Vite plugin

Vue DevTools v9 requires Vite 8.3.0+. The Vite plugin options now describe the Vue integration
and its Vite DevTools dock directly:

- `componentInspector` has been removed. Component inspection is built into the Vue DevTools dock
  and is no longer configured as a separate plugin option.
- `launchEditor` has been removed. Source-file requests are forwarded to `@vitejs/devtools` through
  `vite:core:open-in-editor`. Set `LAUNCH_EDITOR` when you start Vite to choose an editor, or leave
  it unset and let Vite DevTools pick a running editor. See
  [Open component in editor](/getting-started/open-in-editor).
- The deprecated `openInEditorHost` and `clientHost` options remain removed.
- Install `@vitejs/devtools` in your project and set `devtools: true` in your Vite config,
  alongside `plugins: [vueDevTools()]`. Remove any explicit `DevTools()` plugin registration.
  Vue DevTools no longer starts or brands the shared DevTools host automatically.
- Move `builtinViteDevTools` to `devtools.builtinDevTools`, and move `embeddedVisibility` and
  `dockPreferences` to the corresponding fields under `devtools`. The plugin no longer exports
  `VueDevToolsDockPreferences`; use Vite's `devtools` configuration types instead.
- Use `enabled` and `appendTo` to configure the Vue integration. `appendTo` also accepts
  an array of strings and regular expressions.

See the [Vite Plugin guide](/guide/vite-plugin) for the current option reference.

## Migrating from v6 to v7

:::tip Compatibility Note
Vue DevTools v7 supports Vue 3 only. For Vue 2 applications, install the [v6 extension](https://chromewebstore.google.com/detail/vuejs-devtools/iaajmlceplecbljialhhkmedjlpdblhp). The legacy [v5 extension](https://chromewebstore.google.com/detail/vuejs-devtools-v5/hkddcnbhifppgmfgflgaelippbigjpjo) is also available.
:::

### Feature Improvements

In v7, we've made some feature-level adjustments compared to v6. You can view the v7 feature overview in the [Features](/getting-started/features). Here, we mainly mention some of the main feature changes.

#### Feature Adjustments

- Plugin Timeline Tab

In v7, we moved the plugin timeline tab to be managed within each plugin's menu. Here is a screenshot of the pinia devtools plugin:

![pinia-timeline](/features/pinia-timeline.png)

### Plugin API

The v7 plugin API is compatible with v6, except for its types. You can check out the [v6 Plugin API documentation](https://devtools-v6.vuejs.org/plugin/api-reference.html) here.

Additionally, we have introduced some new plugin APIs. You can find more details [here](/plugins/api).
