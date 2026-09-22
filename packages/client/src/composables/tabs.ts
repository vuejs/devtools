import type { ComputedRef } from 'vue'
import type { DevtoolsTab, DevtoolsTabId } from '../types/tab'
import type { CustomInspectorSnapshot, PluginSnapshot } from './devtools-client'
import { computed } from 'vue'
import { builtinTabs } from '../constants/tabs'
import { useDevtoolsClient } from './devtools-client'
import { useDevtoolsSettings } from './settings'
import {
  findRouterInspector,
  getPluginTitle,
  isInternalCustomInspector,
  isRouterInspectorId,
} from '../utils/inspectors'

export interface DevtoolsTabCategory {
  name: string
  hidden: boolean
}

export interface CategorizedDevtoolsTab extends DevtoolsTab {
  hidden: boolean
}

export type CategorizedDevtoolsTabs = [DevtoolsTabCategory, CategorizedDevtoolsTab[]][]

export function useDevtoolsTabCatalog() {
  const { inspectors, plugins, reactivityGraphEnabled } = useDevtoolsClient()
  const { settings } = useDevtoolsSettings()
  const routerInspector = computed(() => findRouterInspector(inspectors.value, plugins.value))

  const tabs = computed<DevtoolsTab[]>(() => {
    const visibleInspectors = inspectors.value.filter(
      (inspector) =>
        (!isRouterInspectorId(inspector.id) || inspector.id === routerInspector.value?.id) &&
        !isInternalCustomInspector(inspector),
    )

    return [
      ...builtinTabs.flatMap((tab) =>
        resolveBuiltinTab(tab, {
          reactivityGraphEnabled: reactivityGraphEnabled.value,
        }),
      ),
      ...visibleInspectors.map((inspector, index) =>
        createInspectorTab(inspector, index, plugins.value),
      ),
    ].sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))
  })

  const configurableTabs = computed(() => tabs.value.filter((tab) => tab.id !== 'settings'))
  const categorizedTabs = computed<CategorizedDevtoolsTabs>(() =>
    createCategorizedTabs(configurableTabs.value, settings.tabSettings),
  )

  return {
    categorizedTabs,
    configurableTabs,
    tabs,
  }
}

export function useDevtoolsTabs(activeTab: ComputedRef<DevtoolsTabId>) {
  const { categorizedTabs, tabs } = useDevtoolsTabCatalog()

  const visibleMainTabs = computed(() =>
    categorizedTabs.value.flatMap(([category, categoryTabs]) => {
      if (category.hidden) return []
      return categoryTabs.filter((tab) => !tab.hidden)
    }),
  )
  const systemTabs = computed(() => tabs.value.filter((tab) => tab.id === 'settings'))
  const activeTabMeta = computed(
    () => tabs.value.find((tab) => tab.id === activeTab.value) ?? tabs.value[0],
  )

  return {
    tabs,
    mainTabs: visibleMainTabs,
    systemTabs,
    activeTabMeta,
  }
}

function resolveBuiltinTab(
  tab: DevtoolsTab,
  features: {
    reactivityGraphEnabled: boolean
  },
): DevtoolsTab[] {
  if (tab.id === 'graph' && !features.reactivityGraphEnabled) return []
  return [tab]
}

function createInspectorTab(
  inspector: CustomInspectorSnapshot,
  index: number,
  plugins: PluginSnapshot[],
): DevtoolsTab {
  if (isRouterInspectorId(inspector.id)) {
    return {
      id: 'router',
      title: 'Router',
      icon: 'i-ri-route-line',
      order: -50,
      description: 'Vue Router custom inspector data',
      path: getInspectorPath(inspector.id),
    }
  }

  if (inspector.id === 'pinia') {
    return {
      id: 'pinia',
      title: 'Pinia',
      icon: 'i-logos-pinia',
      order: -40,
      description: 'Pinia store custom inspector data',
      path: getInspectorPath(inspector.id),
    }
  }

  return {
    id: `inspector:${inspector.id}`,
    title: inspector.label,
    icon: inspector.icon ?? 'i-carbon-plug',
    order: -35 + index / 100,
    description: `Custom inspector from ${getPluginTitle(inspector.pluginId, plugins)}`,
    path: getInspectorPath(inspector.id),
  }
}

function getInspectorPath(inspectorId: string): string {
  return `/inspectors/${encodeURIComponent(inspectorId)}`
}

function createCategorizedTabs(
  tabs: DevtoolsTab[],
  tabSettings: {
    hiddenTabCategories: string[]
    hiddenTabs: string[]
    pinnedTabs: string[]
  },
): CategorizedDevtoolsTabs {
  const categoryNames = ['pinned', 'app', 'modules', 'advanced']
  const categories = new Map<string, CategorizedDevtoolsTab[]>(
    categoryNames.map((category) => [category, []]),
  )

  for (const tab of tabs) {
    const pinned = tabSettings.pinnedTabs.includes(tab.id)
    const categoryName = pinned ? 'pinned' : getTabCategory(tab)
    const categoryHidden = tabSettings.hiddenTabCategories.includes(categoryName)
    const hidden = categoryHidden || tabSettings.hiddenTabs.includes(tab.id)

    categories.get(categoryName)?.push({
      ...tab,
      hidden,
    })
  }

  const pinnedTabs = categories.get('pinned') ?? []
  pinnedTabs.sort(
    (a, b) => tabSettings.pinnedTabs.indexOf(a.id) - tabSettings.pinnedTabs.indexOf(b.id),
  )

  return Array.from(categories.entries()).map(([name, categoryTabs]) => [
    {
      name,
      hidden:
        tabSettings.hiddenTabCategories.includes(name) ||
        (categoryTabs.length > 0 && categoryTabs.every((tab) => tab.hidden)),
    },
    categoryTabs,
  ])
}

function getTabCategory(tab: DevtoolsTab): string {
  if (['overview', 'components', 'graph', 'pages', 'timeline'].includes(tab.id)) return 'app'
  return 'modules'
}
