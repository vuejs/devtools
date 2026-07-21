import { target } from '@vue/devtools-shared'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { openInEditor, setOpenInEditorBaseUrl } from '../../src/core/open-in-editor'
import { devtoolsState } from '../../src/ctx/state'

describe('openInEditor', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    delete target.__VUE_INSPECTOR__
    delete target.__VUE_DEVTOOLS_OPEN_IN_EDITOR_BASE_URL__
    devtoolsState.vitePluginDetected = true
  })

  it('uses the inspector global when it is available', () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response())
    const openInEditorMock = vi.fn()

    target.__VUE_INSPECTOR__ = {
      openInEditor: openInEditorMock,
    }

    openInEditor({
      baseUrl: 'http://localhost:5173',
      file: '/project/src/App.vue',
      line: 12,
      column: 3,
    })

    expect(openInEditorMock).toHaveBeenCalledWith('http://localhost:5173', '/project/src/App.vue', 12, 3)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('falls back to the Vite open-in-editor endpoint when the inspector global is missing', () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response())
    setOpenInEditorBaseUrl('http://localhost:5173')

    openInEditor({
      file: '/project/src/App.vue',
      line: 12,
      column: 3,
    })

    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:5173/__open-in-editor?file=%2Fproject%2Fsrc%2FApp.vue%3A12%3A3',
      { mode: 'no-cors' },
    )
  })
})
