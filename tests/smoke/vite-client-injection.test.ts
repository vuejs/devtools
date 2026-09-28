import type { Browser } from 'playwright'
import type { ViteDevServer } from 'vite'
import vue from '@vitejs/plugin-vue'
import { chromium } from 'playwright'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createServer as createHttpServer, type Server as HttpServer } from 'node:http'
import { dirname, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer } from 'vite'
import { vueDevtools } from '../../packages/vite/src'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const fixtureRoot = resolve(repositoryRoot, 'tests/fixtures/vite-smoke')

interface ViteMatrixScenario {
  base?: string
  bundledDev?: boolean
  middlewareMode?: boolean
  name: string
  optionsApi?: boolean
}

const scenarios: ViteMatrixScenario[] = [
  { name: 'latest Vite 8 SPA' },
  { bundledDev: true, name: 'Vite 8 bundled dev' },
  { name: 'Vite 8 without Options API', optionsApi: false },
  { base: '/nested/', name: 'Vite 8 custom root and base' },
  {
    middlewareMode: true,
    name: 'Vite 8 SSR middleware mode',
  },
]

describe('Vite client injection', () => {
  let browser: Browser | undefined

  beforeAll(async () => {
    browser = await chromium.launch({
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      headless: true,
    })
  })

  afterAll(async () => {
    await browser?.close()
  })

  for (const scenario of scenarios) {
    it(`${scenario.name}: loads the client${scenario.name === 'latest Vite 8 SPA' ? ' and edits Pinia state through the panel' : ''}`, async () => {
      if (!browser) throw new Error('Playwright browser did not start')

      const failedVirtualModuleRequests: string[] = []
      const runtimeErrors: string[] = []
      const pageErrors: string[] = []
      let server: ViteDevServer | undefined
      let middlewareServer: HttpServer | undefined
      const page = await browser.newPage()
      const cacheDir = await mkdtemp(resolve(tmpdir(), 'vue-devtools-vite-smoke-'))

      try {
        if (scenario.middlewareMode) middlewareServer = createMiddlewareServer(() => server)

        server = await createServer({
          appType: scenario.middlewareMode ? 'custom' : 'spa',
          base: scenario.base,
          configFile: false,
          cacheDir,
          define: {
            'process.env.NODE_ENV': JSON.stringify('development'),
            ...(scenario.optionsApi === false
              ? {
                  __VUE_OPTIONS_API__: 'false',
                }
              : {}),
          },
          root: fixtureRoot,
          logLevel: 'silent',
          devtools: true,
          plugins: [vue(), vueDevtools()],
          optimizeDeps: {
            exclude: ['@vue/devtools-api', 'pinia'],
          },
          resolve: {
            alias: {
              '@vue/devtools-api': resolve(repositoryRoot, 'packages/devtools-api/src/index.ts'),
            },
          },
          server: {
            host: '127.0.0.1',
            hmr: middlewareServer ? { server: middlewareServer } : undefined,
            middlewareMode: scenario.middlewareMode,
            port: scenario.middlewareMode ? undefined : 0,
          },
          experimental: {
            bundledDev: scenario.bundledDev,
          },
        })
        if (middlewareServer) await listen(middlewareServer)
        else await server.listen()

        const address = (middlewareServer ?? server.httpServer)?.address()
        if (!address || typeof address === 'string')
          throw new Error('Vite test server did not expose a TCP address')

        page.on('response', (response) => {
          if (response.status() >= 400 && response.url().includes('virtual:vue-devtools-client')) {
            failedVirtualModuleRequests.push(`${response.status()} ${response.url()}`)
          }
        })
        page.on('pageerror', (error) => {
          runtimeErrors.push(error.message)
          pageErrors.push(error.message)
        })
        page.on('console', (message) => {
          if (message.type() === 'error') runtimeErrors.push(message.text())
        })

        const origin = `http://127.0.0.1:${address.port}`
        const appUrl = `${origin}${scenario.base ?? '/'}`
        await page.goto(appUrl, {
          waitUntil: 'networkidle',
        })
        await expect
          .poll(() => page.locator('#app[data-v-app]').count(), {
            timeout: 10_000,
            message: `Test app did not mount. Runtime errors: ${runtimeErrors.join('; ') || 'none'}`,
          })
          .toBe(1)
        try {
          await expect
            .poll(
              () =>
                page.evaluate(
                  () =>
                    (
                      globalThis as typeof globalThis & {
                        __VUE_DEVTOOLS_VITE_PLUGIN_DETECTED__?: boolean
                      }
                    ).__VUE_DEVTOOLS_VITE_PLUGIN_DETECTED__,
                ),
              { timeout: 25_000 },
            )
            .toBe(true)
        } catch (error) {
          throw new Error(
            `Vue DevTools client did not load. Runtime errors: ${runtimeErrors.join('; ') || 'none'}`,
            { cause: error },
          )
        }

        expect(failedVirtualModuleRequests).toEqual([])
        const dockClientScriptLoaded = await page.evaluate<boolean>(`(async () => {
          const importsModule = await import('/__devtools/__client-imports.js')
          const loadDockClientScript = importsModule.clientImports['vue-devtools']?.[0]
          if (!loadDockClientScript) return false
          const clientModule = await loadDockClientScript()
          return typeof clientModule.default === 'function'
        })()`)
        expect(dockClientScriptLoaded).toBe(true)
        expect(
          runtimeErrors.filter(
            (message) =>
              message.includes('vue-devtools-client') ||
              message.includes('Error executing client script'),
          ),
        ).toEqual([])

        if (scenario.name === 'latest Vite 8 SPA') {
          // Exercise the built client over its real iframe transport, not just the runtime API.
          await page.evaluate((src) => {
            const frame = document.createElement('iframe')
            frame.id = 'regression-panel'
            frame.src = src
            frame.style.cssText =
              'position:fixed;inset:0;width:100vw;height:100vh;z-index:2147483647;background:white'
            document.body.appendChild(frame)
          }, `${origin}/__devtools__/`)
          const panel = page.frameLocator('#regression-panel')
          await expect
            .poll(() => panel.locator('[data-v-app]').count(), { timeout: 20_000 })
            .toBeGreaterThan(0)
          await expect
            .poll(() => panel.getByRole('treeitem').count(), { timeout: 10_000 })
            .toBeGreaterThan(0)
          await panel.getByRole('link', { name: 'Pinia', exact: true }).click()
          await panel.getByRole('treeitem').filter({ hasText: 'counter' }).click()
          await expect
            .poll(() => panel.locator('.state-key').allTextContents(), { timeout: 5_000 })
            .toContain('count')
          const stateRow = (key: string) =>
            panel
              .locator('[class~="group/state-row"]')
              .filter({
                has: panel.locator('.state-key').filter({ hasText: new RegExp(`^${key}$`) }),
              })
              .first()
          const countRow = stateRow('count')
          await countRow.hover()
          await countRow.getByRole('button', { name: 'Edit state value', exact: true }).click()
          await countRow.getByRole('textbox').fill('42')
          await countRow.getByRole('textbox').press('Enter')
          await expect.poll(() => page.locator('#count').textContent()).toBe('42')
          await expect.poll(() => countRow.innerText()).toContain('42')
        }

        expect(pageErrors).toEqual([])

        const vueClientResponse = await fetch(`${origin}${scenario.base ?? '/'}__devtools__/`)
        expect(vueClientResponse.headers.get('content-type')).toContain('text/html')
        expect(await vueClientResponse.text()).toContain('<title>Vue DevTools</title>')
      } finally {
        await page.close()
        await server?.close()
        await close(middlewareServer)
        await rm(cacheDir, { recursive: true, force: true })
      }
    })
  }
})

function createMiddlewareServer(getViteServer: () => ViteDevServer | undefined): HttpServer {
  return createHttpServer((request, response) => {
    const server = getViteServer()
    if (!server) {
      response.statusCode = 503
      response.end('Vite server is starting')
      return
    }

    server.middlewares(request, response, async () => {
      try {
        const template = await readFile(resolve(fixtureRoot, 'index.html'), 'utf8')
        const html = await server.transformIndexHtml(request.url ?? '/', template)
        response.statusCode = 200
        response.setHeader('content-type', 'text/html; charset=utf-8')
        response.end(html)
      } catch (error) {
        response.statusCode = 500
        response.end(error instanceof Error ? error.message : String(error))
      }
    })
  })
}

function listen(server: HttpServer): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolve()
    })
  })
}

function close(server: HttpServer | undefined): Promise<void> {
  if (!server?.listening) return Promise.resolve()
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
}
