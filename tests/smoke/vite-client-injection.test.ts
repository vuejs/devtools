import type { Browser } from 'playwright'
import type { ViteDevServer } from 'vite'
import vue from '@vitejs/plugin-vue'
import { chromium } from 'playwright'
import { readFile } from 'node:fs/promises'
import { createServer as createHttpServer, type Server as HttpServer } from 'node:http'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer } from 'vite'
import { vueDevtools } from '../../packages/vite/src'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const playgroundRoot = resolve(repositoryRoot, 'playground/basic')

interface ViteMatrixScenario {
  base?: string
  bundledDev?: boolean
  middlewareMode?: boolean
  name: string
  customDevtools?: boolean
  optionsApi?: boolean
}

const scenarios: ViteMatrixScenario[] = [
  { name: 'latest Vite 8 SPA' },
  { bundledDev: true, name: 'Vite 8 bundled dev' },
  { name: 'Vite 8 custom DevTools options', customDevtools: true },
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
    it(`loads the virtual client in ${scenario.name}`, async () => {
      if (!browser) throw new Error('Playwright browser did not start')

      const failedVirtualModuleRequests: string[] = []
      const runtimeErrors: string[] = []
      const pageErrors: string[] = []
      let server: ViteDevServer | undefined
      let middlewareServer: HttpServer | undefined
      const page = await browser.newPage()

      try {
        if (scenario.middlewareMode) middlewareServer = createMiddlewareServer(() => server)

        server = await createServer({
          appType: scenario.middlewareMode ? 'custom' : 'spa',
          base: scenario.base,
          configFile: false,
          define: {
            'process.env.NODE_ENV': JSON.stringify('development'),
            ...(scenario.optionsApi === false
              ? {
                  __VUE_OPTIONS_API__: 'false',
                }
              : {}),
          },
          root: playgroundRoot,
          logLevel: 'silent',
          devtools: scenario.customDevtools
            ? {
                embeddedVisibility: 'passive',
                dockPreferences: {
                  defaultMode: 'edge',
                  defaultPosition: 'bottom',
                },
              }
            : true,
          plugins: [vue(), vueDevtools()],
          optimizeDeps: {
            exclude: ['@vue/devtools-api', 'pinia', 'vue-router'],
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
        const dockClientScriptWorked = await page.evaluate<boolean>(`(async () => {
          const importsModule = await import('/__devtools/__client-imports.js')
          const loadDockClientScript = importsModule.clientImports['vue-devtools']?.[0]
          if (!loadDockClientScript) return false
          const clientModule = await loadDockClientScript()
          const setup = clientModule.default
          if (typeof setup !== 'function') return false
          let subscriptions = 0
          let disposed = 0
          const context = {
            current: { events: { on(event) {
              if (event === 'entry:deactivated') subscriptions++
              return () => { disposed++ }
            } } },
            docks: { selectedId: 'vue-devtools', async switchEntry() { return true } },
            panel: { session: { open: true } },
          }
          // The host loader must share the already installed runtime module.
          setup(context)
          if (subscriptions !== 1) return false
          // Replacing the Dock context must detach the old entry listener.
          setup({ ...context })
          return subscriptions === 2 && disposed === 1

        })()`)
        expect(dockClientScriptWorked).toBe(true)
        expect(
          runtimeErrors.filter(
            (message) =>
              message.includes('vue-devtools-client') ||
              message.includes('Error executing client script'),
          ),
        ).toEqual([])

        if (scenario.name === 'latest Vite 8 SPA') {
          const consumerCompatibility = await page.evaluate(async () => {
            const target = globalThis as typeof globalThis & {
              [key: symbol]: unknown
              $pinia?: { _s: Map<string, { count?: number }> }
            }
            const registry = target[Symbol.for('vue-devtools:plugin-registry-state')] as
              | {
                  bufferedPlugins?: Array<
                    [
                      {
                        componentStateTypes?: string[]
                        id: string
                        packageName?: string
                      },
                      unknown,
                    ]
                  >
                }
              | undefined
            const owners = target[Symbol.for('vue-devtools-next:kit-owners')] as
              | Map<
                  string,
                  {
                    plugins: {
                      adapters: Map<string, { descriptor: { packageName?: string } }>
                    }
                    runtime: {
                      command(command: unknown): Promise<{ status: number }>
                      query<T>(query: unknown): Promise<T>
                    }
                  }
                >
              | undefined
            const kit = owners?.values().next().value
            if (!kit) throw new Error('Vue DevTools runtime owner was not exposed')

            const plugins = (registry?.bufferedPlugins ?? []).map(([descriptor]) => descriptor)
            const pinia = plugins.find((plugin) => plugin.packageName === 'pinia')
            const router = plugins.find((plugin) => plugin.packageName === 'vue-router')

            const tree = await kit.runtime.query<{ appId?: string; nodes: Array<{ id: string }> }>({
              type: 'components:treeSnapshot',
            })
            let editedPiniaState = false
            let piniaEditDiagnostics: Record<string, unknown> = {
              adapterPackages: [...kit.plugins.adapters.values()].map(
                (adapter) => adapter.descriptor.packageName,
              ),
              componentCount: tree.nodes.length,
            }
            for (const node of tree.nodes) {
              const snapshot = await kit.runtime.query<{
                sections?: Array<{ id: string }>
              }>({
                appId: tree.appId,
                type: 'components:stateSnapshot',
                payload: { componentId: node.id },
              })
              const section = snapshot?.sections?.find((item) => item.id === '🍍 counter')
              if (!section) continue

              const counter = target.$pinia?._s.get('counter')
              const before = counter?.count
              const result = await kit.runtime.command({
                appId: tree.appId,
                type: 'components:editState',
                payload: {
                  componentId: node.id,
                  sectionId: section.id,
                  path: ['state', 'count'],
                  value: typeof before === 'number' ? before + 1 : 1,
                },
              })
              editedPiniaState = result.status === 1 && counter?.count !== before
              piniaEditDiagnostics = {
                adapterPackages: [...kit.plugins.adapters.values()].map(
                  (adapter) => adapter.descriptor.packageName,
                ),
                after: counter?.count,
                before,
                commandStatus: result.status,
                componentId: node.id,
                foundSection: true,
              }
              break
            }

            return {
              editedPiniaState,
              piniaEditDiagnostics,
              piniaStateTypes: pinia?.componentStateTypes ?? [],
              plugins: plugins.map((plugin) => ({
                componentStateTypes: plugin.componentStateTypes ?? [],
                id: plugin.id,
                packageName: plugin.packageName,
              })),
              routerStateTypes: router?.componentStateTypes ?? [],
            }
          })

          expect(
            consumerCompatibility.piniaStateTypes,
            JSON.stringify(consumerCompatibility.plugins),
          ).toEqual(expect.arrayContaining(['🍍 counter']))
          expect(consumerCompatibility.routerStateTypes).toContain('Routing')
          expect(
            consumerCompatibility.editedPiniaState,
            `${JSON.stringify(consumerCompatibility.piniaEditDiagnostics)}; runtime errors: ${runtimeErrors.join('; ')}`,
          ).toBe(true)

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
          await expect
            .poll(() =>
              page.evaluate(
                () =>
                  (
                    globalThis as typeof globalThis & {
                      $pinia?: { _s: Map<string, { count: number }> }
                    }
                  ).$pinia?._s.get('counter')?.count,
              ),
            )
            .toBe(42)
          await expect.poll(() => countRow.innerText()).toContain('42')

          await stateRow('profile').click()
          await stateRow('nested').click()
          await expect.poll(() => stateRow('score').innerText(), { timeout: 5_000 }).toContain('42')
          await page.evaluate(() => {
            const store = (
              globalThis as typeof globalThis & {
                $pinia?: { _s: Map<string, { profile: { nested: { score: number } } }> }
              }
            ).$pinia?._s.get('counter')
            if (!store) throw new Error('Counter store is missing')
            store.profile.nested.score = 73
          })
          await expect.poll(() => stateRow('score').innerText(), { timeout: 5_000 }).toContain('73')

          await panel.getByRole('link', { name: 'Components', exact: true }).click()
          await panel.getByPlaceholder('Find components...').fill('Dashboard')
          await expect
            .poll(() => panel.getByRole('treeitem').allTextContents())
            .toEqual(expect.arrayContaining([expect.stringContaining('Dashboard')]))
          await panel.getByPlaceholder('Find components...').fill('')
          await panel.getByRole('link', { name: 'Timeline', exact: true }).click()
          await panel.getByRole('button', { name: 'Stop recording', exact: true }).click()
          await panel.getByRole('button', { name: 'Start recording', exact: true }).click()
          await panel.getByRole('button', { name: 'Clear all timelines', exact: true }).click()
          await panel.getByRole('link', { name: 'Pinia', exact: true }).click()
          await expect.poll(() => stateRow('count').innerText()).toContain('42')
          // Observe disconnect and reconnect, rather than accepting a stale UI value.
          await page.evaluate(`window.__VUE_DEVTOOLS_VITE_RUNTIME__.disposeRpcHost()`)
          const attachedClients = () =>
            page.evaluate<number>(
              `window.__VUE_DEVTOOLS_VITE_RUNTIME__.kit.runtime.performance.snapshot().attachedClients`,
            )
          await expect.poll(attachedClients).toBe(0)
          await page.evaluate(`(() => {
            const state = window.__VUE_DEVTOOLS_VITE_RUNTIME__
            const host = state.kit.rpc.attachInPage({ name: 'vue-devtools', window })
            state.disposeRpcHost = () => host.dispose()
          })()`)
          await expect.poll(attachedClients, { timeout: 10_000 }).toBeGreaterThan(0)
          await expect
            .poll(() => stateRow('count').innerText(), { timeout: 10_000 })
            .toContain('42')
          expect(pageErrors).toEqual([])
        }

        const connectionResponse = await fetch(`${origin}/__devtools/__connection.json`)
        expect(connectionResponse.headers.get('content-type')).toContain('application/json')
        const connectionMeta = await connectionResponse.json()
        if (scenario.customDevtools) {
          expect(connectionMeta.configs.ui).toMatchObject({
            embeddedVisibility: 'passive',
            dockPreferences: {
              defaultMode: 'edge',
              defaultPosition: 'bottom',
            },
          })
        }

        const vueClientResponse = await fetch(`${origin}${scenario.base ?? '/'}__devtools__/`)
        expect(vueClientResponse.headers.get('content-type')).toContain('text/html')
        expect(await vueClientResponse.text()).toContain('<title>Vue DevTools</title>')
      } finally {
        await page.close()
        await server?.close()
        await close(middlewareServer)
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
        const template = await readFile(resolve(playgroundRoot, 'index.html'), 'utf8')
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
