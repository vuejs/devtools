import type { DevtoolsTabDefinition } from '../types/tab'

// @unocss-include
export const builtinTabs: DevtoolsTabDefinition[] = [
  {
    id: 'overview',
    title: 'Overview',
    icon: 'i-carbon-information',
    order: -100,
    description: 'Detected Vue apps and runtime status',
    path: '/overview',
  },
  {
    id: 'components',
    title: 'Components',
    icon: 'i-carbon-assembly-cluster',
    order: -90,
    description: 'Component tree snapshot for the active app',
    path: '/components',
  },
  {
    id: 'pages',
    title: 'Pages',
    icon: 'i-carbon-tree-view-alt',
    order: -80,
    description: 'Page and route records',
    path: '/pages',
  },
  {
    id: 'graph',
    title: 'Reactivity Graph',
    icon: 'i-carbon-network-4',
    order: -85,
    description: 'Dependency graph and relationships',
    path: '/graph',
  },
  {
    id: 'timeline',
    title: 'Timeline',
    icon: 'i-carbon-roadmap',
    order: -70,
    description: 'Runtime events emitted by the current host',
    path: '/timeline',
  },
  {
    id: 'plugins',
    title: 'Plugins',
    icon: 'i-carbon-plug',
    order: -30,
    description: 'Devtools plugin compatibility surface',
    path: '/plugins',
  },
  {
    id: 'settings',
    title: 'Settings',
    icon: 'i-carbon-settings-adjust',
    order: 100,
    description: 'Client preferences and host status',
    path: '/settings',
  },
]
