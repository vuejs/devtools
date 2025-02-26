export function removeUrlQuery(url: string): string {
  return url.replace(/\?.*$/, '')
}
