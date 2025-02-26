import type { ModuleBuiltinTab } from '~/types'
import { deepClone, isInChromePanel, isInElectron } from '@vue/devtools-shared'

// @unocss-include
export const builtinTab: [string, ModuleBuiltinTab[]][] = [
  ['app', [
    {
      icon: 'i-carbon-information',
      name: 'overview',
      order: -100,
      path: 'overview',
      title: 'Overview',
    },
    {
      icon: 'i-carbon-assembly-cluster',
      name: 'components',
      order: -100,
      path: 'components',
      title: 'Components',
    },
    {
      icon: 'i-carbon-tree-view-alt',
      name: 'pages',
      order: -100,
      path: 'pages',
      title: 'Pages',
    },
    {
      icon: 'i-carbon-roadmap',
      name: 'Timeline',
      order: -100,
      path: 'timeline',
      title: 'Timeline',
    },
    {
      icon: 'i-carbon-image-copy',
      name: 'assets',
      order: -100,
      path: 'assets',
      title: 'Assets',
    },
  ]],
  ['modules', [
    {
      icon: 'i-ri-route-line',
      name: 'router',
      order: -100,
      path: 'router',
      title: 'Router',
    },
    {
      icon: 'i-logos-pinia',
      name: 'pinia',
      order: -100,
      path: 'pinia',
      title: 'Pinia',
    },
  ]],
  ['advanced', [
    {
      icon: 'i-carbon-network-4',
      name: 'graph',
      order: -100,
      path: 'graph',
      title: 'Graph',
    },
  ]],
]

export const viteOnlyTabs = [
  'assets',
  'graph',
  'vite-inspect',
]

export function getBuiltinTab(viteDetected: boolean, customInspectorTabs: ModuleBuiltinTab[]): [string, ModuleBuiltinTab[]][] {
  const tab = deepClone(builtinTab)
  // filter out modules that are not detected
  tab.forEach((item) => {
    if (item[0] === 'modules') {
      // integration pinia and router tabs
      item[1] = item[1].filter((t) => {
        if (t.name === 'router') {
          return customInspectorTabs.findIndex(item => item.name.startsWith('router-inspector')) > -1
        }
        else if (t.name === 'pinia') {
          return customInspectorTabs.findIndex(item => item.name === 'pinia') > -1
        }
        return true
      })
      const normalizedCustomInspectorTabs = customInspectorTabs.filter(item => !(item.name.startsWith('router-inspector') || item.name === 'pinia'))

      item[1] = [...item[1], ...normalizedCustomInspectorTabs]
    }
  })

  return (viteDetected && (!isInElectron && !isInChromePanel))
    ? tab
    : tab.map(([_, tabs]) => [_, tabs.filter(t => !viteOnlyTabs.includes(t.name))])
}

export const CUSTOM_TAB_VIEW = 'custom-tab-view'
export const CUSTOM_INSPECTOR_TAB_VIEW = 'custom-inspector-tab-view'
