import { createVueDevtoolsAgentTools } from '../../packages/agentic/src'
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
  await page.goto(`${origin}/?agentic`)

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

  async function callResult(suffix: string, args: Record<string, unknown> = {}) {
    const tool = instance.mcp!.tools.find((tool) => tool.name.endsWith(`_${suffix}`))
    expect(tool, `Missing Vue tool: ${suffix}`).toBeDefined()
    const result = await connector.callTool({
      name: 'devframe_connect_call-tool',
      arguments: { port: instance.port, tool: tool!.name, args },
    })
    return readResult<CallToolResult>(result)
  }

  const contracts = createVueDevtoolsAgentTools(
    {
      query: async () => {
        throw new Error('schema only')
      },
      command: async () => ({ status: 1 }),
    },
    { id: '', url: '', title: '' },
  )
  async function call<T>(suffix: string, args: Record<string, unknown> = {}) {
    const result = readResult<{ page: { url: string }; result: T }>(await callResult(suffix, args))
    const contract = contracts[suffix as keyof typeof contracts]!
    expect(contract.returns.safeParse(result).success, `Output contract for ${suffix}`).toBe(true)
    return result
  }

  const apps = await call<{ apps: { id: string }[] }>('list-apps')
  expect(apps.page.url).toBe(`${origin}/?agentic`)
  expect(apps.result.apps.length).toBeGreaterThan(0)
  const appId = apps.result.apps[0].id
  const tree = await call<{ nodes: { id: string; name: string }[] }>('component-tree', {
    arg0: { appId },
  })
  expect(tree.result.nodes.length).toBeGreaterThan(0)
  const state = await call<{ sections: unknown[] }>('component-state', {
    arg0: { appId, componentId: tree.result.nodes[0].id },
  })
  expect(state.result.sections.length).toBeGreaterThan(0)
  const componentId = tree.result.nodes.find((node) => node.name === 'AgenticArrays')!.id
  type State = {
    snapshotId: string
    pagination: { total: number; pageSize: number; current: number; next: number | null }
    sections: {
      entries: { key: string; value: { handle: string; preview: unknown[] } }[]
      partial?: boolean
    }[]
  }
  const defaults = await call<State>('component-state', { arg0: { appId, componentId } })
  expect(defaults.result.sections[0]!.entries).toHaveLength(50)
  const bounded = await call<State>('component-state', {
    arg0: { appId, componentId, pageSize: 500 },
  })
  const section = bounded.result.sections[0]!
  expect(section.entries).toHaveLength(500)
  expect(section.partial).toBe(true)
  for (const entry of section.entries) expect(entry.value.preview).toHaveLength(30)
  const handle = section.entries[0]!.value.handle
  const expanded = await call<{ value: { kind: string; value: number } }>('expand-value', {
    arg0: { appId, handle, path: ['499'] },
  })
  expect(expanded.result.value).toEqual({ kind: 'number', value: 499 })

  const fresh = await call<State>('component-state', { arg0: { appId, componentId } })
  const expired = await callResult('expand-value', { arg0: { appId, handle } })
  expect(expired.isError).toBe(true)
  expect(JSON.stringify(expired)).toContain(
    'Rerun the original component-state or inspector-state query',
  )
  const recovered = await call<{ value: { kind: string; value: number } }>('expand-value', {
    arg0: { appId, handle: fresh.result.sections[0]!.entries[0]!.value.handle, path: ['499'] },
  })
  expect(recovered.result.value).toEqual({ kind: 'number', value: 499 })

  const oversizedId = tree.result.nodes.find((node) => node.name === 'AgenticOversized')!.id
  let oversized = await call<State>('component-state', {
    arg0: { appId, componentId: oversizedId, pageSize: 500 },
  })
  expect(oversized.result.pagination.next).toBe(2)
  const allKeys: string[] = []
  for (;;) {
    allKeys.push(
      ...oversized.result.sections.flatMap((section) => section.entries.map((entry) => entry.key)),
    )
    if (!oversized.result.pagination.next) break
    oversized = await call<State>('component-state', {
      arg0: {
        appId,
        componentId: oversizedId,
        pageSize: 500,
        page: oversized.result.pagination.next,
        snapshotId: oversized.result.snapshotId,
      },
    })
  }
  expect(allKeys).toEqual(Array.from({ length: 500 }, (_, i) => `field${i}`))
  const field = { appId, componentId, sectionId: 'setup', path: ['field500', '499'] }
  const direct = await call<{ found: boolean; value: { value: number } }>('component-value', {
    arg0: field,
  })
  expect(direct.result).toMatchObject({ found: true, value: { kind: 'number', value: 499 } })
  expect(
    (await call<{ found: boolean }>('component-value', { arg0: { ...field, path: ['missing'] } }))
      .result.found,
  ).toBe(false)

  const editableId = tree.result.nodes.find((node) => node.name === 'AgenticEditable')!.id
  const editInput = {
    appId,
    componentId: editableId,
    sectionId: 'setup',
    path: ['count'],
    value: 8,
  }
  const changed = await call<{ state: { value: { value: number } } }>('edit-component-state', {
    arg0: editInput,
  })
  expect(changed.result.state.value.value).toBe(8)
  await expect.poll(() => page.locator('#agentic-count').textContent()).toBe('8')
  const locked = await callResult('edit-component-state', {
    arg0: { ...editInput, path: ['doubled'] },
  })
  expect(locked.isError).toBe(true)
  expect(JSON.stringify(locked)).toContain('read-only')

  const inspectors = await call<{ inspectors: { id: string }[] }>('list-inspectors', {
    arg0: { appId },
  })
  const inspectorId = inspectors.result.inspectors.find((inspector) =>
    inspector.id.includes('pinia'),
  )!.id
  const stores = await call<{ rootNodes: { id: string }[] }>('inspector-tree', {
    arg0: { appId, inspectorId },
  })
  const nodeId = stores.result.rootNodes.find((node) => node.id === 'counter')!.id
  const storeState = await call<{ sections: { id: string; entries: { key: string }[] }[] }>(
    'inspector-state',
    { arg0: { appId, inspectorId, nodeId } },
  )
  const sectionId = storeState.result.sections.find((section) =>
    section.entries.some((entry) => entry.key === 'count'),
  )!.id
  const storeField = { appId, inspectorId, nodeId, sectionId, path: ['count'] }
  expect(
    (await call<{ found: boolean }>('inspector-value', { arg0: storeField })).result.found,
  ).toBe(true)
  const storeEdit = await call<{ state: { value: { value: number } } }>('edit-inspector-state', {
    arg0: { ...storeField, value: 12 },
  })
  expect(storeEdit.result.state.value.value).toBe(12)
  await expect.poll(() => page.locator('#count').textContent()).toBe('12')
  await call('list-plugins')
  await call('runtime-health')
  await call('router-state', { arg0: { appId } })
  await call('router-matches', { arg0: { appId, path: '/' } })
  await call('component-render-code', { arg0: { appId, componentId: editableId } })
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
    // Pinia disables DevTools under NODE_ENV=test; the served app represents development.
    define: { 'process.env.NODE_ENV': JSON.stringify('development') },
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
