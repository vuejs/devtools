import type { BuiltinLanguage, HighlighterCore } from 'shiki'
import { getHighlighterCore } from 'shiki/core'
import getWasm from 'shiki/wasm'
import { shallowRef } from 'vue'

export const shiki = shallowRef<HighlighterCore>()

let promise: Promise<any> | null = null

export function renderCodeHighlight(code: string, lang: BuiltinLanguage | 'text' = 'text') {
  if (!promise && !shiki.value) {
    // Only loading when needed
    promise = getHighlighterCore({
      themes: [
        import('shiki/themes/vitesse-dark.mjs'),
        import('shiki/themes/vitesse-light.mjs'),
      ],
      langs: [
        import('shiki/langs/json.mjs'),
        import('shiki/langs/yaml.mjs'),
        import('shiki/langs/css.mjs'),
        import('shiki/langs/javascript.mjs'),
        import('shiki/langs/typescript.mjs'),
        import('shiki/langs/vue.mjs'),
        import('shiki/langs/vue-html.mjs'),
        import('shiki/langs/html.mjs'),
        import('shiki/langs/diff.mjs'),
        import('shiki/langs/shellscript.mjs'),
      ],
      loadWasm: getWasm,
    }).then((i) => {
      shiki.value = i
    })
  }

  const supported = shiki.value?.getLoadedLanguages().includes(lang)
  if (!supported) {
    return {
      code,
      supported,
    }
  }

  return {
    code: shiki.value!.codeToHtml(code, {
      lang,
      themes: {
        dark: 'vitesse-dark',
        light: 'vitesse-light',
      },
    }),
    supported: true,
  }
}
