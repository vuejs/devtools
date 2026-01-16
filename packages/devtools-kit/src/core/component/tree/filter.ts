import type { VueAppInstance } from '../../../types'
import { classify, kebabize } from '@vue/devtools-shared'
import { getInstanceName } from '../utils'

export class ComponentFilter {
  filter: string
  isNegative: boolean = false
  private matchName: string = ''

  constructor(filter: string) {
    this.filter = filter || ''
    const trimmed = this.filter.trim()

    if (trimmed.startsWith('-')) {
      this.isNegative = true
      this.matchName = trimmed.slice(1).trim().toLowerCase()
    }
    else {
      this.isNegative = false
      this.matchName = trimmed.toLowerCase()
    }
  }

  /**
   * Check if an instance is qualified.
   *
   * @param {Vue|Vnode} instance
   * @return {boolean}
   */
  isQualified(instance: VueAppInstance): boolean {
    const name = getInstanceName(instance)
    const normalizedName = classify(name).toLowerCase()
    const kebabName = kebabize(name).toLowerCase()

    if (this.isNegative) {
      if (!this.matchName)
        return true

      return !(normalizedName.includes(this.matchName) || kebabName.includes(this.matchName))
    }

    return normalizedName.includes(this.matchName)
      || kebabName.includes(this.matchName)
  }
}

export function createComponentFilter(filterText: string) {
  return new ComponentFilter(filterText)
}
