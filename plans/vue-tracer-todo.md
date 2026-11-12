# Vue tracer follow-up tasks

This checklist tracks compatibility, tooling, and documentation work following the tracer integration.

- [x] **Vapor support**: Native DOM elements in inline HTML templates receive `data-v-source` attributes before compilation, consistently for SSR and client. External templates and non-HTML preprocessors are skipped. Style-only, whitespace, or comment edits can leave line numbers stale until the page is refreshed.
- [x] **Agent element tracing**: Add a read-only `trace-element` tool in `packages/agent/src/mcp/tools.ts`, defining how elements are selected, the source position result shape, and the result when no mapping exists.
- [x] **Shadow DOM lookup**: Source lookup crosses shadow roots to their hosts, including nested boundaries, while preferring nearer internal records. VNode and DOM attribute sources and composed-path pointer handling are covered by tests.
- [ ] **Stable dock exclusion marker**: Dock detection relies on hub-ui's internal `devframes-dock-embedded` tag and will break if it is renamed upstream. Consider requesting a stable ignore marker from Vite DevTools to replace the internal tag check.
- [x] **Toggle state after HMR**: The dock toggle may remain active after HMR. Check state synchronization during disposal and registration, and cover toggling after a hot update.
- [ ] **Upstream migration coordination**: Coordinate with antfu on migrating `vite-plugin-vue-tracer` and switching Nuxt DevTools to `@vue/devtools-tracer`, accounting for the options that now differ from upstream and the required migration steps.
- [x] **Usage documentation**: Standalone tracer usage, the built-in Vue DevTools integration, applicable hosts, and current limitations are documented in `docs/guide/tracer.md`.
- [ ] **Shared picker/overlay primitives**: kit's component inspector and the tracer each implement their own page listeners and overlay. Consider extracting Vue-free DOM primitives into `@vue/devtools-tracer/client/dom` for both to use, keeping component lookup in kit and source matching in the tracer. Open questions: highlight styles, optional tracer peers, and Chrome extension bundling.
