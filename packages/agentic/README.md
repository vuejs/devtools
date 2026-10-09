# @vue/devtools-agentic

Let AI agents inspect a running Vue application through MCP: find components, read state, edit individual fields, inspect Pinia stores, and check routes.

The Vite integration connects agents to the same runtime used by Vue DevTools. Open your app in a browser; the Vue DevTools panel can stay closed. Inspection tools are read-only. Hosts with a Kit command connection also expose explicit actions for editing component and Inspector fields.

## Get started

### 1. Enable Vue DevTools in your app

Use `vite-plugin-vue-devtools` alongside `@vitejs/devtools` and Vite 8.3 or later. Add the following to your existing Vite configuration:

```ts
import { defineConfig } from 'vite'
import vueDevTools from 'vite-plugin-vue-devtools'

export default defineConfig({
  devtools: { apply: 'serve' },
  plugins: [vueDevTools()],
})
```

Start the dev server, open the app in your browser, and allow the Vite DevTools connection when prompted. Vue's agent tools register automatically when the host exposes MCP. Setting `devtools.mcp` to `false` disables MCP access.

### 2. Connect your agent

Add this entry to your agent client's MCP configuration. Use its global configuration to make the connector available across projects; the configuration file location depends on the client.

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

The CLI uses Devframe's connector to discover running projects automatically. You do not need to configure a fixed port for each project.

### 3. Inspect the running app

An agent follows this sequence:

1. Call `devframe_connect_list-instances` and select the project by its `rootDir`.
2. Find the page's Vue tools in that instance's tool list. Call `list-apps` to check the page URL and get an app ID.
3. Call `component-tree` to get component IDs, then `component-state` to inspect a component. Use `expand-value` when you need more detail about an object or array.

Invoke page tools through `devframe_connect_call-tool`, using the port and exact tool name returned by discovery. Tools that take an options object expose it as `arg0`. For example:

```json
{
  "port": 5173,
  "tool": "<component-state tool name from discovery>",
  "args": {
    "arg0": {
      "appId": "<app ID from list-apps>",
      "componentId": "<component ID from component-tree>"
    }
  }
}
```

Each browser document has its own `vue-devtools:agent:<document-id>` namespace. If several pages are open, use `list-apps` to identify the one you want. After a reload, discover its tools again before making further calls.

## Available tools

| Task                                    | Tools                                                                         |
| --------------------------------------- | ----------------------------------------------------------------------------- |
| Identify the app and check the runtime  | `list-apps`, `list-plugins`, `runtime-health`                                 |
| Explore components                      | `component-tree`, `component-children`, `cancel-component-children`           |
| Inspect component state and render code | `component-state`, `component-value`, `expand-value`, `component-render-code` |
| Read Pinia stores and other plugin data | `list-inspectors`, `inspector-tree`, `inspector-state`, `inspector-value`     |
| Inspect routing without navigating      | `router-state`, `router-matches`                                              |
| Edit an existing field                  | `edit-component-state`, `edit-inspector-state`                                |

App-specific tools require an explicit `appId`. Every tool declares an output schema. Successful calls return `{ page, capturedAt, result }`; rejected calls use the MCP tool error channel. Field reads return `found: false` for a missing target or path. A present null or undefined value instead has `found: true` and a tagged codec value. The page URL follows browser navigation; use `router-state` for Vue Router's current route and registered routes.

The component tree is loaded incrementally. `component-tree` filters the initially loaded nodes by component name or source file; it does not search every unloaded descendant. Use `component-children` to read more nodes, pass its cursor to continue, and cancel unfinished reads with `cancel-component-children`.

## Read all state with pagination

`component-state` and `inspector-state` return the first page of fields, grouped by section. To read everything, follow `pagination.next` until it is `null`:

```json
{
  "snapshotId": "state-page:1",
  "pagination": {
    "total": 126,
    "current": 1,
    "next": 2
  },
  "sections": []
}
```

This example shows the pagination metadata; actual responses include the page's entries in `sections`. `total` counts fields across all sections, not pages. `current` and `next` are page numbers starting at 1.

For the next call, keep the original query parameters, pass back `snapshotId`, and set `page` to the returned `next`. For example, the next `component-state` call uses:

```json
{
  "appId": "<app ID>",
  "componentId": "<component ID>",
  "page": 2,
  "snapshotId": "state-page:1"
}
```

Pages can contain different numbers of entries. Always follow `next` to determine whether more data is available. A section's `partial` flag means this page contains only part of that section; it does not mean the remaining fields are inaccessible.

The same pagination parameters work with `expand-value`. For `component-value` and `inspector-value`, omit them for a compact preview, or pass `page: 1` to start paging through the selected value. Collections return a page of preview entries. Strings return text segments: `total` counts UTF-16 code units, and concatenating the segments reconstructs the full string.

