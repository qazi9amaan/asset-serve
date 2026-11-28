import { createServerFn } from '@tanstack/react-start'
import type { IssuedAction } from '#/server/actions'

export interface FileListItem {
  id: string
  title: string
  path: string
  tags: string[]
  addedAt: string
  missing: boolean
}

export type FileContent =
  | {
      ok: true
      id: string
      title: string
      path: string
      content: string
      mtime: number
      // Only on interactive entries: signed buttons for this exact revision.
      actions?: IssuedAction[]
    }
  | { ok: false; id: string; reason: 'not-registered' | 'missing' | 'too-large' }

const MAX_BYTES = 5 * 1024 * 1024

export const listFiles = createServerFn({ method: 'GET' }).handler(
  async (): Promise<FileListItem[]> => {
    const { existsSync } = await import('node:fs')
    const { readRegistry } = await import('#/lib/registry')
    return readRegistry()
      .map((e) => ({ ...e, missing: !existsSync(e.path) }))
      .sort((a, b) => a.title.localeCompare(b.title))
  },
)

// Looks up by id only, so the browser can never ask for an arbitrary path.
export const getFile = createServerFn({ method: 'GET' })
  .validator((d: { id: string }) => ({ id: String(d.id) }))
  .handler(async ({ data }): Promise<FileContent> => {
    const { readFile, stat } = await import('node:fs/promises')
    const { getEntry } = await import('#/lib/registry')
    const entry = getEntry(data.id)
    if (!entry) return { ok: false, id: data.id, reason: 'not-registered' }
    try {
      const s = await stat(entry.path)
      if (s.size > MAX_BYTES) return { ok: false, id: data.id, reason: 'too-large' }
      const content = await readFile(entry.path, 'utf8')
      const file = { ok: true as const, id: entry.id, title: entry.title, path: entry.path, content, mtime: s.mtimeMs }
      if (!entry.interactive) return file
      const { issueActions } = await import('#/server/actions')
      const actions = issueActions(entry, s.mtimeMs)
      return actions ? { ...file, actions } : file
    } catch {
      return { ok: false, id: data.id, reason: 'missing' }
    }
  })

// Unregisters a file, like `asset-serve rm`. Only the registry entry goes;
// the markdown file on disk is never touched.
export const deleteFile = createServerFn({ method: 'POST' })
  .validator((d: { id: string }) => ({ id: String(d.id) }))
  .handler(async ({ data }): Promise<{ removed: boolean }> => {
    const { readRegistry, writeRegistry } = await import('#/lib/registry')
    const files = readRegistry()
    const kept = files.filter((e) => e.id !== data.id)
    if (kept.length === files.length) return { removed: false }
    writeRegistry(kept)
    return { removed: true }
  })

// Runs an agent-defined action: checks the signed token, then forwards an event
// to the entry's server-side handler and returns its accept/reject verdict.
export const runAction = createServerFn({ method: 'POST' })
  .validator((d: { id: string; actionId: string; nonce: string; token: string; feedback?: string }) => ({
    id: String(d.id),
    actionId: String(d.actionId),
    nonce: String(d.nonce),
    token: String(d.token),
    feedback: String(d.feedback ?? '').slice(0, 5000),
  }))
  .handler(async ({ data }) => {
    const { dispatchAction } = await import('#/server/actions')
    return dispatchAction(data)
  })

export interface ContentHit {
  id: string
  title: string
  count: number
  line: number
  snippet: string
  start: number // match offset inside snippet, for highlighting (-1 if cut off)
  len: number
}

// Full-text search across registered files. Reads from disk on every call
// (files are local and few), so results are never stale.
export const searchContent = createServerFn({ method: 'GET' })
  .validator((d: { q: string }) => ({ q: String(d.q ?? '').slice(0, 200) }))
  .handler(async ({ data }): Promise<ContentHit[]> => {
    const needle = data.q.trim().toLowerCase()
    if (needle.length < 2) return []
    const { readFile, stat } = await import('node:fs/promises')
    const { readRegistry } = await import('#/lib/registry')
    const hits: ContentHit[] = []
    for (const e of readRegistry()) {
      try {
        if ((await stat(e.path)).size > MAX_BYTES) continue
        const lines = (await readFile(e.path, 'utf8')).split('\n')
        let count = 0
        let first: { line: number; text: string; idx: number } | null = null
        lines.forEach((raw, i) => {
          const idx = raw.toLowerCase().indexOf(needle)
          if (idx === -1) return
          count++
          first ??= { line: i + 1, text: raw, idx }
        })
        if (!first) continue
        const f = first as { line: number; text: string; idx: number }
        const from = Math.max(0, f.idx - 50)
        const prefix = from > 0 ? '…' : ''
        const body = f.text.slice(from, from + 160).replace(/^\s*(#+|[-*>]|\d+\.)\s+/, '')
        const snippet = prefix + body
        const start = snippet.toLowerCase().indexOf(needle)
        hits.push({ id: e.id, title: e.title, count, line: f.line, snippet, start, len: needle.length })
      } catch {
        // missing or unreadable file: skip
      }
    }
    return hits.sort((a, b) => b.count - a.count).slice(0, 8)
  })
