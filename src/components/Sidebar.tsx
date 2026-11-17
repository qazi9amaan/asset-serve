import { Link, useParams } from '@tanstack/react-router'
import { useMemo } from 'react'
import type { FileListItem } from '#/server/fns'

// Parent folder + file name. The folder may be cut; the file name never is.
function splitPath(p: string) {
  const parts = p.split('/')
  return { dir: parts.at(-2) ?? '', file: parts.at(-1) ?? p }
}

const addedMs = (f: FileListItem) => Date.parse(f.addedAt) || 0

/** Sidebar order: newest first, title breaks ties. Also used by the ⇧Tab DocSwitcher. */
export const sortNewestFirst = (files: FileListItem[]) =>
  [...files].sort((a, b) => addedMs(b) - addedMs(a) || a.title.localeCompare(b.title))

export function Sidebar({ files, onNavigate }: { files: FileListItem[]; onNavigate?: () => void }) {
  const { id: activeId } = useParams({ strict: false })
  // (The search palette keeps listFiles' title order.)
  const sorted = useMemo(() => sortNewestFirst(files), [files])

  return (
    <aside className="flex h-full w-80 shrink-0 flex-col bg-[var(--sidebar)]">
      <nav aria-label="Files" className="flex-1 overflow-y-auto px-2.5 pt-3 pb-6">
        {files.length === 0 && (
          <div className="px-3 py-8 text-center text-sm leading-relaxed text-[var(--muted)]">
            <p className="text-zinc-300">No files yet</p>
            <p className="mt-1">Add one from your terminal:</p>
            <code className="mt-2 inline-block text-zinc-300">asset-serve add notes.md</code>
          </div>
        )}
        <ul>
          {sorted.map((f) => {
            const active = f.id === activeId
            const { dir, file } = splitPath(f.path)
            return (
              <li key={f.id}>
                <Link
                  to="/f/$id"
                  params={{ id: f.id }}
                  onClick={onNavigate}
                  title={f.path}
                  aria-current={active ? 'page' : undefined}
                  className={`mb-1 block rounded-lg px-3 py-2.5 transition-colors ${
                    active ? 'bg-[var(--raised)]' : 'hover:bg-white/[0.04]'
                  }`}
                >
                  <div
                    className={`line-clamp-2 text-[15px] leading-snug font-medium ${
                      f.missing ? 'text-[var(--muted)] line-through' : active ? 'text-zinc-50' : 'text-zinc-300'
                    }`}
                  >
                    {f.title}
                  </div>
                  <div className="mt-1 flex min-w-0 font-mono text-xs text-[var(--muted)]">
                    <span className="min-w-[3ch] truncate">{dir}/</span>
                    <span className="max-w-[85%] shrink-0 truncate text-zinc-400">{file}</span>
                  </div>
                  {f.missing && <div className="mt-1.5 text-[13px] text-amber-400">missing on disk</div>}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
      {files.length > 1 && (
        <div className="px-5 pb-3 font-mono text-[11px] text-[var(--muted)]" title="Hold ⇧, tap Tab to pick, release to open">
          ⇧Tab · switch between 4 newest
        </div>
      )}
    </aside>
  )
}