A batch keeps the original field order, but it is not an atomic snapshot of the application. Object properties can change as they are read. For `inspector-state`, the plugin hook runs when the batch starts. Component reactivity graphs, when available, appear on the first state page. Read pages in order; retrying the most recent page returns the same result. To start over, omit `snapshotId` and request page 1. Batches are retained temporarily; an expired ID returns instructions to restart.

### Value handles

A **value handle** is a temporary reference to an object or array. Pass it to `expand-value`, optionally with a property path, to read details omitted from a preview. A missing path produces an error; an existing `undefined` value is returned with its codec tag.

Handles can expire when the same component or Inspector node is read again, including by the DevTools panel, or when the runtime releases retained values. Keeping the connection open does not keep handles valid. To recover, start a fresh state query and use its new handles, or read a known field path directly. After a page reload, rediscover the page tools as well.

## Read or edit a specific field

For a known component field, call `component-value` with its `appId`, `componentId`, `sectionId`, and `path`. Built-in sections include `props`, `data`, and `setup`. Array indexes are strings. This reads the live value without requiring a previous handle:

```json
{
  "appId": "app:0",
  "componentId": "app:0:12",
  "sectionId": "setup",
  "path": ["user", "name"]
}
```

For plugin state such as Pinia, discover the Inspector and node first, then use `inspector-value` with `inspectorId`, `nodeId`, `sectionId`, and `path`. The path starts with the Inspector entry key. Kit still invokes the plugin's state hook, but encodes only the requested value. Both field tools return compact previews for objects and arrays.

To change a field:

1. Read it with `component-value` or `inspector-value`. Check `found` and `editable`.
2. Call `edit-component-state` or `edit-inspector-state` with the same target and a JSON `value`.
3. Inspect the returned `result.state`, which contains the value read after the command. `status: 1` acknowledges the command; a plugin may normalize the value or leave it unchanged.

Editing uses the same Kit commands and plugin hooks as the panel. These tools change existing fields; they do not delete or rename fields, navigate, or invoke arbitrary plugin actions. Props may be overwritten by a parent render. Component field tools target built-in state sections; custom plugin state is accessed through its Inspector.

| Situation                        | Next step                                                             |
| -------------------------------- | --------------------------------------------------------------------- |
| `found: false`                   | Check the target IDs and field path; rediscover tools after a reload  |
| Read-only field                  | Choose a field marked `editable: true`                                |
| Expired handle                   | Read the original state again, or use a field path directly           |
| Response exceeds the byte budget | Read a narrower field path if a single entry is too large             |
| Edit transport or readback error | Read the current state before retrying; the edit may already have run |

## Connection and access

Vite DevTools manages the MCP endpoint, discovery, and authentication. The connector sends a bearer token only when `DEVFRAME_MCP_AUTH_TOKEN` is set. Vite DevTools accepts local callers by default; set that variable if your host configuration requires a token.

If automatic discovery cannot find your project, probe its port explicitly:

```sh
npx @vue/devtools-agentic connect --port 5173 --base /__devtools/
```

The base path points the probe to Vite DevTools' connection metadata. See [Devframe MCP](https://devfra.me/adapters/mcp) for endpoint and authentication configuration.

Discovery alone does not open a Vue runtime connection. The Vite adapter connects on the first query and keeps that connection until the page's tool registration is disposed. Keeping it open does not guarantee that individual value handles remain valid.

Connected agents can read application state, including private data stored in it. Reads use the same getters and plugin hooks as the Vue DevTools UI, so inspecting a value may execute application code. The Vite integration runs during development.

## Integrate another host

The tool definitions are independent of Vite. To expose them in another host, supply a Kit connection and a unique ID for each browser document.

| Export                                           | Entry point                      | Purpose                                                                             |
| ------------------------------------------------ | -------------------------------- | ----------------------------------------------------------------------------------- |
| `createVueDevtoolsAgentTools(connection, page)`  | `@vue/devtools-agentic`          | Create tool definitions for a page                                                  |
| `createVueDevtoolsAgentSession(connect)`         | `@vue/devtools-agentic`          | Open a connection lazily and manage its lifetime                                    |
| `registerVueDevtoolsAgentPage(connection, page)` | `@vue/devtools-agentic/devframe` | Register page tools with Devframe                                                   |
| `registerVueDevtoolsAgentHost(ctx)`              | `@vue/devtools-agentic/node`     | Register a help tool so the host's MCP endpoint is available before a page connects |

The connection supplies Kit's typed `query` method; `command` enables editing actions and cursor cleanup. Hosts that supply only `query` do not register editing actions. Disposing a page registration removes its tools. The host remains responsible for disposing the connection.
