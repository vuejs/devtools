# @vue/devtools-agentic

Read Vue runtime state through agent tools backed by an existing Vue DevTools connection.

The package exports `createVueDevtoolsAgentTools(connection, page)` for host-independent tool definitions and `createVueDevtoolsAgentSession` for lazy connections. Devframe adapters export `registerVueDevtoolsAgentPage` from `@vue/devtools-agentic/devframe` and the lightweight `registerVueDevtoolsAgentHost` from `@vue/devtools-agentic/node`. A host supplies the kit's typed `query` connection and a unique document ID. Disposing the page registration removes its tools; the host owns the connection's lifetime.

Tools inspect apps, component trees and state, render code, plugin inspectors (including Pinia), registered plugins, routes, and encoded value handles. Every result includes its page identity and capture time. App-specific queries require an explicit app ID. Component IDs, cursors and handles expire on reload and when that page's agent connection is disposed; state sections can be partial. `component-tree` can filter by component name or source file. Calling it again drops open `component-children` cursors.

## Vite

```ts
import { defineConfig } from 'vite'
import vueDevTools from 'vite-plugin-vue-devtools'

export default defineConfig({
  devtools: { apply: 'serve' },
  plugins: [vueDevTools()],
})
```

Open the application and allow its Vite DevTools connection. Vue tools are included automatically when the host exposes MCP. The lightweight dock script loads eagerly to read the host connection metadata; the tool module loads only when that metadata advertises an MCP endpoint. The Vue panel can stay closed. The Vite DevTools host owns its MCP endpoint, discovery registration and authentication; its explicit `mcp: false` setting disables MCP access.

## Connect an agent

Add this server once to your agent client's global MCP configuration (the configuration file location depends on the client):

```json
{
  "mcpServers": {
    "vue-devtools": {
      "command": "npx",
      "args": ["-y", "@vue/devtools-agentic", "connect"]
    }
  }
}
```

The CLI reuses Devframe’s connector and includes its MCP dependencies. It discovers running projects from the Devframe instance registry without a per-project configuration or a fixed port. The connector sends no bearer token unless `DEVFRAME_MCP_AUTH_TOKEN` is set. Vite DevTools trusts a same-machine caller by default; set the variable only when the host's `mcp` option requires a bearer token. A port probe that is not already in the registry must use `--base /__devtools/` so it can find Vite's `__connection.json`.

Call `devframe_connect_list-instances`, match the project's `rootDir`, then call `devframe_connect_call-tool` with its port, tool name and arguments. Page tools use a unique `vue-devtools:agent:<document-id>` namespace. Invoke a page's `list-apps` tool to identify its URL and apps before inspecting it. Tools taking one options object advertise that object under `arg0`:

```json
{
  "port": 5173,
  "tool": "<component-state tool name from discovery>",
  "args": {
    "arg0": { "appId": "<app id>", "componentId": "<component id>" }
  }
}
```

Reloading changes the document namespace; rediscover tools before continuing. Stop the dev server to remove its running instance. See [Devframe MCP](https://devfra.me/adapters/mcp) for endpoint configuration and credentials.

The Vite adapter opens a kit connection on the first query and keeps it until that page's tool registration is disposed (reload, or MCP turned off). Discovery alone leaves the runtime disconnected. `page.url` follows the document location, including client-side navigations; use `router-state` for the Vue route. Reloading or disposing the registration clears cached snapshots and handles.

A host exposing MCP makes application state available to connected agents. The tools read state through the same plugin hooks as the UI; application state getters and plugin hooks may execute application code. This package's Vite integration runs during development. Other hosts can supply their own kit connection and adapter.
