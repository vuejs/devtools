import type { ReactivityGraphNode, ReactivityGraphNodeType } from '@vue/devtools-kit'

export const TYPE_LEGEND_TYPES: ReactivityGraphNodeType[] = [
  'ref',
  'reactive',
  'computed',
  'watch',
  'effect',
  'render',
  'unknown',
]

export function typeColor(type: ReactivityGraphNodeType) {
  switch (type) {
    case 'ref':
      return '#21a67a'
    case 'computed':
      return '#3b82d6'
    case 'reactive':
      return '#d79822'
    case 'render':
      return '#f97316'
    case 'watch':
      return '#0f766e'
    case 'effect':
      return '#d84f45'
    default:
      return '#94a3b8'
  }
}

export function nodeTypeLabel(type: ReactivityGraphNodeType) {
  switch (type) {
    case 'ref':
      return 'Ref'
    case 'computed':
      return 'Computed'
    case 'reactive':
      return 'Reactive'
    case 'render':
      return 'Render Effect'
    case 'watch':
      return 'Watch'
    case 'effect':
      return 'Effect'
    default:
      return 'Unknown'
  }
}

export function normalizeSearch(value: string) {
  return value.trim().toLowerCase()
}

export function matchesGraphSearch(node: ReactivityGraphNode, query: string) {
  if (!query) return true

  const fields = [
    node.id,
    node.label,
    nodeTypeLabel(node.type),
    formatNodeValue(node),
    ...Object.values(node.data).map((value) => String(value)),
  ]

  return fields.some((field) => field.toLowerCase().includes(query))
}

export function formatNodeValue(node: ReactivityGraphNode | undefined) {
  if (!node) return ''
  const data = node.data
  if (!data) return ''
  const value = data.value ?? data.cb ?? data.instanceName
  if (value == null) return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    // oxlint-disable-next-line typescript/no-base-to-string -- Preserve the preview fallback when JSON serialization fails.
    return String(value)
  }
}
