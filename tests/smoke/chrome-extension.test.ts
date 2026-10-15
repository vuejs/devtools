import type { BrowserContext, Worker } from 'playwright'
import { access, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chromium } from 'playwright'
import { startBrowserFixtureServers, type BrowserFixtureServers } from '../fixtures'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const extensionPath = resolve(repositoryRoot, 'packages/chrome')

describe('Chrome MV3 extension smoke test', () => {
  let context: BrowserContext | undefined
  let fixture: BrowserFixtureServers | undefined
  let serviceWorker: Worker | undefined
  let userDataDir: string | undefined

  beforeAll(async () => {
    await Promise.all([
      access(resolve(extensionPath, 'manifest.json')),
      access(resolve(extensionPath, 'dist/backend.js')),
      access(resolve(extensionPath, 'dist/background.js')),
    ])

    fixture = await startBrowserFixtureServers()
    userDataDir = await mkdtemp(join(tmpdir(), 'vue-devtools-chrome-'))
    context = await chromium.launchPersistentContext(userDataDir, {
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
      channel: 'chromium',
      headless: true,
    })
    serviceWorker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'))
  })

  afterAll(async () => {
    await context?.close()
    await fixture?.close()
    if (userDataDir) await rm(userDataDir, { force: true, recursive: true })
  })

  it('loads the extension and keeps detection working across reloads and navigation', async () => {
    if (!context || !fixture || !serviceWorker) throw new Error('Smoke fixture did not start')

    const page = await context.newPage()
    await page.goto(fixture.mainUrl)
    await waitForVueDetection(page)

    const detection = await page.evaluate(
      () =>
        (
          window as typeof window & {
            __VUE_DEVTOOLS_EXTENSION_STATE__?: { installed?: boolean; vueDetected?: boolean }
          }
        ).__VUE_DEVTOOLS_EXTENSION_STATE__,
    )
    const popup = await serviceWorker.evaluate(async (pageUrl) => {
      const chromeApi = (
        globalThis as typeof globalThis & {
          chrome: {
            action: { getPopup(options: { tabId: number }): Promise<string> }
            tabs: { query(options: object): Promise<Array<{ id?: number; url?: string }>> }
          }
        }
      ).chrome
      const tabs = await chromeApi.tabs.query({})
      const tab = tabs.find((candidate) => candidate.url === pageUrl)
      if (tab?.id == null) throw new Error(`Unable to find fixture tab: ${pageUrl}`)
      return await chromeApi.action.getPopup({ tabId: tab.id })
    }, page.url())

    expect(detection).toMatchObject({ installed: true, vueDetected: true })
    expect(page.frames()).toHaveLength(2)
    expect(popup).toContain('/app/popups/disabled.html')

    await page.reload()
    await waitForVueDetection(page)

    const navigationUrl = `${fixture.mainUrl}?navigation=1`
    await page.goto(navigationUrl)
    await waitForVueDetection(page)

    await page.close()
    await expect
      .poll(
        () =>
          serviceWorker?.evaluate(async (pageUrl) => {
            const tabs = await (
              globalThis as typeof globalThis & {
                chrome: {
                  tabs: { query(options: object): Promise<Array<{ url?: string }>> }
                }
              }
            ).chrome.tabs.query({})
            return tabs.some((tab) => tab.url === pageUrl)
          }, navigationUrl),
        { timeout: 5_000 },
      )
      .toBe(false)
  })

  // Chrome stops an idle service worker and its in-memory detection state with it.
  it('recovers subframe-only detection after the service worker restarts', async () => {
    if (!context || !fixture || !serviceWorker) throw new Error('Smoke fixture did not start')

    const page = await context.newPage()
    await page.goto(fixture.subframeOnlyUrl)
    const tabId = await serviceWorker.evaluate(async (pageUrl) => {
      const tabs = await (
        globalThis as typeof globalThis & {
          chrome: {
            tabs: { query(options: object): Promise<Array<{ id?: number; url?: string }>> }
          }
        }
      ).chrome.tabs.query({})
      return tabs.find((tab) => tab.url === pageUrl)?.id
    }, page.url())
    if (tabId == null) throw new Error('Unable to find subframe-only fixture tab')

    // Ask the way the devtools page does, from an extension page.
    const extensionPage = await context.newPage()
    await extensionPage.goto(
      `chrome-extension://${new URL(serviceWorker.url()).host}/app/popups/not-found.html`,
    )
    const queryVueDetected = () =>
      extensionPage.evaluate(
        (id) =>
          new Promise<boolean>((resolve) => {
            const chromeApi = (
              globalThis as typeof globalThis & {
                chrome: {
                  runtime: {
                    lastError?: unknown
                    sendMessage(
                      message: object,
                      callback: (payload?: { vueDetected?: boolean }) => void,
                    ): void
                  }
                }
              }
            ).chrome
            chromeApi.runtime.sendMessage(
              { source: 'vue-devtools:chrome', tabId: id, type: 'vue-devtools:detection-query' },
              (payload) => {
                void chromeApi.runtime.lastError
                resolve(!!payload?.vueDetected)
              },
            )
          }),
        tabId,
      )

    await expect.poll(queryVueDetected, { timeout: 10_000 }).toBe(true)

    const cdp = await context.newCDPSession(extensionPage)
    await cdp.send('ServiceWorker.enable')
    await cdp.send('ServiceWorker.stopAllWorkers')

    await expect.poll(queryVueDetected, { interval: 1_000, timeout: 5_000 }).toBe(true)

    await extensionPage.close()
    await page.close()
  })
})

async function waitForVueDetection(page: import('playwright').Page): Promise<void> {
  await page.waitForFunction(
    () =>
      Boolean(
        (
          window as typeof window & {
            __VUE_DEVTOOLS_EXTENSION_STATE__?: { vueDetected?: boolean }
          }
        ).__VUE_DEVTOOLS_EXTENSION_STATE__?.vueDetected,
      ),
    undefined,
    { timeout: 10_000 },
  )
}
