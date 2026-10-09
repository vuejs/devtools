# Agents

Connect a coding agent to your running Vue app to inspect components, read Pinia stores, check routes, and edit individual state fields through MCP (Model Context Protocol).

Agents use the same runtime as the Vue DevTools panel. Keep your app open in the browser; the panel can stay closed. This integration is available during development through the Vite plugin. The [Chromium extension](/guide/browser-extension) does not expose an agent connection.

## Get started

### 1. Enable Vue DevTools

Set up the [Vite plugin](/guide/vite-plugin) with Vite 8.3 or later and `@vitejs/devtools` 0.7.6 or later. Start your dev server, open the app in a browser, and allow the Vite DevTools connection when prompted.

Vue's tools register automatically when the host provides MCP access. Setting `devtools.mcp` to `false` disables that access.

### 2. Configure your agent

Add the connector to your agent client's MCP configuration. Use the global configuration if you want to connect to multiple projects; the file location depends on the client.

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

The connector discovers running projects automatically, so you do not need to configure a port for each one.

### 3. Ask about your app

Try a request such as:

> Find the component that renders the user profile and inspect its current props and setup state.

The agent finds the running project, identifies the browser page, and queries its Vue tools. If you have several projects or pages open, include the project name or page URL in your request.

## Inspect the running app

An agent starts with these calls:

1. Call `devframe_connect_list-instances` and select the project by `rootDir`.
2. Find the page's Vue tools and call `list-apps` to get its URL and app IDs.
3. Call `component-tree` to find a component, then `component-state` to read its state.

Page tools are called through `devframe_connect_call-tool`. Use the port and exact tool name returned by discovery. An options object is passed as `args.arg0`:

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

Each browser document has its own tools. Use `list-apps` to identify the page before inspecting it. After a reload, discover its tools again: the previous tool namespace, component IDs, and value handles are no longer valid.

### Available tools

| Task                                       | Tools                                                                         |
| ------------------------------------------ | ----------------------------------------------------------------------------- |
| Identify apps and check runtime health     | `list-apps`, `list-plugins`, `runtime-health`                                 |
| Browse the component tree                  | `component-tree`, `component-children`, `cancel-component-children`           |
| Read component state and render code       | `component-state`, `component-value`, `expand-value`, `component-render-code` |
| Inspect Pinia stores and other plugin data | `list-inspectors`, `inspector-tree`, `inspector-state`, `inspector-value`     |
| Check routes                               | `router-state`, `router-matches`                                              |
| Edit a state field                         | `edit-component-state`, `edit-inspector-state`                                |

Tools that target an app require an `appId`. Each tool declares an output schema. Successful calls return `{ page, capturedAt, result }`; failed calls use the MCP tool error channel.

The component tree loads incrementally. `component-tree` filters loaded nodes by component name or source file. To explore further, use `component-children` and pass the returned cursor to read the next page. Cancel unfinished reads with `cancel-component-children`. If a cursor expires, restart `component-children` without it.

Pinia stores and other plugin data are available through **Inspectors**. Call `list-inspectors`, find a node with `inspector-tree`, then read it with `inspector-state`.

For routing, `page.url` tracks the browser's URL, while `router-state` reports Vue Router's current route and registered routes. Use `router-matches` to check which route records match a path without navigating.

## Read a specific field

Use `component-state` for an overview and `component-value` when you know the field path. A direct field read does not require a previous snapshot or value handle and can reach fields outside the current page.

For example, to read `user.name` from a component's setup state, pass this options object to `component-value` as `args.arg0`:

```json
{
  "appId": "<app ID>",
  "componentId": "<component ID>",
  "sectionId": "setup",
  "path": ["user", "name"]
}
```

Get the section ID from `component-state`. Built-in sections include `props`, `data`, and `setup`. Use strings for array indexes, such as `["users", "0", "name"]`.

For plugin state, use `inspector-value` with `appId`, `inspectorId`, `nodeId`, `sectionId`, and `path`. The path starts with the state entry's key. The plugin's state hook still runs, but only the requested value is encoded.

Both tools return `found: false` if the target or path is missing. An existing field whose value is `null` or `undefined` returns `found: true`, with the value's type preserved by the Vue DevTools codec.

## Edit a field

Editing uses the same Kit commands and plugin hooks as the Vue DevTools panel:

1. Read the field with `component-value` or `inspector-value` and check that `found` and `editable` are both `true`.
2. Call `edit-component-state` or `edit-inspector-state` with the same target and path, plus a JSON `value`.
3. Check `result.state` for the value read back after the edit.

For example, pass the following options to `edit-component-state` to update `user.name`:

```json
{
  "appId": "<app ID>",
  "componentId": "<component ID>",
  "sectionId": "setup",
  "path": ["user", "name"],
  "value": "Ada"
}
```

A `status: 1` response acknowledges the command; it does not guarantee that the requested value was retained. A plugin may transform the value or leave it unchanged, and a parent render may overwrite an edited prop. Check the returned state to see the actual result.

These tools edit existing fields. They cannot delete or rename fields, navigate, or invoke arbitrary plugin actions. Component field tools work with built-in state sections; access custom plugin state through its Inspector.

If an edit encounters a connection or readback error, read the field before retrying. The change may already have been applied.

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

## Troubleshooting

| Problem                      | What to do                                                                                         |
| ---------------------------- | -------------------------------------------------------------------------------------------------- |
| Project not found            | Check that the dev server is running, or specify its port as shown below.                          |
| Page tools missing           | Open the app in a browser and allow the Vite DevTools connection. Rediscover tools after a reload. |
| Field returns `found: false` | Check the target IDs, section ID, and field path.                                                  |
| Field is read-only           | Choose a field marked `editable: true`.                                                            |
| Value handle expired         | Read the state again to get a new handle, or use a field path.                                     |
| Response is too large        | Read a narrower field path if a single entry is too large.                                         |
| Edit result is uncertain     | Read the current value before retrying.                                                            |

To find a project by port:

```sh
npx @vue/devtools-agentic connect --port 5173 --base /__devtools/
```

## Connection and access

Vite DevTools manages discovery, the MCP endpoint, and authentication. The default host accepts callers on the same machine. The connector sends a bearer token when `DEVFRAME_MCP_AUTH_TOKEN` is set. See [Devframe MCP](https://devfra.me/adapters/mcp) for host configuration.

The Vue runtime connection opens on the first query and stays open until the page's tools are unregistered. Discovery alone does not open it.

Connected agents can read application state, including any private data it contains. As in the Vue DevTools panel, reading state may invoke application getters and plugin hooks.
