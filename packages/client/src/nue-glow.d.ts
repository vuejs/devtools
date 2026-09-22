declare module 'nue-glow' {
  export function parseRow(
    row: string,
    language: string,
  ): Array<{
    start: number
    end: number
    tag: string
  }>
}
