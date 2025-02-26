# Trouble Shooting

## DevTools (vite plugin) doesn't render as expected

If you see devtools render as follows:

![issue image](/screenshots/nested-issue.png)

And you are using `vite-plugin-html`, please make sure register `vite-plugin-vue-devtools` before `vite-plugin-html`.

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import { createHtmlPlugin } from 'vite-plugin-html'
import vueDevTools from 'vite-plugin-vue-devtools'

export default defineConfig({
  plugins: [
    // register vueDevTools before createHtmlPlugin
    vueDevTools(),
    createHtmlPlugin({})
  ]
})
```
