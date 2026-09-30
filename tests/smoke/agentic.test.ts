import { Client, type CallToolResult } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'
import vue from '@vitejs/plugin-vue'
import { chromium, type Browser } from 'playwright'
import { resolve } from 'node:path'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { afterAll, beforeAll, expect, it, onTestFinished } from 'vitest'
import { createServer } from 'vite'
import vueDevtools from '../../packages/vite/src'

const fixtureRoot = resolve('tests/fixtures/vite-smoke')
let browser: Browser

beforeAll(async () => {
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  })
})

afterAll(async () => {
  await browser?.close()
})

it('discovers Vue tools and reads component state through the CLI connector', async () => {
  const { origin, page } = await startApp()
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(origin)

  const connector = new Client({ name: 'vue-agentic-smoke', version: '1' })
  onTestFinished(() => connector.close())
  await connector.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [resolve('packages/agentic/dist/cli.mjs'), 'connect'],
    }),
  )

  interface Instance {
    origin: string
    rootDir: string
    port: number
    mcp?: { tools: { name: string }[] }
  }
  async function discover() {
    const result = await connector.callTool({ name: 'devframe_connect_list-instances' })
    return readResult<{ instances: Instance[] }>(result).instances.find(
      (instance) => instance.origin === origin,
    )
  }
  await expect
    .poll(async () =>
      (await discover())?.mcp?.tools.some((tool) => tool.name.endsWith('list-apps')),
    )
    .toBe(true)
  const instance = (await discover())!
  expect(instance.rootDir).toBe(fixtureRoot)

  async function call<T>(suffix: string, args: Record<string, unknown> = {}) {
    const tool = instance.mcp!.tools.find((tool) => tool.name.endsWith(suffix))
    expect(tool, `Missing Vue tool: ${suffix}`).toBeDefined()
    const result = await connector.callTool({
      name: 'devframe_connect_call-tool',
      arguments: { port: instance.port, tool: tool!.name, args },
    })
    return readResult<{ page: { url: string }; result: T }>(readResult<CallToolResult>(result))
  }

  const apps = await call<{ apps: { id: string }[] }>('list-apps')
  expect(apps.page.url).toBe(`${origin}/`)
  expect(apps.result.apps.length).toBeGreaterThan(0)
  const appId = apps.result.apps[0].id
  const tree = await call<{ nodes: { id: string }[] }>('component-tree', { arg0: { appId } })
  expect(tree.result.nodes.length).toBeGreaterThan(0)
  const state = await call<{ sections: unknown[] }>('component-state', {
    arg0: { appId, componentId: tree.result.nodes[0].id },
  })
  expect(state.result.sections.length).toBeGreaterThan(0)
  expect(errors).toEqual([])
})

it('disables the MCP endpoint when the host sets mcp: false', async () => {
  const { origin, page } = await startApp(false)
  await page.goto(origin)
  const metadata = await (await fetch(`${origin}/__devtools/__connection.json`)).json()
  expect(metadata.mcp).toBeUndefined()
  const response = await fetch(`${origin}/__devtools/__mcp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      origin,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
  })
  expect(response.ok).toBe(false)
})

async function startApp(mcp?: boolean) {
  const cacheDir = await mkdtemp(resolve(tmpdir(), 'vue-devtools-agentic-smoke-'))
  onTestFinished(() => rm(cacheDir, { recursive: true, force: true }))
  const server = await createServer({
    cacheDir,
    configFile: false,
    root: fixtureRoot,
    logLevel: 'silent',
    devtools: { clientAuth: false, builtinDevTools: false, ...(mcp === undefined ? {} : { mcp }) },
    plugins: [vue(), vueDevtools()],
    optimizeDeps: { exclude: ['@vue/devtools-api', 'pinia'] },
    resolve: { alias: { '@vue/devtools-api': resolve('packages/devtools-api/src/index.ts') } },
    server: { host: '127.0.0.1', port: 0 },
  })
  onTestFinished(() => server.close())
  await server.listen()
  const page = await browser.newPage()
  onTestFinished(() => page.close())
  return { origin: server.resolvedUrls!.local[0].replace(/\/$/, ''), page }
}

function readResult<T>(result: CallToolResult): T {
  expect(result.isError, JSON.stringify(result)).not.toBe(true)
  const content = result.content[0]
  if (content?.type !== 'text') throw new Error('Expected an MCP text result')
  return JSON.parse(content.text) as T
}
