export interface VueTracerOptions {
  /** Enable tracing during Vite development (serve). False disables the tracer. @default true */
  enabled?: boolean

  /** Resolve the record entry to a relative filesystem path. @default true */
  resolveRecordEntryPath?: boolean

  /** Action after picking; 'none' leaves handling to click listeners. @default 'open-in-editor' */
  onPick?: 'open-in-editor' | 'none'
}
