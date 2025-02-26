// https://vitepress.dev/guide/custom-theme
import Theme from 'vitepress/theme'
import { h } from 'vue'
import 'uno.css'
import './style.css'

export default {
  extends: Theme,
  Layout: () => {
    return h(Theme.Layout, null, {})
  },
  enhanceApp({ app }: any) {
    //
  },
}
