<script setup lang="ts">
import type { RouterRouteRecordSnapshot } from '@vue/devtools-kit'
import { Dropdown } from 'floating-vue'
import { Pane, Splitpanes } from 'splitpanes'
import { computed, ref, watch } from 'vue'
import { useDevtoolsClient } from '../composables/devtools-client'

interface RouteRow extends RouterRouteRecordSnapshot {
  id: string
}

const { error, getMatchedRoutes, navigateRoute, routerSnapshot, selectedAppId } =
  useDevtoolsClient()

const routeInput = ref('')
const matchedRoutes = ref<RouterRouteRecordSnapshot[]>([])
const selectedMeta = ref<Record<string, unknown>>()
const matching = ref(false)
const routeParamInputs = ref<Record<string, string[]>>({})

let matchTimer: ReturnType<typeof setTimeout> | undefined

const currentRoute = computed(() => routerSnapshot.value.currentRoute)
const currentPath = computed(() => currentRoute.value?.path ?? currentRoute.value?.fullPath ?? '')
const routes = computed<RouteRow[]>(() =>
  flattenRoutes(routerSnapshot.value.routes).sort((a, b) => a.path.localeCompare(b.path)),
)
const routeInputMatched = computed(() =>
  routeInput.value === currentRoute.value?.path ? [] : matchedRoutes.value,
)
const metaFieldVisible = computed(() => routes.value.some((route) => hasMeta(route)))

watch(
  [currentPath, selectedAppId],
  ([path]) => {
    routeInput.value = path || '/'
    matchedRoutes.value = []
    selectedMeta.value = undefined
  },
  { immediate: true },
)

watch(routeInput, (value) => {
  if (matchTimer) clearTimeout(matchTimer)

  if (value === currentRoute.value?.path) {
    matchedRoutes.value = []
    matching.value = false
    return
  }

  matching.value = true
  matchTimer = setTimeout(async () => {
    matchedRoutes.value = await getMatchedRoutes(value)
    matching.value = false
  }, 180)
})

async function navigate() {
  if (routeInputMatched.value.length) await navigateToRoute(routeInput.value)
}

async function navigateToRoute(path: string) {
  try {
    await navigateRoute(path)
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  }
}

function flattenRoutes(
  routesToFlatten: RouterRouteRecordSnapshot[],
  parentId = 'route',
): RouteRow[] {
  return routesToFlatten.flatMap((route, index) => {
    const id = `${parentId}:${index}:${route.path}`
    return [{ ...route, id }, ...flattenRoutes(route.children ?? [], id)]
  })
}

function routeMatches(
  matched: RouterRouteRecordSnapshot[],
  route: RouterRouteRecordSnapshot,
): boolean {
  return matched.some((item) =>
    item.name && route.name ? item.name === route.name : item.path === route.path,
  )
}

function hasMeta(route: RouterRouteRecordSnapshot): boolean {
  return !!route.meta && Object.keys(route.meta).length > 0
}

function metaToString(meta: Record<string, unknown> | undefined, indent = 0): string {
  if (!meta) return '-'
  const metaString = JSON.stringify(meta, null, indent)
  return metaString === '{}' ? '-' : metaString
}

function selectMeta(meta: Record<string, unknown> | undefined) {
  if (meta) selectedMeta.value = meta
}

function parseExpressRoute(path: string): string[] {
  return path.split(/(:\w+[?*+]?(?:\([^)]*\))?[?*+]?)/).filter(Boolean)
}

function hasRouteParams(route: RouterRouteRecordSnapshot): boolean {
  return route.path.includes(':')
}

function getRouteParts(route: RouterRouteRecordSnapshot): string[] {
  return parseExpressRoute(route.path)
}

function getRouteInput(route: RouteRow, index: number): string {
  return routeParamInputs.value[route.id]?.[index] ?? ''
}

function setRouteInput(route: RouteRow, index: number, value: string) {
  const inputs = [...(routeParamInputs.value[route.id] ?? [])]
  inputs[index] = value
  routeParamInputs.value = {
    ...routeParamInputs.value,
    [route.id]: inputs,
  }
}

