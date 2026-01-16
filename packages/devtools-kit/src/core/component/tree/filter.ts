import type { VueAppInstance } from '../../../types'
import { classify, kebabize } from '@vue/devtools-shared'
import { getInstanceName } from '../utils'

export class ComponentFilter {
  filter: string
  positiveFilters: string[] = []
  negativeFilters: string[] = []

  constructor(filter: string) {
    this.filter = filter || ''
    const tokens = this.filter.trim().split(/\s+/).filter(Boolean)
    tokens.forEach((token) => {
      const lower = token.toLowerCase()
      if (lower.startsWith('-') && lower.length > 1) {
        this.negativeFilters.push(lower.slice(1))
      }
      else {
        this.positiveFilters.push(lower)
      }
    })
  }

  get hasNegativeFilters() {
    return this.negativeFilters.length > 0
  }

  /**
   * Check if an instance is qualified.
   *
   * @param {Vue|Vnode} instance
   * @return {boolean}
   */
  isQualified(instance: VueAppInstance, checkPositive = true): boolean {
    const name = getInstanceName(instance)
    const normalizedName = classify(name).toLowerCase()
    const kebabName = kebabize(name).toLowerCase()

    if (this.hasNegativeFilters) {
      const isExcluded = this.negativeFilters.some(neg =>
        normalizedName.includes(neg) || kebabName.includes(neg),
      )
      if (isExcluded)
        return false
    }

    if (!checkPositive) {
      return true
    }

    if (this.positiveFilters.length === 0)
      return true

    return this.positiveFilters.some(pos =>
      normalizedName.includes(pos) || kebabName.includes(pos),
    )
  }
}

export function createComponentFilter(filterText: string) {
  return new ComponentFilter(filterText)
}
