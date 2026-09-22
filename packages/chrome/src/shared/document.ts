const SUPPORTED_DOCUMENT_CONTENT_TYPES = new Set(['text/html', 'application/xhtml+xml'])

/**
 * The devtools backend must only start in real HTML documents. Content scripts
 * also run in XML/RSS viewers, PDF and media pages where installing a hook can
 * change page behavior (e.g. XML pretty-print) without any Vue app to debug.
 */
export function isSupportedDevtoolsDocument(
  doc: { contentType?: string } | null | undefined,
): boolean {
  if (!doc) return false
  return SUPPORTED_DOCUMENT_CONTENT_TYPES.has(doc.contentType ?? '')
}
