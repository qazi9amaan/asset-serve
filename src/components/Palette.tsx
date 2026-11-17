import { useNavigate } from '@tanstack/react-router'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { scrollToHeading } from '#/lib/scroll'
import { MAX_SIZE, MIN_SIZE, useSettings, type FontChoice } from '#/lib/settings'
import { searchContent, type ContentHit, type FileListItem } from '#/server/fns'
import type { Heading } from './blocks'

// Spotlight-style search: "/" or ⌘K. Files, sections of the open doc,
// full-text matches across all files, and quick actions.

interface PaletteCtx {
  openPalette: (query?: string) => void
  setDocHeadings: (h: Heading[]) => void
}
const Ctx = createContext<PaletteCtx>({ openPalette: () => {}, setDocHeadings: () => {} })
export const usePalette = () => useContext(Ctx)

type Item =
  | { kind: 'file'; key: string; file: FileListItem }
  | { kind: 'heading'; key: string; heading: Heading }
  | { kind: 'content'; key: string; hit: ContentHit }
  | { kind: 'action'; key: string; label: string; hint?: string; run: () => void }

export function PaletteProvider({ files, children }: { files: FileListItem[]; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [initial, setInitial] = useState('')
  const [docHeadings, setDocHeadings] = useState<Heading[]>([])

  const openPalette = useCallback((query = '') => {
    setInitial(query)
    setOpen(true)
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement).closest('input, textarea, select, [contenteditable]')
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
        setInitial('')
      } else if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        openPalette()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openPalette])

  const value = useMemo(() => ({ openPalette, setDocHeadings }), [openPalette])
  return (
    <Ctx.Provider value={value}>
      {children}
      {open && (
        <Palette files={files} headings={docHeadings} initial={initial} onClose={() => setOpen(false)} />
      )}
    </Ctx.Provider>
  )
}

