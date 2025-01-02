# Vite Plugin

> We provide a Vite plugin for running Vue DevTools. If your project uses Vite, we highly recommend using it as the preferred option for running DevTools, as it offers more powerful features.

:::tip Compatibility Note
Vue DevTools requires **Vite v3.1 or higher**.
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

## Usage

```ts
//  Configuration Vite

import { defineConfig } from 'vite'
import vueDevTools from 'vite-plugin-vue-devtools'

export default defineConfig({
  plugins: [
    vueDevTools(),
  ],
})
```

## Options

```ts
interface VitePluginVueDevToolsOptions {
  /**
   * append an import to the module id ending with `appendTo` instead of adding a script into body
   * useful for projects that do not use html file as an entry
   *
   * WARNING: only set this if you know exactly what it does.
   * @default ''
   */
  appendTo?: string | RegExp

  /**
   * Enable vue component inspector
   *
   * @default true
   */
  componentInspector?: boolean | VitePluginInspectorOptions

  /**
   * Target editor when open in editor (v7.2.0+)
   *
   * @default It will be predicted (fork from https://github.com/yyx990803/launch-editor/blob/master/packages/launch-editor/guess.js) based on the IDEs you've launched, and the backup is 'code' (Visual Studio Code)
   */
  launchEditor?: 'appcode' | 'atom' | 'atom-beta' | 'brackets' | 'clion' | 'code' | 'code-insiders' | 'codium' | 'emacs' | 'idea' | 'notepad++' | 'pycharm' | 'phpstorm' | 'rubymine' | 'sublime' | 'vim' | 'visualstudio' | 'webstorm' | 'rider' | string
}
```
