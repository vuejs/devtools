export interface VueTracerOptions {
  /**
   * Enable tracing in development, production, or both.
   * Production tracing requires build.sourcemap and compiled templates containing
   * _sfc_render; production inline templates are not instrumented.
   * @default 'dev'
   */
  enabled?: boolean | 'dev' | 'prod'

  /** Resolve the record entry to a relative filesystem path. @default true */
  resolveRecordEntryPath?: boolean

  /** Action after picking; 'none' leaves handling to click listeners. @default 'open-in-editor' */
  onPick?: 'open-in-editor' | 'none'
}
