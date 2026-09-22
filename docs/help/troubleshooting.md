# Troubleshooting

## Vue DevTools doesn't render correctly with the Vite plugin

Starting with Vue DevTools v9, the Vite plugin only supports Vite 8.3.0+.
If you are using v9, also check that `@vitejs/devtools` is installed in your project and
`devtools: { apply: 'serve' }` is set in your Vite config.

If Vue DevTools looks like this and you are using `vite-plugin-html`, register
`vite-plugin-vue-devtools` before `vite-plugin-html`:

![issue image](/screenshots/nested-issue.png)

```ts [vite.config.ts]
import { defineConfig } from 'vite'
import { createHtmlPlugin } from 'vite-plugin-html'
import vueDevTools from 'vite-plugin-vue-devtools'

export default defineConfig({
  devtools: {
    apply: 'serve',
  },
  plugins: [
    // register vueDevTools before createHtmlPlugin
    vueDevTools(),
    createHtmlPlugin({}),
  ],
})
```
