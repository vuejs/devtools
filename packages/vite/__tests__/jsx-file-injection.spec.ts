import { describe, expect, it } from 'vitest'
import { injectJsxFile } from '../src/jsx-file-injection'

const FILE = '/project/src/components/MyButton.tsx'

describe('injectJsxFile', () => {
  it('ignores files that are not jsx/tsx', () => {
    expect(injectJsxFile('export const a = 1', '/project/src/a.ts')).toBeUndefined()
    expect(injectJsxFile('export const a = 1', '/project/src/App.vue')).toBeUndefined()
  })

  it('returns undefined when there is nothing to stamp', () => {
    expect(injectJsxFile('export const answer = 42', FILE)).toBeUndefined()
  })

  it('stamps __file on bindings plugin-vue-jsx tagged with __hmrId', () => {
    const code = [
      'const __default__ = defineComponent({})',
      'export default __default__',
      '__default__.__hmrId = "61c61d33"',
      '__VUE_HMR_RUNTIME__.createRecord("61c61d33", __default__)',
    ].join('\n')

    const out = injectJsxFile(code, FILE)!

    expect(out).toContain(`__default__.__file = "${FILE}"`)
    // must land before the __hmrId assignment it piggybacks on
    expect(out.indexOf('__default__.__file')).toBeLessThan(out.indexOf('__default__.__hmrId'))
  })

  it('stamps every tagged binding in a multi-component module', () => {
    const code = [
      'Alpha.__hmrId = "aaa"',
      'Beta.__hmrId = "bbb"',
    ].join('\n')

    const out = injectJsxFile(code, FILE)!

    expect(out).toContain(`Alpha.__file = "${FILE}"`)
    expect(out).toContain(`Beta.__file = "${FILE}"`)
  })

  it('stamps a plain function component named after its file', () => {
    const out = injectJsxFile('export function MyButton(props) { return null }', FILE)!

    expect(out).toContain(`MyButton.__file = "${FILE}"`)
    // guarded so a non-component binding cannot throw under ESM strict mode
    expect(out).toContain('typeof MyButton === "function"')
  })

  it('stamps a plain const arrow component named after its file', () => {
    const out = injectJsxFile('const MyButton = () => null; export default MyButton', FILE)!
    expect(out).toContain(`MyButton.__file = "${FILE}"`)
  })

  it('does not stamp a binding this module only imports', () => {
    // MyButton.tsx re-exporting a MyButton defined elsewhere: stamping it would
    // attribute the other module's component to this file.
    const code = 'import MyButton from "../base/MyButton"\nexport default MyButton'
    expect(injectJsxFile(code, FILE)).toBeUndefined()
  })

  it('does not stamp twice when __file is already present', () => {
    const code = 'function MyButton() {}\nMyButton.__file = "/somewhere/else.tsx"'
    expect(injectJsxFile(code, FILE)).toBeUndefined()
  })

  it('ignores lowercase filenames, which are not component conventions', () => {
    const code = 'export function helpers() {}'
    expect(injectJsxFile(code, '/project/src/helpers.tsx')).toBeUndefined()
  })

  it('strips the query string from the module id', () => {
    const out = injectJsxFile('export function MyButton() {}', `${FILE}?v=abc123`)!
    expect(out).toContain(`MyButton.__file = "${FILE}"`)
  })
})
