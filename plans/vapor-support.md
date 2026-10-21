# Vue Vapor support plan

Target: Vue `3.6.0-rc.5` (`@vue/runtime-vapor`), devtools v9 (`feat/vapor-support`).
Playground: `playground/vapor` (`pnpm play:vapor`) — a pure `createVaporApp` tree and a
`createApp` + `vaporInteropPlugin` mixed tree.

## 1. Where we are

Nothing in the devtools source handles Vapor. Every component-structure read in
`packages/kit` goes through VDOM fields (`subTree`, `vnode`, `vnode.el`,
`__vueParentComponent`). Vapor instances have none of these.

### What Vue 3.6 gives us

| Signal                     | Vapor behaviour                                                                                                             | Source                                               |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `app:init` / `app:unmount` | Fired; `app._instance` = root `VaporComponentInstance`, `app.vapor = true`                                                  | runtime-vapor `createVaporApp` → core `createAppAPI` |
| `component:added`          | **Only** on VaporKeepAlive activate/deactivate                                                                              | runtime-vapor `activate$1`/`deactivate$1`            |
| `component:updated`        | **Never** for Vapor instances                                                                                               | —                                                    |
| `component:removed`        | **Never** for Vapor instances (also not for Vapor children of VDOM parents: core returns before `devtoolsComponentRemoved`) | core `unmountComponent`                              |
| `component:emit`           | Fired, payload instance is the Vapor instance                                                                               | core `baseEmit`                                      |
| `perf:start/end`           | Phases `init`, `mount`, `renderEffect` (new). No `render`/`patch`                                                           | core `startMeasure`                                  |
| DOM → instance             | **None.** No `__vueParentComponent` / `__vnode` on Vapor-rendered nodes                                                     | —                                                    |

### Vapor instance shape (what we can read)

- `instance.vapor === true` identifies it (core types: `GenericComponentInstance.vapor?`).
  Component definitions carry `type.__vapor === true`.
- Same as VDOM: `uid` (shared counter), `type` (`name`/`__name`/`__file`), `parent`,
  `root`, `appContext`, `provides`, `props`, `attrs`, `refs`, `slots`, `emitsOptions`,
  `propsOptions`, `exposed`, `scope`, `isMounted`/`isUnmounted`/`isDeactivated`,
  `suspense`, lifecycle hook arrays.
- `setupState` / `devtoolsRawSetupState`: set only when the component has a separate
  `render`. **Dev server: yes** (plugin-vue disables inline templates in dev).
  Production + `__VUE_PROD_DEVTOOLS__`: no (template is inlined into `setup`).
- `props` is a lazy read-only proxy over `rawProps` getters — writes warn and are ignored.
- Missing: `vnode`, `subTree`, `proxy`, `ctx` (except VaporKeepAlive), `render`, `effect`,
  `update`, `data`, `renderContext`.
- Rendered output is `instance.block`:
  `Block = Node | VaporComponentInstance | VaporFragment | Block[]`.

### Block / fragment model (duck-typed — helpers are not exported)

Fragments have `nodes` and a bit field `__vf`:

| bit     | kind                                                         | walk                                                             |
| ------- | ------------------------------------------------------------ | ---------------------------------------------------------------- |
| 1       | `VaporFragment`                                              | `nodes`, `anchor`                                                |
| 2       | `DynamicFragment` (`v-if`, `<component :is>`, async wrapper) | `nodes`, `anchor` (dev comment label)                            |
| 4 / 128 | slot fragment / slot outlet                                  | `nodes`; owner is `slotOwner` / `renderInstance`                 |
| 8       | `ForFragment`                                                | `nodes[0]` = `ForBlock[]`                                        |
| 16      | `ForBlock`                                                   | `nodes`, `key`                                                   |
| 32      | `TeleportFragment`                                           | `nodes` live in `target`; `placeholder` + `anchor` stay in place |
| 64      | interop fragment (VDOM inside Vapor)                         | `vnode` → `vnode.component` is a normal VDOM instance            |

- KeepAlive: `VaporKeepAlive` instance has `__v_cache: Map<key, VaporComponentInstance | interopFragment>` — same field name as VDOM KeepAlive.
- Teleport: not a component instance, only a `TeleportFragment`.
- Async: wrapper `VaporAsyncComponentWrapper` (`__asyncLoader`) whose block holds the inner instance.
- VDOM parent → Vapor child: `vnode.component` is the `VaporComponentInstance`; `vnode.el` is the single root or an empty text anchor.
- Vapor parent → VDOM child: interop fragment, `frag.vnode.component`. A hidden wrapper `VaporComponentInstance` lives on `vnode.vi` and must be ignored.

## 2. Breakage inventory in v9

