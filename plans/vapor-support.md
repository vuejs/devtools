# Vue Vapor support plan

Target: Vue `3.6.0-rc.14` (`@vue/runtime-vapor`; test alias and `playground/vapor`), devtools v9 (`feat/vapor-support`).
Playground: `playground/vapor` (`pnpm play:vapor`) — a pure `createVaporApp` tree and a
`createApp` + `vaporInteropPlugin` mixed tree.

## 1. Where we are

Nothing in the devtools source handles Vapor. Every component-structure read in
`packages/kit` goes through VDOM fields (`subTree`, `vnode`, `vnode.el`,
`__vueParentComponent`). Vapor instances have none of these.

### What Vue 3.6 gives us

| Signal                     | Vapor behaviour                                                            | Source                                               |
| -------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------- |
| `app:init` / `app:unmount` | Fired; `app._instance` = root `VaporComponentInstance`, `app.vapor = true` | runtime-vapor `createVaporApp` → core `createAppAPI` |
| `component:added`          | Mount (core#16027) and VaporKeepAlive activate/deactivate                  | runtime-vapor `mountComponent`, KeepAlive            |
| `component:updated`        | **Never** for Vapor instances                                              | —                                                    |
| `component:removed`        | Unmount of mounted instances (core#16027); not on KeepAlive deactivation   | runtime-vapor `unmountComponent`                     |
| `component:emit`           | Fired, payload instance is the Vapor instance                              | core `baseEmit`                                      |
| `perf:start/end`           | Phases `init`, `mount`, `renderEffect` (new). No `render`/`patch`          | core `startMeasure`                                  |
| DOM → instance             | **None.** No `__vueParentComponent` / `__vnode` on Vapor-rendered nodes    | —                                                    |

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
| Tree liveness                                                     | `runtime/runtime.ts`, `hook/normalize.ts` rely on add/update/remove   | Fixed by core#16027 (Phase 2); no `component:updated`           |
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
- [x] Add a `vue@3.6.0-rc.14` devDependency for tests only (alias, e.g. `vue-3.6`), so the
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

### Phase 2 — Tree liveness

- [x] Upstream: runtime-vapor `mountComponent` / `unmountComponent` now emit
      `component:added` / `component:removed`
      ([vuejs/core#16027](https://github.com/vuejs/core/pull/16027)). Interop mounts go
      through the same functions, so each instance is reported once. Kept-alive
      deactivation is not reported as removed; an async setup unmounted before it
      resolves is never reported.
- [x] The kit's existing `component:add` / `component:remove` handling covers Vapor; no
      re-walk, polling, or Vapor-specific liveness code.
      Test: `tests/integration/runtime/vapor-tree-hooks.test.ts`.
- [x] Children inserted into an element (`<div><Child /></div>`, the usual SFC shape) are
      not reachable from the parent's `block`, and on first mount their `component:added`
      fires before `app:init`, so they were dropped and missing from the tree. The hook
      records `instance.parent → instance` for every `component:added` / `removed`,
      whether or not the app is registered yet, and `RuntimeRegistry.getInstanceChildren`
      merges those children with the block walk. Tests: `vapor-tree-hooks.test.ts`, `vapor-picker.test.ts`.
- Vapor never emits `component:updated` (no component-level re-render). Child ordering
  after a `v-for` reorder is covered in Phase 3.

### Phase 3 — DOM: bounds, highlight, scroll, ordering

- [x] `getRootNodesFromInstance`: if Vapor, `collectBlockNodes(instance.block)`:
  - `Node` → itself
  - Vapor instance → recurse into its `block`
  - array → flatten
  - teleport fragment → `nodes` (target side), same as VDOM teleported roots
  - fragment → `nodes`, ignore comment anchors for bounds
  - interop fragment → existing `getRootNodesFromVNode(frag.vnode)`
- [x] Reuse the existing `isVisibleRootNode` filter so anchors (`<!--if-->`, empty text)
      are skipped. Empty text is dropped on the Vapor path only.
- [x] `readComponentDomOrder` then works unchanged.
- [x] Regression: `v-for` reorder ordering. Before this phase `readComponentDomOrder` returned
      `[-1]` for every Vapor instance, so siblings sorted by id. Repro: a Vapor `Root` renders
      `createFor(() => items.value, () => createComponent(Item), item => item)`, then
      `items.value` goes `['a', 'b', 'c']` → `['c', 'b', 'a']`:

      | | live (client applies patches) | `components.snapshot()` |
      | --- | --- | --- |
      | VDOM | `a b c` | `c b a` |
      | Vapor | `a b c` | `c b a` (was `a b c` before this phase) |

      - Snapshot order: Vapor-specific, caused by the missing Vapor root nodes above.
        Covered by the reorder case in `vapor-tree-hooks.test.ts`.
      - Live order: not Vapor-specific. `applyComponentTreePatches` ignores `domOrder`,
        and the kit only refreshes the updated parent, not its children's `domOrder`,
        so VDOM is stale too until the next snapshot. Fixed for VDOM in a separate PR
        (`fix/component-tree-live-order`); the Vapor trigger is a Phase 6 item.

### Phase 4 — Element picker

Vapor nodes have no back-reference.

- [x] `VaporNodeOwnerIndex` in `component-inspector.ts`: a `WeakMap<Node, VaporInstance>`
      built by walking every registered app from `rootInstance` with
      `RuntimeRegistry.getInstanceChildren`, so Vapor components under a VDOM root are covered.
      Each Vapor instance maps the nodes its own block renders (not those of child
      instances or interop VNodes); nested elements resolve by walking `parentNode`.
- [x] `findComponentRecordFromTarget`: each ancestor checks `__vueParentComponent`, then
      the index; first hit wins.
- [x] Freshness: Vapor `v-if` / `v-for` swap nodes without any devtools event, so the
      index is rebuilt on hover lookups when older than 250 ms, and always on click so a
      node mounted after the last hover resolves to its own component. Not yet measured
      on a large `v-for`. Test: `tests/integration/runtime/vapor-picker.test.ts`.
- Slot content maps to the component rendering the slot outlet, same as VDOM
  (`__vueParentComponent` is the outlet owner).
- [ ] Teleported content. It lives in the target, outside `block`, and nothing on the
      instance points to the teleport (teleports emit no devtools hook), so it is not
      indexed when the teleport is inserted into an element (`TeleportNotice.vue`).
      Waiting on [vuejs/core#16142](https://github.com/vuejs/core/pull/16142), which adds a
      dev-only `instance.teleports: Set<TeleportFragment>`. Follow-up once it lands:
  - In `VaporNodeOwnerIndex.build`, map each `instance.teleports` fragment's `nodes` to
    the instance; skip when the field is missing (Vue before the fix).
  - Bump the test alias and `playground/vapor` to the Vue release that includes it, and
    add a picker test for a teleport inside an element.
  - Consider reading `instance.teleports` for the `teleport` tree tag as well, which today
    only appears when the teleport is a block root.

### Phase 5 — State inspector

- [x] `setup`: works as-is on a dev-mode SFC (`setup` returns bindings, template compiled
      to `render`), so `devtoolsRawSetupState` / `setupState` are set.
- [ ] Production-devtools builds inline the template into `setup`, so there is no setup
      state. Show an explanatory empty state instead of an empty panel.
- [x] `props`: read-only for Vapor (`editable: false`), and `edit` / `add` / `delete` on
      `props` return `false`, since the props proxy ignores writes. Nested values are
      read-only too; edit them on the owning parent.
- [x] `attrs`, `refs`, `provides`: unchanged. `isComponentInstanceLike` already matches
      Vapor instances (`uid` + `type`), so `refs` encode as components.
- [x] `listeners`: Vapor reads `on[A-Z]` keys from `instance.rawValues` (delivered inputs,
      `v-bind="obj"` merged in), checked against `type.emits`. Before delivery it falls back
      to `rawProps` and `rawProps.$`, reading a function source only through the cached
      `_value` of its `_cache`; devtools never calls user getters.
- [x] `data`, options `computed`, `inject`: empty on Vapor, and empty sections are already
      dropped. No Vapor-specific code.
      Test: `tests/integration/runtime/vapor-state.test.ts`.
- [ ] Reactivity graph: classify Vapor render effects (`RenderEffect` constructor; read
      `effect.i` / owning instance). Already gated on `>= 3.6.0`.
- [ ] Computed recompute: `collectLiveComputedRefs` should also scan
      `instance.scope.effects` (already present) and `instance.renderEffects` (dev).

### Phase 6 — Timeline & performance

- [x] `renderEffect` perf phase on a mounted Vapor instance (`isVaporUpdateMeasure` in
      `runtime/vapor.ts`) counts as an update: it sets `lastUpdateMs` and flashes in
      `update-highlight`, same as `patch`. The first render runs before `isMounted` and is
      ignored. Test: `tests/unit/runtime/update-highlight.test.ts`.
- [x] Emits timeline: works as-is. Vapor `emit` goes through core `baseEmit`, which fires
      `component:emit` with the Vapor instance. Test: the emits case in `vapor-tree-hooks.test.ts`.
- [x] Live `v-for` reorder for Vapor. Vapor never emits `component:updated`, so the runtime
      turns the same `perf:end` into a `component:update` for that instance. It goes
      through the VDOM path: debounced with `updateDebounceMs`, skipped unless visible,
      and the child `domOrder` refresh from #1184 runs only when the instance is expanded.
      Test: the live reorder case in `vapor-tree-hooks.test.ts`.
- Perf hooks fire in dev and with `__VUE_PROD_DEVTOOLS__`, regardless of
  `app.config.performance`.

### Phase 7 — Client / UI

- [ ] "Vapor" badge on app selector and component nodes (`record.vapor`).
- [ ] Disable edit affordances for Vapor props; hide data/computed/inject sections.
- [ ] Docs: a Vapor section listing supported features and limitations.

## 4. Testing

- [ ] **Unit fixtures** (`tests/fixtures/runtime.ts`): add `createVaporTreeFixture` building
      fake `{ vapor: true, uid, type, parent, block }` instances with fragments
      (`__vf` bits), teleport, KeepAlive `__v_cache`, and interop fragments.
- [ ] **Integration** (happy-dom, real `vue@3.6.0-rc.14` via the test alias):
      `createVaporApp` and `createApp + vaporInteropPlugin` with `setDevtoolsHook`;
      assert tree shape, `v-if` toggle / `v-for` add/remove reflected after a refresh,
      bounds non-empty, picker resolves Vapor nodes, setup state readable, props read-only.
- [ ] **Manual**: `pnpm play:vapor` against every scenario in the playground.

## 5. Open questions

1. ~~Is periodic polling acceptable for HMR/unmount detection, or should we push upstream
   for proper `component:added/removed` events first?~~ Resolved upstream in core#16027.
2. Production-devtools Vapor builds have no setup state — acceptable limitation?
3. Should interop wrapper uids / `VaporAsyncComponentWrapper` be hidden by default?
4. Vue 3.6 is still RC: re-verify field names (`__vf` bits, `block`, `pendingBlock`,
   `$key`) at 3.6.0 final.
5. Not investigated yet: `VaporTransition`, `VaporTransitionGroup`, Vapor custom elements
   (`VaporElement`), SSR hydration.

## 6. Suggested order

Phase 0 → 1 → 3 (visible value: tree + highlight) → 2 (liveness) → 4 (picker) →
5 → 6 → 7. Each phase lands with its tests.
