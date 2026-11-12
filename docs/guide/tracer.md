# Element source tracing

Trace a Vue template element to its source file, line, and column with `@vue/devtools-tracer`.

## With Vue DevTools

The Vite plugin enables development tracing by default. Picking an element in Vue DevTools lets
its component source action open the template location. Configure tracing with the `tracer`
option; an options object is passed to the same factory used by the standalone plugin.

```ts
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import vueDevTools from 'vite-plugin-vue-devtools'

export default defineConfig({
  devtools: { apply: 'serve' },
  plugins: [
    vue(),
    vueDevTools({
      tracer: {
        onPick: 'open-in-editor',
      },
    }),
  ],
})
```

Install `@vitejs/devtools` alongside `vite-plugin-vue-devtools` and Vite 8.3.0 or later.
With the Vite DevTools host enabled, the **Inspect Vue component** picker and `Mod+Shift+X`
shortcut register by default. Leaving `tracer` unset, or setting it to `true`, enables development
instrumentation and the picker with the default options.
By default, the picker calls the Vite host's `vite:core:open-in-editor` RPC directly, while
`capabilities.openInEditor` controls editor actions only in the Vue DevTools panel.

Use `vueDevTools({ tracer: false })` to disable tracing and its picker while keeping component selection and
other Vue DevTools features. Source actions then fall back to the component's file.

## Standalone plugin

Install `@vue/devtools-tracer` as a development dependency. Use `VueTracer()` directly when you
want tracing without the Vue DevTools panel:

```ts
import vue from '@vitejs/plugin-vue'
import VueTracer from '@vue/devtools-tracer'
import { defineConfig } from 'vite'

export default defineConfig({
  devtools: { apply: 'serve' },
  plugins: [vue(), VueTracer()],
})
```

The picker uses a project-level `@vitejs/devtools` host. Dock layout and editor launching belong
to [Vite DevTools](https://devtools.vite.dev/guide/). `VueTracer()` records source positions during
development and registers the picker with that host. `VueTracer({ enabled: false })` disables
the standalone plugin, including its picker. When enabled, `VueTracer()` returns an array of
plugins: a pre-compilation Vapor transform and the post-compilation VNode transform with the
picker integration. Vite accepts this array directly in `plugins`, as in the example above.

The Chromium extension provides its own Vue DevTools panel. It does not install the Vite
transform or expose the host's open-in-editor action; template instrumentation is configured
through the Vite plugin paths above.

## Options

Both integration paths accept `VueTracerOptions`:

| Option                   | Values                       | Default            | Behavior                                                                                                                                |
| ------------------------ | ---------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `enabled`                | `boolean`                    | `true`             | Enables tracing during Vite development (`serve`). `false` disables the tracer plugin.                                                  |
| `resolveRecordEntryPath` | `boolean`                    | `true`             | Resolves the injected runtime import to a relative filesystem path. `false` emits the bare `@vue/devtools-tracer/client/record` import. |
| `onPick`                 | `'open-in-editor' \| 'none'` | `'open-in-editor'` | Opens the picked location in the editor, or ends picking while leaving handling to public `click` listeners.                            |

Tracing and its picker run only during Vite development. Builds do not inject source attributes,
VNode records, or tracer runtime imports.

> [!WARNING]
> With `resolveRecordEntryPath: false`, the application must resolve the bare runtime import.
> Under pnpm's strict dependency layout, add `@vue/devtools-tracer` directly to the application's
> development dependencies, including when using `vueDevTools({ tracer: { resolveRecordEntryPath: false } })`.

## Client APIs

`@vue/devtools-tracer` is ported from [vite-plugin-vue-tracer](https://github.com/antfu/vite-plugin-vue-tracer) by [Anthony Fu](https://github.com/antfu).

The `record` entry exposes `hasData`, `findTraceFromElement`, `findTraceFromVNode`,
`findTraceAtPointer`, and `ElementTraceInfo`. Positions use one-based lines and zero-based columns.
The editor action converts columns to one-based values.

The `listeners` entry adds `events`, `isEnabled`, and `lastMatchedElement`. Subscribe with
`events.on('hover', callback)` or `events.on('click', callback)`; the returned function removes the
subscription. It also emits `enabled` and `disabled`. The `overlay` entry re-exports these APIs and
provides reactive `state`, including `isEnabled`, `isVisible`, `isAnimated`, `isFocused`, `main`,
`mainRect`, and `sub.rects` for elements at the same source position.

```ts
if (import.meta.hot) {
  const { events, state } = await import('@vue/devtools-tracer/client/overlay')
  const unsubscribe = events.on('click', (info) => {
    console.log(info.pos)
    state.isEnabled = false
  })
  state.isEnabled = true
  import.meta.hot.dispose(() => {
    unsubscribe()
    state.isEnabled = false
  })
}
```

## Supported templates

For standard Vue SFCs, tracing wraps VNode creation in compiled `_sfc_render` functions. This
path runs in the client environment and skips server-side rendering. JSX and handwritten render
functions are not supported.

Vapor components marked with `<script vapor>` (including `<script setup vapor>`) or
`<template vapor>`, or selected by `@vitejs/plugin-vue`'s `features.vapor`, use a pre-compilation
transform. Native DOM elements receive `data-v-source="path:line:column"`, with a workspace-relative
path, one-based line, and zero-based column. Attribute values are HTML-escaped. Component tags,
`template`, `slot`, and custom elements receive no attribute. The same attributes are injected
for SSR and client compilation.

Vapor tracing supports HTML templates inside `.vue` files. External `template src` and templates
with a non-HTML `lang` are skipped, leaving component-level source lookup as the fallback.
Style-only edits and changes to whitespace or comments can leave line numbers temporarily stale;
refresh the page to update them.