| Feature                                                           | Code                                                                  | Vapor result today                                              |
| ----------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------- |
| Tree children / `childCount` / search / expand / paging           | `kit/src/runtime/registry.ts:585-626`, `:377-416`                     | Vapor nodes are leaves; nothing below them                      |
| Root DOM, bounds, highlight, scroll-to, Inspect DOM, update flash | `kit/src/runtime/component-inspector.ts:398-451`                      | No DOM found; "element not available"                           |
| Sibling ordering                                                  | `registry.ts:551-583` (`readComponentDomOrder`)                       | Always `[-1]`                                                   |
| Element picker                                                    | `component-inspector.ts:260-306` (`__vueParentComponent`)             | Clicking Vapor DOM selects the nearest VDOM ancestor or nothing |
| Fragment flag / render key                                        | `registry.ts:484-511` (`subTree.type`, `vnode.key`)                   | Never shown                                                     |
| Listeners section                                                 | `kit/src/runtime/state/sections.ts:105-110` (`vnode.props`)           | Empty                                                           |
| Data / options computed / inject                                  | `sections.ts`, `state/computed.ts` (`proxy`, `ctx`, `data`, `effect`) | Empty (expected: Vapor is Composition-API-only)                 |
| Props editing                                                     | `state/edit.ts` writes `instance.props`                               | Silently ignored (warns in console)                             |
| Tree liveness                                                     | `runtime/runtime.ts`, `hook/normalize.ts` rely on add/update/remove   | Mounts/unmounts/HMR never reported                              |
| Update flash / timing                                             | `runtime/update-highlight.ts:51-83` (`patch` phase)                   | No update flashes for Vapor                                     |
| Render code                                                       | `component-inspector.ts:173-183`                                      | Works for dev (`type.render`)                                   |
| Name / file / open-in-editor / emits timeline / perf mount        | —                                                                     | Should already work                                             |

Packages outside `kit` (vite, chrome, client, agent) do not read instances and need no changes.

## 3. Plan

Tick each item when it lands. Phase 0 landed in #1174.

### Phase 0 — Groundwork

- [x] Add `packages/kit/src/runtime/vapor.ts` with duck-typed guards and constants:
      `isVaporInstance(i)` (`i.vapor === true`), `isVaporFragment(b)` (`__vf` number +
      `nodes`), `VF` bit constants, `isInteropFragment`, `isTeleportFragment`, `isForFragment`.
      Do not import `@vue/runtime-vapor` — kit must keep working with Vue 3.5.
- [x] Detect Vapor apps in `addApp` (`app.vapor === true`) and store `record.vapor`
      for UI badges and diagnostics.
- [x] Add a `vue@3.6.0-rc.5` devDependency for tests only (alias, e.g. `vue-3.6`), so the
      existing 3.5 tests are untouched.

### Phase 1 — Component tree (core feature)

- [x] Generalise `getInternalInstanceChildren(instance)`:
  - VDOM: unchanged (`subTree`).
  - Vapor: `walkBlockForChildren(instance.block)`:
    - `Node` → skip
    - Vapor instance → child (stop)
    - array → recurse
    - fragment with bit 64 → `getInternalInstanceChildrenFromVNode(frag.vnode)`
    - other fragment → recurse `nodes` (teleport included)
    - pending suspense → `instance.pendingBlock` if present