function Palette({
  files,
  headings,
  initial,
  onClose,
}: {
  files: FileListItem[]
  headings: Heading[]
  initial: string
  onClose: () => void
}) {
  const [q, setQ] = useState(initial)
  const [active, setActive] = useState(0)
  const [hits, setHits] = useState<ContentHit[]>([])
  const list = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const { settings, update, toggleSidebar } = useSettings()

  const raw = q.trim().toLowerCase()
  const tagQuery = raw.startsWith('#') ? raw.slice(1) : null

  // Full-text search, debounced; skipped for #tag queries.
  useEffect(() => {
    if (tagQuery !== null || raw.length < 2) return setHits([])
    let alive = true
    const t = setTimeout(() => {
      void searchContent({ data: { q: raw } }).then((r) => alive && setHits(r))
    }, 120)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [raw, tagQuery])

  const sections = useMemo(() => {
    const fileItems: Item[] = files
      .filter((f) =>
        tagQuery !== null
          ? f.tags.some((t) => t.toLowerCase().startsWith(tagQuery))
          : !raw || [f.title, f.path, ...f.tags].some((s) => s.toLowerCase().includes(raw)),
      )
      .slice(0, raw ? 8 : 6)
      .map((file) => ({ kind: 'file', key: `f:${file.id}`, file }))

    const headingItems: Item[] =
      tagQuery !== null || !raw
        ? []
        : headings
            .filter((h) => h.text.toLowerCase().includes(raw))
            .slice(0, 6)
            .map((heading, i) => ({ kind: 'heading', key: `h:${heading.slug}:${i}`, heading }))

    const contentItems: Item[] = hits.map((hit) => ({ kind: 'content', key: `c:${hit.id}`, hit }))

    const fonts: [FontChoice, string][] = [
      ['geist', 'Geist'],
      ['serif', 'Serif'],
      ['system', 'System'],
      ['mono', 'Mono'],
    ]
    const actions: Item[] = [
      { label: `${settings.sidebar ? 'Hide' : 'Show'} sidebar`, hint: '[', run: toggleSidebar },
      { label: `${settings.outline ? 'Hide' : 'Show'} outline`, hint: ']', run: () => update({ outline: !settings.outline }) },
      { label: 'Bigger text', run: () => update({ size: Math.min(MAX_SIZE, settings.size + 1) }) },
      { label: 'Smaller text', run: () => update({ size: Math.max(MIN_SIZE, settings.size - 1) }) },
      ...fonts
        .filter(([id]) => id !== settings.font)
        .map(([id, name]) => ({ label: `Font: ${name}`, run: () => update({ font: id }) })),
    ]
      .filter((a) => tagQuery === null && (!raw || a.label.toLowerCase().includes(raw)))
      .map((a) => ({ kind: 'action', key: `a:${a.label}`, ...a }))

    return [
      { title: 'Files', items: fileItems },
      { title: 'In this document', items: headingItems },
      { title: 'Matches in files', items: contentItems },
      { title: 'Actions', items: raw ? actions : actions.slice(0, 2) },
    ].filter((s) => s.items.length > 0)
  }, [files, headings, hits, raw, tagQuery, settings, update, toggleSidebar])

  const flat = useMemo(() => sections.flatMap((s) => s.items), [sections])
  useEffect(() => setActive(0), [raw])
  useEffect(() => {
    list.current?.querySelector('[data-active=true]')?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const run = (item: Item | undefined) => {
    if (!item) return
    onClose()
    if (item.kind === 'file') void navigate({ to: '/f/$id', params: { id: item.file.id } })
    if (item.kind === 'content') void navigate({ to: '/f/$id', params: { id: item.hit.id } })
    if (item.kind === 'heading') scrollToHeading(item.heading.slug)
    if (item.kind === 'action') item.run()
  }

  let index = -1
  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/60 px-4 pt-[14vh] backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-label="Search"
        className="palette-in flex max-h-[70vh] w-full max-w-[640px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/80 shadow-2xl shadow-black/80 backdrop-blur-2xl"
      >
        <div className="flex items-center gap-3 border-b border-white/10 px-5">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" className="shrink-0 text-zinc-400">
            <circle cx="8.5" cy="8.5" r="6" />
            <path d="m13 13 4.5 4.5" strokeLinecap="round" />
          </svg>
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose()
              else if (e.key === 'ArrowDown') {
                e.preventDefault()
                setActive((a) => Math.min(flat.length - 1, a + 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActive((a) => Math.max(0, a - 1))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                run(flat[active])
              }
            }}
            placeholder="Search files, sections, text…"
            aria-label="Search"
            className="h-14 w-full bg-transparent text-lg text-zinc-50 placeholder:text-zinc-500 focus:outline-none"
          />
          <kbd className="shrink-0 rounded border border-white/10 px-1.5 py-0.5 font-mono text-[11px] text-zinc-400">esc</kbd>
        </div>

        <div ref={list} className="scroll-smooth-pane overflow-y-auto p-2">
          {flat.length === 0 && (
            <div className="px-4 py-10 text-center text-sm text-zinc-400">
              No results for “{q.trim()}”
            </div>
          )}
          {sections.map((s) => (
            <div key={s.title} className="pb-1">
              <div className="px-3 pt-2 pb-1 text-[11px] font-medium tracking-wide text-zinc-500 uppercase">{s.title}</div>
              {s.items.map((item) => {
                index++
                const i = index
                const on = i === active
                return (
                  <button
                    key={item.key}
                    type="button"
                    data-active={on}
                    onMouseMove={() => !on && setActive(i)}
                    onClick={() => run(item)}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left ${on ? 'bg-white/10' : ''}`}
                  >
                    <ItemBody item={item} />
                  </button>
                )
              })}
            </div>
          ))}
        </div>

        <div className="flex gap-4 border-t border-white/10 px-4 py-2 text-[11px] text-zinc-500">
          <span><Key>↑</Key><Key>↓</Key> move</span>
          <span><Key>↵</Key> open</span>
          <span><Key>#</Key> filter by tag</span>
          <span className="ml-auto"><Key>⌘K</Key> or <Key>/</Key></span>
        </div>
      </div>
    </div>
  )
}

const Key = ({ children }: { children: ReactNode }) => (
  <kbd className="mr-1 rounded border border-white/10 px-1 font-mono text-[10px] text-zinc-400">{children}</kbd>
)

function ItemBody({ item }: { item: Item }) {
  if (item.kind === 'file') {
    const f = item.file
    return (
      <>
        <Glyph>📄</Glyph>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm text-zinc-100">{f.title}</div>
          <div className="truncate font-mono text-[11px] text-zinc-500">{f.path.replace(/^\/Users\/[^/]+/, '~')}</div>
        </div>
        {f.tags.length > 0 && (
          <div className="hidden shrink-0 gap-1.5 text-[11px] text-zinc-500 sm:flex">
            {f.tags.slice(0, 3).map((t) => <span key={t}>#{t}</span>)}
          </div>
        )}
      </>
    )
  }
  if (item.kind === 'heading') {
    return (
      <>
        <Glyph>#</Glyph>
        <span className="min-w-0 flex-1 truncate text-sm text-zinc-100">{item.heading.text}</span>
        <span className="shrink-0 font-mono text-[11px] text-zinc-500">H{item.heading.depth}</span>
      </>
    )
  }
  if (item.kind === 'content') {
    const h = item.hit
    const s = h.start
    return (
      <>
        <Glyph>≡</Glyph>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="truncate text-sm text-zinc-100">{h.title}</span>
            <span className="shrink-0 text-[11px] text-zinc-500">
              {h.count} {h.count === 1 ? 'match' : 'matches'} · line {h.line}
            </span>
          </div>
          <div className="truncate text-[13px] text-zinc-400">
            {s >= 0 ? (
              <>
                {h.snippet.slice(0, s)}
                <mark className="rounded-sm bg-sky-400/25 px-0.5 text-sky-100">{h.snippet.slice(s, s + h.len)}</mark>
                {h.snippet.slice(s + h.len)}
              </>
            ) : (
              h.snippet
            )}
          </div>
        </div>
      </>
    )
  }
  return (
    <>
      <Glyph>›</Glyph>
      <span className="flex-1 text-sm text-zinc-100">{item.label}</span>
      {item.hint && <kbd className="font-mono text-[11px] text-zinc-500">{item.hint}</kbd>}
    </>
  )
}

const Glyph = ({ children }: { children: ReactNode }) => (
  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white/5 text-[13px] text-zinc-400">
    {children}
  </span>
)
