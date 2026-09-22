import type { ComponentSnapshot, ComponentTreeNodeTag } from './devtools-client'

export interface ComponentInspectorTreeNode {
  id: string
  label: string
  children?: ComponentInspectorTreeNode[]
  hasChildren?: boolean
  tags?: ComponentTreeNodeTag[]
  renderKey?: string | number
  isFragment?: boolean
  inactive?: boolean
  favorite?: boolean
  duration?: string
}

export function buildComponentTree(
  componentSnapshots: ComponentSnapshot[],
  filterValue: string,
  favoriteComponentKeys: ReadonlySet<string> = new Set(),
  includeDuration = false,
): ComponentInspectorTreeNode[] {
  const byId = new Map(componentSnapshots.map((component) => [component.id, component]))
  const childCounts = new Map<string, number>()
  const query = parseComponentFilter(filterValue)
  const includedIds = new Set<string>()
  const excludedIds = new Set<string>()

  for (const component of componentSnapshots) {
    if (!component.parentId) continue
    childCounts.set(component.parentId, (childCounts.get(component.parentId) ?? 0) + 1)
  }

  if (query.positive.length) {
    for (const component of componentSnapshots) {
      if (!matchesAllComponentFilters(component, query.positive, favoriteComponentKeys)) continue

      let current: ComponentSnapshot | undefined = component
      while (current) {
        includedIds.add(current.id)
        current = current.parentId ? byId.get(current.parentId) : undefined
      }
    }
  } else {
    for (const component of componentSnapshots) includedIds.add(component.id)
  }

  for (const component of componentSnapshots) {
    if (matchesAnyComponentFilter(component, query.negative, favoriteComponentKeys))
      excludedIds.add(component.id)
  }

  const roots: ComponentSnapshot[] = []
  const childrenByParentId = new Map<string, ComponentSnapshot[]>()

  for (const component of componentSnapshots) {
    if (!includedIds.has(component.id) || excludedIds.has(component.id)) continue

    const parent = findVisibleParent(component, byId, includedIds, excludedIds)

    if (!parent) {
      roots.push(component)
      continue
    }

    const siblings = childrenByParentId.get(parent.id) ?? []
    siblings.push(component)
    childrenByParentId.set(parent.id, siblings)
  }

  return roots.map((component) =>
    toComponentTreeNode(
      component,
      childrenByParentId,
      childCounts,
      favoriteComponentKeys,
      includeDuration,
    ),
  )
}

function toComponentTreeNode(
  component: ComponentSnapshot,
  childrenByParentId: Map<string, ComponentSnapshot[]>,
  childCounts: Map<string, number>,
  favoriteComponentKeys: ReadonlySet<string>,
  includeDuration: boolean,
): ComponentInspectorTreeNode {
  const children = (childrenByParentId.get(component.id) ?? []).map((child) =>
    toComponentTreeNode(
      child,
      childrenByParentId,
      childCounts,
      favoriteComponentKeys,
      includeDuration,
    ),
  )
  const childCount = component.childCount ?? childCounts.get(component.id) ?? children.length

  return {
    id: component.id,
    label: component.name,
    children,
    hasChildren: childCount > 0,
    tags: component.tags,
    renderKey: component.renderKey,
    isFragment: component.isFragment,
    inactive: component.inactive,
    favorite: favoriteComponentKeys.has(getComponentPreferenceKey(component)),
    duration: includeDuration ? formatComponentDuration(component) : undefined,
  }
}

function formatComponentDuration(component: ComponentSnapshot): string | undefined {
  const duration = component.lastUpdateMs ?? component.lastMountMs
  if (duration == null || !Number.isFinite(duration)) return
  if (duration < 0.05) return '<0.1ms'
  return `${duration.toFixed(1)}ms`
}

export interface ComponentFilterTerm {
  field: 'all' | 'file' | 'tag' | 'favorite'
  value: string
}