- [x] In `getInternalInstanceChildrenFromVNode`, a `vnode.component` that is Vapor already
      works (it's returned as the child) — the Vapor walk above then descends from it.
- [x] Skip the interop wrapper on `vnode.vi`; collapse `VaporAsyncComponentWrapper` the same
      way VDOM async wrappers are treated. Nothing needed: `vnode.vi` is a factory function, so
      the wrapper is never reached, and VDOM does not collapse async wrappers either.
- [x] KeepAlive: relax `isKeepAlive` to accept `type.__isKeepAlive` on Vapor instances;
      for cache entries use `entry.vapor ? entry : entry.vnode?.component`.
- [x] Fragment flag for Vapor: `Array.isArray(block)` or a multi-node fragment root.
      Render key: `instance.$key` if present. `v-for` keys live on the `ForBlock`, so the
      walk passes them down as `WalkedComponentChild.renderKey`.
- [x] Tags: add `teleport` tag for children found under a teleport fragment, and
      `v-for`/`v-if` are not shown (same as VDOM).

### Phase 2 — Tree liveness (no add/remove events)

Vapor gives no lifecycle events, so the tree must be refreshed by re-walking.

- [ ] When an app is Vapor or has interop enabled (`app._context.vapor`), mark it
      `walkOnly`. Snapshots/expands already call `refreshComponentTree`; make
      `refreshChild` / `getComponentChildren` treat records whose instance is
      `isUnmounted` as removed and emit removal patches.
- [ ] Triggers for re-walking expanded/visible subtrees, debounced per app:
  - `perf:end` with phase `mount` or `renderEffect` for any instance in the app
    (dev only; gives near-real-time updates since `v-if`/`v-for` changes run render effects),
  - `component:emit`,
  - `component:added` from KeepAlive,
  - HMR: `__VUE_HMR_RUNTIME__` is not hooked; fall back to a low-frequency poll
    (e.g. 1 s) while the Components tab is open.
- [ ] Garbage-collect records whose instance has `isUnmounted === true` during the walk.
- [ ] Upstream ask (optional, parallel): propose `devtoolsComponentAdded/Removed` calls in
      runtime-vapor `mountComponent`/`unmountComponent`. Keep the walker as fallback.

### Phase 3 — DOM: bounds, highlight, scroll, ordering

- [ ] `getRootNodesFromInstance`: if Vapor, `collectBlockNodes(instance.block)`:
  - `Node` → itself
  - Vapor instance → recurse into its `block`
  - array → flatten
  - teleport fragment → `nodes` (target side) only for bounds; `placeholder` for ordering
  - fragment → `nodes`, ignore comment anchors for bounds
  - interop fragment → existing `getRootNodesFromVNode(frag.vnode)`
- [ ] Reuse the existing `isVisibleRootNode` filter so anchors (`<!--if-->`, empty text)
      are skipped.
- [ ] `readComponentDomOrder` then works unchanged.

### Phase 4 — Element picker

Vapor nodes have no back-reference.

- [ ] Build `WeakMap<Node, VaporInstance>` lazily: when the picker starts (and on refresh),
      walk every registered Vapor app from `app._instance` with `collectBlockNodes`,
      mapping each node to its **innermost** owning instance.
- [ ] `findComponentRecordFromTarget`: walk `parentNode` upward checking
      `__vueParentComponent` **or** the map; first hit wins.
- [ ] Rebuild the map on picker start and after Phase 2 refreshes; it is cheap enough for
      playground-scale trees, measure on a large `v-for`.

### Phase 5 — State inspector

- [ ] `setup`: already reads `devtoolsRawSetupState` / `setupState` — verify on Vapor (dev).
      For production-devtools builds, show an explanatory empty state
      ("setup state not available in production Vapor builds").
- [ ] `props`: read via `instance.props`; mark **read-only** for Vapor (`editable: false`).
      Meta from `instance.propsOptions` / `type.props`.
- [ ] `attrs`, `refs`, `provides`: unchanged. `refs` may contain Vapor instances —
      extend `codec/encode.ts:isComponentInstanceLike` to accept `vapor === true` and
      encode as `{ kind: 'component' }`.
- [ ] `listeners`: for Vapor read `instance.rawProps` keys matching `on[A-Z]` (and `$`
      dynamic sources), combined with `emitsOptions`.
- [ ] Skip `data`, options `computed`, `inject` for Vapor (no Options API) — return no section.
- [ ] Reactivity graph: classify Vapor render effects (`RenderEffect` constructor; read
      `effect.i` / owning instance). Already gated on `>= 3.6.0`.
- [ ] Computed recompute: `collectLiveComputedRefs` should also scan
      `instance.scope.effects` (already present) and `instance.renderEffects` (dev).

### Phase 6 — Timeline & performance

- [ ] Accept the `renderEffect` perf phase: map it to "update" for timing and
      `update-highlight` flashes (currently keyed on `patch`).
- [ ] Emits timeline: verify — should work as-is.

### Phase 7 — Client / UI

- [ ] "Vapor" badge on app selector and component nodes (`record.vapor`).
- [ ] Disable edit affordances for Vapor props; hide data/computed/inject sections.
- [ ] Docs: a Vapor section listing supported features and limitations.

## 4. Testing

- [ ] **Unit fixtures** (`tests/fixtures/runtime.ts`): add `createVaporTreeFixture` building
      fake `{ vapor: true, uid, type, parent, block }` instances with fragments
      (`__vf` bits), teleport, KeepAlive `__v_cache`, and interop fragments.
- [ ] **Integration** (happy-dom, real `vue@3.6.0-rc.5` via the test alias):
      `createVaporApp` and `createApp + vaporInteropPlugin` with `setDevtoolsHook`;
      assert tree shape, `v-if` toggle / `v-for` add/remove reflected after a refresh,
      bounds non-empty, picker resolves Vapor nodes, setup state readable, props read-only.
- [ ] **Manual**: `pnpm play:vapor` against every scenario in the playground.

## 5. Open questions

1. Is periodic polling acceptable for HMR/unmount detection, or should we push upstream
   for proper `component:added/removed` events first?
2. Production-devtools Vapor builds have no setup state — acceptable limitation?
3. Should interop wrapper uids / `VaporAsyncComponentWrapper` be hidden by default?
4. Vue 3.6 is still RC: re-verify field names (`__vf` bits, `block`, `pendingBlock`,
   `$key`) at 3.6.0 final.
5. Not investigated yet: `VaporTransition`, `VaporTransitionGroup`, Vapor custom elements
   (`VaporElement`), SSR hydration.

## 6. Suggested order

Phase 0 → 1 → 3 (visible value: tree + highlight) → 2 (liveness) → 4 (picker) →
5 → 6 → 7. Each phase lands with its tests.
