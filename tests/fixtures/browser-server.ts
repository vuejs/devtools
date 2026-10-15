import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { createServer } from 'node:http'

export interface BrowserFixtureServers {
  frameUrl: string
  mainUrl: string
  /** Top frame without Vue that embeds the Vue frame. */
  subframeOnlyUrl: string
  close(): Promise<void>
}

export async function startBrowserFixtureServers(): Promise<BrowserFixtureServers> {
  const frameServer = createServer((_, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    response.end(createVueDetectionPage('Cross-origin Frame'))
  })
  await listen(frameServer)
  const frameUrl = getServerUrl(frameServer)

  const mainServer = createServer((request, response) => {
    if (request.url === '/health') {
      response.writeHead(204)
      response.end()
      return
    }

    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    if (request.url === '/subframe-only') {
      response.end(createPage('Subframe-only Fixture', `<iframe src="${frameUrl}"></iframe>`))
      return
    }
    response.end(
      createVueDetectionPage(
        'Vue Devtools Smoke Fixture',
        `<iframe title="cross-origin fixture" src="${frameUrl}"></iframe>`,
      ),
    )
  })
  await listen(mainServer)

  return {
    frameUrl,
    mainUrl: getServerUrl(mainServer),
    subframeOnlyUrl: `${getServerUrl(mainServer)}subframe-only`,
    async close() {
      await Promise.all([closeServer(mainServer), closeServer(frameServer)])
    },
  }
}

function createVueDetectionPage(title: string, body = ''): string {
  return createPage(title, `${body}\n    <script>window.__VUE__ = true</script>`)
}

function createPage(title: string, body: string): string {
  return `<!doctype html>
<html>
  <head><meta charset="utf-8"><title>${title}</title></head>
  <body>
    <h1>${title}</h1>
    ${body}
  </body>
</html>`
}

function listen(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject)
      resolve()
    })
  })
}

function getServerUrl(server: Server): string {
  const address = server.address() as AddressInfo
  return `http://127.0.0.1:${address.port}/`
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
}
