import type { Browser } from 'playwright'
import type { ViteDevServer } from 'vite'
import { chromium } from 'playwright'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer } from 'vite'
import vue from '@vitejs/plugin-vue'
import { createRequire } from 'node:module'
import unoConfig from '../../packages/client/uno.config'

const clientRequire = createRequire(new URL('../../packages/client/package.json', import.meta.url))
const { default: UnoCSS } = await import(clientRequire.resolve('unocss/vite'))

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

describe('StateEntryRow keyboard accessibility', () => {
  let browser: Browser | undefined
  let server: ViteDevServer | undefined

  beforeAll(async () => {
    server = await createServer({
      configFile: false,
      root: resolve(root, 'tests/fixtures/state-entry-row'),
      plugins: [vue(), UnoCSS(unoConfig)],
      resolve: {
        alias: [
          {
            find: '@vue/devtools-kit/client',
            replacement: resolve(root, 'packages/kit/src/client.ts'),
          },
          { find: '@vue/devtools-kit', replacement: resolve(root, 'packages/kit/src/index.ts') },
        ],
      },
      server: { host: '127.0.0.1', port: 0 },
    })
    await server.listen()
    browser = await chromium.launch({
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      headless: true,
    })
  })

  afterAll(async () => {
    await browser?.close()
    await server?.close()
  })

  it.each(['light', 'dark'])(
    'toggles with the keyboard in the %s theme without activating ancestor rows',
    async (theme) => {
      const page = await browser!.newPage({ permissions: ['clipboard-read', 'clipboard-write'] })
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      try {
        await page.goto(server!.resolvedUrls!.local[0]!)
        const parent = page.getByRole('button', { name: 'Toggle payload', exact: true })
        await parent.waitFor({ timeout: 5000 })
        await page
          .locator('html')
          .evaluate((node, theme) => node.classList.toggle('dark', theme === 'dark'), theme)
        await page.keyboard.press('Tab')
        expect(await parent.evaluate((node) => document.activeElement === node)).toBe(true)
        expect(await parent.getAttribute('aria-expanded')).toBe('false')
        expect(await parent.evaluate((node) => getComputedStyle(node).outlineStyle)).not.toBe(
          'none',
        )

        await page.keyboard.press('Enter')
        const child = page.getByRole('button', { name: 'Toggle nested', exact: true })
        await child.waitFor()
        expect(await parent.getAttribute('aria-expanded')).toBe('true')
        await page.keyboard.press('Space')
        expect(await parent.getAttribute('aria-expanded')).toBe('false')
        expect(await child.count()).toBe(0)
        await page.keyboard.press('Space')
        await child.waitFor()
        expect(await parent.getAttribute('aria-expanded')).toBe('true')

        await page.keyboard.press('Tab')
        expect(
          await page
            .getByRole('button', { name: 'Add child state value' })
            .first()
            .evaluate((node) => document.activeElement === node),
        ).toBe(true)
        // Parent actions are siblings of its toggle and remain reachable and visible.
        const copyPath = page.getByRole('button', { name: 'Copy state path', exact: true }).first()
        await copyPath.focus()
        expect(
          await copyPath.evaluate((node) => getComputedStyle(node.parentElement!).opacity),
        ).toBe('1')
        await page.keyboard.press('Enter')
        expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('data.payload')
        expect(await parent.getAttribute('aria-expanded')).toBe('true')

        await child.focus()
        await page.keyboard.press('Enter')
        expect(await child.getAttribute('aria-expanded')).toBe('true')
        expect(await parent.getAttribute('aria-expanded')).toBe('true')
        const edit = page.getByRole('button', { name: 'Edit state value', exact: true })
        await edit.focus()
        await page.keyboard.press('Space')
        await page.getByRole('textbox').waitFor()
        expect(
          await page.locator('button button, button input, [role="button"] button').count(),
        ).toBe(0)
        await page.getByRole('button', { name: 'Cancel state value edit' }).focus()
        await page.keyboard.press('Enter')
        expect(await page.getByRole('textbox').count()).toBe(0)
        expect(await parent.getAttribute('aria-expanded')).toBe('true')
        expect(await child.getAttribute('aria-expanded')).toBe('true')
        await child.focus()
        await page.keyboard.press('Space')
        expect(await child.getAttribute('aria-expanded')).toBe('false')
        expect(await parent.getAttribute('aria-expanded')).toBe('true')
        expect(errors).toEqual([])
      } finally {
        await page.close()
      }
    },
  )
})
