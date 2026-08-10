import path from 'node:path'
import { normalizePath } from 'vite'

/**
 * `@vitejs/plugin-vue` attaches `__file` to every SFC during serve so that
 * devtools can resolve a component's source path — it powers the "Open in
 * Editor" button, which is gated on `instance.type.__file`.
 *
 * `@vitejs/plugin-vue-jsx` has no equivalent: it only emits `__hmrId`, which is
 * a hash with no path in it. JSX/TSX components therefore have no `__file` and
 * the button never renders for them.
 *
 * Until that is fixed upstream (vitejs/vite-plugin-vue#784), attach `__file`
 * ourselves. Two cases are covered:
 *
 *  1. `defineComponent` components, which `plugin-vue-jsx` has already tagged
 *     with `__hmrId` — we stamp the same local binding.
 *  2. Plain function/arrow components, which get no `__hmrId` at all. Those are
 *     matched by the usual convention of naming the component after its file.
 *
 * Returns `undefined` when nothing was injected, so the caller can skip the
 * transform entirely.
 */
export function injectJsxFile(code: string, id: string): string | undefined {
  const filename = id.split('?')[0]
  if (!/\.[jt]sx$/.test(filename))
    return

  // Normalise before deriving the basename so separators are handled the same
  // way regardless of which OS the dev server runs on.
  const normalized = normalizePath(filename)
  const fileJson = JSON.stringify(normalized)
  let transformed = code

  // Case 1: piggyback on the `__hmrId` assignments plugin-vue-jsx emits.
  transformed = transformed.replace(
    /\b(\w+)\.__hmrId\s*=/g,
    (match, localName) => `${localName}.__file = ${fileJson}\n${match}`,
  )

  // Case 2: plain function/arrow components. Only stamp a binding this module
  // declares itself — stamping an imported one would attribute another
  // module's component to this file.
  const componentName = path.posix.basename(normalized, path.posix.extname(normalized))
  if (
    componentName
    && /^[A-Z][\w$]*$/.test(componentName)
    && !transformed.includes(`${componentName}.__file`)
    && declaresBinding(transformed, componentName)
  ) {
    // A local `const Foo = 'not a component'` would throw on property
    // assignment under ESM strict mode, so narrow to objects and functions.
    transformed
      += `\nif (typeof ${componentName} === "function" || (typeof ${componentName} === "object" && ${componentName} !== null))`
        + ` ${componentName}.__file = ${fileJson}`
  }

  return transformed === code ? undefined : transformed
}

function declaresBinding(code: string, name: string) {
  return new RegExp(
    `(?:^|[\\s;{}(,])(?:async\\s+)?(?:function|const|let|var|class)\\s+${name}\\b`,
  ).test(code)
}
