import type {
  ComponentStateSnapshotMessage,
  ExpandedValueMessage,
  StatePageOptions,
} from '../../protocol'
import { measureRuntimeMessageBytes } from '../../rpc/event-buffer'

type Result = ComponentStateSnapshotMessage | ExpandedValueMessage
interface PageSource {
  total: number
  read: (offset: number, limit: number) => Result
}
interface Session extends PageSource {
  target: string
  pageSize: number
  offset: number
  last?: { page: number; result: Result }
}

/** Keeps actual page boundaries when the byte budget ends a page early. */
export class StatePages {
  private sessions = new Map<string, Session>()
  private seed = 0

  constructor(private readonly maxBytes: number) {}

  read(
    target: string,
    options: StatePageOptions,
    create: () => PageSource,
    maxPageSize = 500,
  ): Result {
    const page = options.page ?? 1
    const pageSize = options.pageSize ?? 50
    if (
      !Number.isSafeInteger(page) ||
      page < 1 ||
      !Number.isSafeInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > maxPageSize
    )
      throw new Error(`Use page >= 1 and pageSize between 1 and ${maxPageSize}.`)
    if (!options.snapshotId && page !== 1)
      throw new Error('Start at page 1, then pass its snapshotId with pagination.next.')
    const id = options.snapshotId ?? `state-page:${++this.seed}`
    let session = this.sessions.get(id)
    if (!options.snapshotId) {
      session = { ...create(), target, pageSize, offset: 0 }
      this.sessions.set(id, session)
      while (this.sessions.size > 8) {
        const oldest = this.sessions.keys().next().value!
        this.sessions.delete(oldest)
      }
    }
    if (!session || session.target !== target || session.pageSize !== pageSize)
      throw new Error(
        'State pagination expired or query parameters changed. Restart at page 1 without snapshotId.',
      )
    if (session.last?.page === page) return session.last.result
    const offset = session.offset
    if (page !== (session.last?.page ?? 0) + 1 || (page > 1 && offset >= session.total))
      throw new Error(
        'Read pages in order using pagination.next. Restart at page 1 without snapshotId to reread earlier pages.',
      )
    const result = session.read(offset, pageSize)
    const items =
      'sections' in result
        ? result.sections.flatMap((section) => section.entries)
        : 'preview' in result.value
          ? result.value.preview
          : [result.value]
    let count =
      'value' in result && result.value.kind === 'string' ? result.value.value.length : items.length
    const update = () => {
      result.snapshotId = id
      result.pagination = {
        total: session.total,
        pageSize,
        current: page,
        next: offset + count < session.total ? page + 1 : null,
      }
    }
    update()
    // Leave room for the RPC envelope and host metadata; never advance past omitted entries.
    let bytes = measureRuntimeMessageBytes(result)
    while (bytes > this.maxBytes * 0.9 && count > 1) {
      if ('sections' in result) {
        const section = [...result.sections]
          .reverse()
          .find((section) => section.entries.length > 0)!
        bytes -= measureRuntimeMessageBytes(section.entries.pop())
        section.partial = true
      } else if (result.value.kind === 'string') {
        result.value.value = result.value.value.slice(0, -1)
        bytes = measureRuntimeMessageBytes(result)
      } else if ('preview' in result.value)
        bytes -= measureRuntimeMessageBytes(result.value.preview.pop())
      count--
      update()
    }
    if (measureRuntimeMessageBytes(result) > this.maxBytes * 0.9)
      throw new Error(
        'A single state entry exceeds the response budget. Read a narrower field path or expand its value separately.',
      )
    if (count === 0 && offset < session.total)
      throw new Error('State changed during pagination. Restart at page 1 without snapshotId.')
    session.offset = offset + count
    session.last = { page, result }
    return result
  }

  clear() {
    this.sessions.clear()
  }
}
