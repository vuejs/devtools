# Vue tracer follow-up tasks

This checklist tracks compatibility, tooling, and documentation work following the tracer integration.

- [ ] **Vapor support**: Investigation confirmed that source positions can be injected through compiler `nodeTransforms`, configured via `@vitejs/plugin-vue`'s `api.options`, and the equivalent `compiler-vapor` extension point; first decide whether `data-source` attributes on DOM elements are acceptable. Handle edits outside the template that shift source positions without triggering template recompilation during HMR, and define coordinate mapping for external templates and preprocessors.
- [ ] **Agent element tracing**: Add a read-only `trace_element` tool in `packages/agent/src/mcp/tools.ts`, defining how elements are selected, the source position result shape, and the result when no mapping exists.
- [ ] **Shadow DOM lookup**: When source information exists only on the shadow host, `getElementPosition` does not cross the shadow boundary to find it. Define how lookup should traverse that boundary and add test coverage.
- [ ] **Stable dock exclusion marker**: Dock detection relies on hub-ui's internal `devframes-dock-embedded` tag and will break if it is renamed upstream. Consider requesting a stable ignore marker from Vite DevTools to replace the internal tag check.
- [ ] **Toggle state after HMR**: The dock toggle may remain active after HMR. Check state synchronization during disposal and registration, and cover toggling after a hot update.
- [ ] **Upstream migration coordination**: Coordinate with antfu on migrating `vite-plugin-vue-tracer` and switching Nuxt DevTools to `@vue/devtools-tracer`, including API compatibility requirements and migration steps.
- [ ] **Usage documentation**: Document standalone tracer usage and the built-in Vue DevTools integration under `docs/`, including current limitations and applicable hosts.