export interface ComponentFilterQuery {
  positive: ComponentFilterTerm[]
  negative: ComponentFilterTerm[]
}

export function parseComponentFilter(filterValue: string): ComponentFilterQuery {
  const query: ComponentFilterQuery = { positive: [], negative: [] }

  for (const rawToken of filterValue.match(/-?(?:(?:file|tag|is):)?(?:"[^"]*"|[^\s"]+)/gi) ?? []) {
    const negative = rawToken.startsWith('-') && rawToken.length > 1
    const token = (negative ? rawToken.slice(1) : rawToken).replace(/^"|"$/g, '')
    const separatorIndex = token.indexOf(':')
    const rawField = separatorIndex > 0 ? token.slice(0, separatorIndex).toLowerCase() : ''
    const value = (separatorIndex > 0 ? token.slice(separatorIndex + 1) : token)
      .replace(/^"|"$/g, '')
      .toLowerCase()
    if (!value && rawField !== 'is') continue

    const term: ComponentFilterTerm =
      rawField === 'file'
        ? { field: 'file', value }
        : rawField === 'tag'
          ? { field: 'tag', value }
          : rawField === 'is' && value === 'favorite'
            ? { field: 'favorite', value }
            : { field: 'all', value: token.toLowerCase() }

    ;(negative ? query.negative : query.positive).push(term)
  }

  return query
}

export function getComponentPreferenceKey(
  component: Pick<ComponentSnapshot, 'file' | 'name'>,
): string {
  return JSON.stringify([component.file ?? '', component.name])
}

export function matchesComponentFilterQuery(
  component: ComponentSnapshot,
  filterValue: string,
  favoriteComponentKeys: ReadonlySet<string> = new Set(),
): boolean {
  const query = parseComponentFilter(filterValue)
  return (
    matchesAllComponentFilters(component, query.positive, favoriteComponentKeys) &&
    !matchesAnyComponentFilter(component, query.negative, favoriteComponentKeys)
  )
}

function findVisibleParent(
  component: ComponentSnapshot,
  byId: Map<string, ComponentSnapshot>,
  includedIds: Set<string>,
  excludedIds: Set<string>,
): ComponentSnapshot | undefined {
  let parent = component.parentId ? byId.get(component.parentId) : undefined

  while (parent) {
    if (includedIds.has(parent.id) && !excludedIds.has(parent.id)) return parent
    parent = parent.parentId ? byId.get(parent.parentId) : undefined
  }
}

function matchesAllComponentFilters(
  component: ComponentSnapshot,
  terms: ComponentFilterTerm[],
  favoriteComponentKeys: ReadonlySet<string>,
): boolean {
  return terms.every((term) => matchesComponentFilter(component, term, favoriteComponentKeys))
}

function matchesAnyComponentFilter(
  component: ComponentSnapshot,
  terms: ComponentFilterTerm[],
  favoriteComponentKeys: ReadonlySet<string>,
): boolean {
  return terms.some((term) => matchesComponentFilter(component, term, favoriteComponentKeys))
}

function matchesComponentFilter(
  component: ComponentSnapshot,
  term: ComponentFilterTerm,
  favoriteComponentKeys: ReadonlySet<string>,
): boolean {
  switch (term.field) {
    case 'file':
      return !!component.file?.toLowerCase().includes(term.value)
    case 'tag':
      return !!component.tags?.some(
        (tag) =>
          tag.label.toLowerCase().includes(term.value) ||
          tag.tooltip?.toLowerCase().includes(term.value),
      )
    case 'favorite':
      return favoriteComponentKeys.has(getComponentPreferenceKey(component))
    case 'all':
      return (
        component.name.toLowerCase().includes(term.value) ||
        !!component.file?.toLowerCase().includes(term.value) ||
        !!component.tags?.some((tag) => tag.label.toLowerCase().includes(term.value))
      )
  }
}