function buildRoutePath(route: RouteRow): string {
  return getRouteParts(route)
    .map((part, index) => (isParamPart(part) ? getRouteInput(route, index) : part))
    .join('')
    .replace(/\/+/g, '/')
}

function getInputValue(event: Event): string {
  return event.target instanceof HTMLInputElement ? event.target.value : ''
}

function isParamPart(part: string): boolean {
  return part[0] === ':'
}
</script>

<template>
  <div class="block h-full overflow-auto">
    <div class="h-full grid grid-rows-[auto_1fr]">
      <div class="border-b border-base px-4 py-3 flex flex-col gap-1">
        <div>
          <span class="op50">Current route</span>
        </div>

        <div
          class="group relative min-w-0 flex items-center justify-between gap-0.5 overflow-hidden rounded-1 border border-primary-100 px-3 py-0.75 color-base dark:border-gray-700"
          :class="
            routeInput === currentRoute?.path
              ? ''
              : routeInputMatched.length
                ? 'text-green!'
                : 'text-orange!'
          "
        >
          <span
            class="i-carbon-direction-right-01 shrink-0 scale-y--100 color-gray-500 dark:color-gray-300"
            aria-hidden="true"
          />
          <input
            v-model="routeInput"
            class="w-full border-0 bg-transparent color-inherit outline-none placeholder-color-gray-500 dark:placeholder-gray-300"
            type="text"
            placeholder="/"
            @keydown.enter="navigate"
          />
        </div>

        <div>
          <template v-if="currentRoute?.path !== routeInput">
            <span>Press <b class="font-bold">Enter</b> to navigate</span>
            <span v-if="!matching && !routeInputMatched.length" class="text-orange op75">
              (no match)
            </span>
          </template>
          <template v-else>
            <span class="op50">Edit path above to navigate</span>
          </template>
        </div>
      </div>

      <Splitpanes class="overflow-hidden">
        <Pane size="70" class="overflow-auto!">
          <details open>
            <summary class="cursor-pointer select-none p-4 hover:bg-active">
              <div class="flex items-start gap-2 text-xl transition op100">
                <span class="i-carbon-tree-view-alt shrink-0 text-xl" aria-hidden="true" />
                <div>
                  <div class="text-base">All Routes</div>
                  <div class="text-sm op50">
                    {{ routes.length }} routes registered in your application
                  </div>
                </div>
                <div class="flex-auto" />
                <span
                  class="chevron i-carbon-chevron-down place-self-start cursor-pointer text-base op75 transition duration-500"
                  aria-hidden="true"
                />
              </div>
            </summary>

            <div class="mt-1 flex flex-col gap-2 pb-6 pt-2">
              <table v-if="routes.length" class="w-full">
                <thead class="border-b border-base px-3">
                  <tr>
                    <th class="text-left" />
                    <th class="text-left">Route Path</th>
                    <th class="text-left">Name</th>
                    <th v-if="metaFieldVisible" class="text-left">Route Meta</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="item in routes"
                    :key="item.id"
                    class="group h-7 border-b border-dashed border-transparent hover:border-base"
                  >
                    <td class="w-20 pr-1">
                      <div class="flex items-center justify-end">
                        <span
                          v-if="routeMatches(currentRoute?.matched ?? [], item)"
                          class="rounded-1 bg-green-400/10 px-1.5 py-0.25 text-11px text-green-400"
                          title="active"
                        >
                          active
                        </span>
                        <span
                          v-else-if="routeMatches(routeInputMatched, item)"
                          class="rounded-1 bg-teal-400/10 px-1.5 py-0.25 text-11px text-teal-400"
                          title="next"
                        >
                          next
                        </span>
                      </div>
                    </td>

                    <td class="text-sm">
                      <div class="inline-flex items-center gap-3">
                        <button
                          v-if="!hasRouteParams(item)"
                          class="border-0 bg-transparent p-0 color-inherit font-mono"
                          :class="
                            routeMatches(currentRoute?.matched ?? [], item)
                              ? 'text-primary-400'
                              : routeMatches(routeInputMatched, item)
                                ? 'text-teal'
                                : ''
                          "
                          type="button"
                          @click="navigateToRoute(item.path)"
                        >
                          <code>{{ item.path }}</code>
                        </button>

                        <Dropdown v-else>
                          <code
                            class="block cursor-pointer font-mono"
                            :class="
                              routeMatches(currentRoute?.matched ?? [], item)
                                ? 'text-primary-400'
                                : routeMatches(routeInputMatched, item)
                                  ? 'text-teal'
                                  : ''
                            "
                          >
                            <span
                              v-for="(part, index) in getRouteParts(item)"
                              :key="`${item.id}-${index}-${part}`"
                              :class="
                                isParamPart(part)
                                  ? 'rounded-1 border border-dashed border-gray/50 px-1 text-gray'
                                  : ''
                              "
                            >
                              {{ isParamPart(part) ? part.slice(1) : part }}
                            </span>
                          </code>

                          <template #popper="{ hide }">
                            <div class="p-2">
                              <form
                                class="flex flex-col"
                                @submit.prevent="
                                  () => {
                                    navigateToRoute(buildRoutePath(item))
                                    hide()
                                  }
                                "
                              >
                                <div class="px-2 text-sm op50">Fill params and navigate:</div>
                                <div class="flex items-center p-2 font-mono text-sm">
                                  <template
                                    v-for="(part, index) in getRouteParts(item)"
                                    :key="`${item.id}-input-${index}-${part}`"
                                  >
                                    <input
                                      v-if="isParamPart(part)"
                                      class="w-20 rounded-1 border border-primary-100 bg-transparent px-2 py-0.75 color-inherit outline-none dark:border-gray-700"
                                      :placeholder="part.slice(1)"
                                      :value="getRouteInput(item, index)"
                                      @input="setRouteInput(item, index, getInputValue($event))"
                                    />
                                    <span v-else>{{ part }}</span>
                                  </template>
                                </div>
                                <button
                                  class="block rounded-1 border border-primary-500/40 bg-primary-500/12 px-3 py-1 text-primary-500 hover:bg-primary-500/18"
                                  type="submit"
                                >
                                  Navigate
                                </button>
                              </form>
                            </div>
                          </template>
                        </Dropdown>
                      </div>
                    </td>

                    <td class="w-0 whitespace-nowrap pr-1 text-left font-mono text-sm op50">
                      {{ item.name ?? '-' }}
                    </td>

                    <td
                      v-if="metaFieldVisible"
                      class="w-50 whitespace-nowrap pr-1 text-left font-mono text-sm op50 hover:text-primary hover:op100"
                    >
                      <span
                        class="inline-block w-50 cursor-pointer overflow-hidden text-ellipsis"
                        :title="metaToString(item.meta, 2)"
                        @click="selectMeta(item.meta)"
                      >
                        {{ metaToString(item.meta) }}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>

              <div v-else class="px-4 py-8 text-center color-muted">No routes</div>
            </div>
          </details>
          <div class="border-b border-base" />
        </Pane>

        <Pane v-if="selectedMeta" size="30" class="overflow-auto!">
          <div class="p-2">
            <div class="flex items-center justify-between">
              <span class="font-500">Route meta detail</span>
              <button
                v-tooltip.bottom="'Close route meta detail'"
                class="i-carbon-close cursor-pointer border-0 bg-transparent p-1 color-muted hover:color-base"
                type="button"
                aria-label="Close route meta detail"
                @click="selectedMeta = undefined"
              />
            </div>
            <pre
              class="m-0 mt-2 overflow-auto rounded-1 border border-base bg-active p-3 font-state-field text-12px leading-5"
            ><code>{{ JSON.stringify(selectedMeta, null, 2) }}</code></pre>
          </div>
        </Pane>
      </Splitpanes>
    </div>
  </div>
</template>

<style scoped>
details {
  border: none;
}

summary {
  border: none;
  list-style: none;
}

details summary::-webkit-details-marker {
  display: none;
}

details[open] .chevron {
  transform: rotate(180deg);
  opacity: 0.75;
}
</style>
