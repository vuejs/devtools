export const REACTIVITY_GRAPH_MIN_VUE_VERSION = '3.6.0'

export function supportsReactivityGraphVueVersion(version: string | undefined): boolean {
  const parts = parseVueVersion(version)
  if (!parts) return false

  return compareVersionParts(parts, [3, 6, 0]) >= 0
}

function parseVueVersion(version: string | undefined): [number, number, number] | undefined {
  const match = version?.trim().match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/)
  if (!match) return

  return [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)]
}

function compareVersionParts(
  current: [number, number, number],
  minimum: [number, number, number],
): number {
  for (let index = 0; index < minimum.length; index++) {
    const diff = current[index] - minimum[index]
    if (diff !== 0) return diff
  }

  return 0
}
