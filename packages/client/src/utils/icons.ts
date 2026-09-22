const CUSTOM_IC_ICON_PREFIX = 'custom-ic-'
const MATERIAL_ICON_STYLE_PREFIX_RE = /^(?:baseline|outline|round|sharp|twotone)-/

export function isIconClass(icon: string | undefined): boolean {
  return !!icon && icon.startsWith('i-')
}

export function isUrlIcon(icon: string | undefined): boolean {
  return !!icon && /^(?:https?:|data:image\/|blob:)/.test(icon)
}

export function getMaterialIconText(icon: string | undefined): string | undefined {
  if (!icon || isIconClass(icon) || isUrlIcon(icon)) return

  const normalizedIcon = icon.trim()
  if (!normalizedIcon) return

  const materialIcon = normalizedIcon.startsWith(CUSTOM_IC_ICON_PREFIX)
    ? normalizedIcon.slice(CUSTOM_IC_ICON_PREFIX.length)
    : normalizedIcon

  const withoutStylePrefix = materialIcon.replace(MATERIAL_ICON_STYLE_PREFIX_RE, '')

  return withoutStylePrefix.replace(/-/g, '_')
}
