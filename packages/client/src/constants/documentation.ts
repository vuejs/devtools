import type { DevtoolsCommand } from '../composables/commands'

const VUE_API_PAGES = [
  ['Application API', 'application'],
  ['Composition API: Setup', 'composition-api-setup'],
  ['Composition API: Lifecycle Hooks', 'composition-api-lifecycle'],
  ['Composition API: Dependency Injection', 'composition-api-dependency-injection'],
  ['Reactivity API: Core', 'reactivity-core'],
  ['Reactivity API: Utilities', 'reactivity-utilities'],
  ['Reactivity API: Advanced', 'reactivity-advanced'],
  ['Built-in Directives', 'built-in-directives'],
  ['Built-in Components', 'built-in-components'],
  ['Built-in Special Elements', 'built-in-special-elements'],
  ['Built-in Special Attributes', 'built-in-special-attributes'],
  ['Single-File Component: script setup', 'sfc-script-setup'],
  ['Single-File Component: CSS Features', 'sfc-css-features'],
  ['Render Function APIs', 'render-function'],
  ['Server-Side Rendering API', 'ssr'],
  ['TypeScript Utility Types', 'utility-types'],
  ['Custom Renderer API', 'custom-renderer'],
] as const

export function createVueDocumentationCommands(): DevtoolsCommand[] {
  return VUE_API_PAGES.map(([title, slug]) => ({
    id: `documentation:vue:${slug}`,
    title,
    description: `vuejs.org/api/${slug}`,
    group: 'Documentation',
    icon: documentationIcon(slug),
    keywords: ['vue', 'docs', 'api', slug],
    action: () => {
      window.open(`https://vuejs.org/api/${slug}.html`, '_blank', 'noopener,noreferrer')
    },
  }))
}

function documentationIcon(slug: string): string {
  if (slug === 'utility-types') return 'i-carbon-language'
  if (slug === 'ssr' || slug === 'custom-renderer') return 'i-carbon-server-proxy'
  if (slug.includes('css')) return 'i-carbon-color-palette'
  return 'i-logos-vue'
}
