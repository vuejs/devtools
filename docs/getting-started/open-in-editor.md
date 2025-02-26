# Open component in editor

When you select a component, you have the option to open the corresponding source file in your code editor.

## Used in devtools vite plugin

Vite plugin supports this feature out-of-the-box.

The feature is based on the [vite-plugin-vue-inspector](https://github.com/webfansplz/vite-plugin-vue-inspector) plugin and requires configuration, which you can do by looking at the [configuration documentation](https://github.com/webfansplz/vite-plugin-vue-inspector?tab=readme-ov-file#--configuration-ide--editor).

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

## Used in devtools browser extension

### Vite & Nuxt & Quasar CLI

Vite & Nuxt & Quasar CLI supports this feature out-of-the-box. Make sure to be in debug mode.

### Webpack

In your Vue project, install the [launch-editor-middleware](https://github.com/yyx990803/launch-editor#middleware) package and modify your webpack configuration:

1. Import the package:

```ts
const openInEditor = require('launch-editor-middleware')
```

2. In the `devServer` option, register the `/__open-in-editor` HTTP route:

```js
devServer: {
  before: (app) => {
    app.use('/__open-in-editor', openInEditor())
  }
}
```

3. The editor to launch is guessed. You can also specify the editor app with the editor option. See the [supported editors list.](https://github.com/yyx990803/launch-editor?tab=readme-ov-file#supported-editors)

```js
openInEditor('code')
```

4. You can now click on the name of the component in the Component inspector pane (if the devtools knows about its file source, a tooltip will appear).

### Node.js

You can use the [launch-editor](https://github.com/yyx990803/launch-editor) package to setup an HTTP route with the `/__open-in-editor` path. It will receive file as an URL variable.

### Customize request

You can change the request host (default `/`) with the following code in your frontend app, e.g.

```ts
if (process.env.NODE_ENV !== 'production') {
  window.VUE_DEVTOOLS_CONFIG = {
    openInEditorHost: 'http://localhost:3000/'
  }
}
```
