import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ActionBar } from '#/components/ActionBar'
import { MarkdownView } from '#/components/MarkdownView'
import { CopyPage } from '#/components/CopyPage'
import { Outline } from '#/components/Outline'
import { RemoveFile } from '#/components/RemoveFile'
import { usePalette } from '#/components/Palette'
import {
  ConnectionNotice,
  OutlineToggle,
  ReaderMenu,
  SearchButton,
  SidebarToggle,
} from '#/components/ReaderControls'
import { parseBlocks } from '#/components/blocks'
import { useLiveEvent } from '#/lib/events'
import { getFile, type FileContent } from '#/server/fns'

export const Route = createFileRoute('/f/$id')({
  loader: ({ params }) => getFile({ data: { id: params.id } }),
  component: Viewer,
})

function Viewer() {
  const initial = Route.useLoaderData()
  // Keyed by id so switching files resets scroll, animation and live state.
  return <FileView key={initial.id} initial={initial} />
}

const NEAR_BOTTOM_PX = 160

function FileView({ initial }: { initial: FileContent }) {
  const [file, setFile] = useState(initial)
  const [pulse, setPulse] = useState(false)
  const scroller = useRef<HTMLDivElement>(null)
  const wasNearBottom = useRef(false)
  const inflight = useRef<Promise<void> | null>(null)
  const again = useRef(false)

  useEffect(() => setFile(initial), [initial])

  // Coalesce bursts: at most one fetch in flight, plus one follow-up.
  const refresh = () => {
    if (inflight.current) return void (again.current = true)
    const el = scroller.current
    wasNearBottom.current = !!el && el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX
    inflight.current = getFile({ data: { id: initial.id } })
      .then((next) => {
        setFile(next)
        setPulse(true)
      })
      .finally(() => {
        inflight.current = null
        if (again.current) {
          again.current = false
          refresh()
        }
      })
  }

  // Stable wrapper so memoised section heads don't re-render on every FileView render.
  const refreshRef = useRef(refresh)
  refreshRef.current = refresh
  const onCommented = useCallback(() => refreshRef.current(), [])

  useLiveEvent((e) => {
    if (e.type === 'file' && e.id === initial.id) refresh()
    if (e.type === 'registry') refresh() // title/tags may have changed, or file removed
  })

  useEffect(() => {
    if (!pulse) return
    const t = setTimeout(() => setPulse(false), 1500)
    return () => clearTimeout(t)
  }, [pulse, file])

  // Re-render the "x ago" label every 30 s so it never goes stale.
  // Starts null so server and client render the same HTML; filled in after mount.
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    setNow(Date.now())
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])
  useEffect(() => setNow((n) => (n === null ? n : Date.now())), [file])

  const parsed = useMemo(() => (file.ok ? parseBlocks(file.content) : null), [file])
  const reading = useMemo(() => (file.ok ? readingStats(file.content) : null), [file])

  // Back-to-top shows once you're more than a screen down. The progress bar's
  // width is written straight to the DOM so scrolling never re-renders the doc.
  const [showTop, setShowTop] = useState(false)
  const progressBar = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    let frame = 0
    const update = () => {
      frame = 0
      setShowTop(el.scrollTop > el.clientHeight * 1.2)
      const max = el.scrollHeight - el.clientHeight
      if (progressBar.current) {
        progressBar.current.style.width = `${max > 0 ? Math.min(100, (el.scrollTop / max) * 100) : 0}%`
      }
    }
    const onScroll = () => (frame ||= requestAnimationFrame(update))
    update()
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(frame)
    }
  }, [])

  // Follow the tail while a file is being written, like a chat. Only when the
  // reader was already near the bottom, so we never yank someone mid-read.
  // Let the search panel offer this document's sections.
  const { setDocHeadings } = usePalette()
  useEffect(() => {
    setDocHeadings(parsed?.headings ?? [])
    return () => setDocHeadings([])
  }, [parsed, setDocHeadings])

  useLayoutEffect(() => {
    const el = scroller.current
    if (el && wasNearBottom.current) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    wasNearBottom.current = false
  }, [parsed])

  if (!file.ok) return <Problem reason={file.reason} />

  return (
    // The header lives inside the scroll area, so it scrolls away with the page.
    <div ref={scroller} className="scroll-smooth-pane flex-1 overflow-y-auto">
      <div ref={progressBar} aria-hidden className="reading-progress" />
      <header className="flex h-12 items-center gap-2 px-3 md:px-4">
        <SidebarToggle />
        <PathCrumb path={file.path} id={file.id} />
        <span className="ml-auto flex shrink-0 items-center gap-2 pr-1 text-xs text-[var(--muted)]">
          <ConnectionNotice />
          <span
            className={`h-1.5 w-1.5 rounded-full transition-colors duration-700 ${
              pulse ? 'bg-emerald-400 shadow-[0_0_8px] shadow-emerald-400' : 'bg-zinc-700'
            }`}
          />
          <time
            dateTime={new Date(file.mtime).toISOString()}
            title={now === null ? undefined : `Modified ${new Date(file.mtime).toLocaleString()}`}
          >
            {pulse ? 'Updated' : now === null ? '' : `Edited ${formatAgo(file.mtime, now)}`}
          </time>
        </span>
        <CopyPage title={file.title} path={file.path} content={file.content} />
        <SearchButton />
        <OutlineToggle />
        <ReaderMenu />
        <RemoveFile id={file.id} title={file.title} />
      </header>

      <div className="mx-auto flex max-w-[90rem] justify-center gap-12 px-5 pt-6 pb-24 md:px-10">
        <div className="min-w-0 flex-1">
          <MarkdownView
            fileId={file.id}
            blocks={parsed!.blocks}
            commentAction={file.actions?.find((a) => a.id === 'request_changes')}
            onSubmitted={onCommented}
            meta={
              reading && (
                <p className="md-meta">
                  {reading.minutes} min read · {reading.words.toLocaleString('en-US')} words
                </p>
              )
            }
          />
          {file.actions && <ActionBar fileId={file.id} actions={file.actions} />}
        </div>
        <Outline headings={parsed!.headings} scroller={scroller} />
      </div>

      <button
        type="button"
        onClick={() => scroller.current?.scrollTo({ top: 0 })}
        aria-label="Back to top"
        title="Back to top"
        tabIndex={showTop ? 0 : -1}
        className={`fixed right-6 bottom-6 z-30 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-[var(--surface)] text-zinc-300 shadow-lg shadow-black/40 transition-all duration-200 hover:text-white ${
          showTop ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-2 opacity-0'
        }`}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" />
        </svg>
      </button>
    </div>
  )
}

// Folder path muted and cut from the left; the file name always stays visible.
// Click copies just the file name, with a "Copied!" bubble that fades after ~1 s.
function PathCrumb({ path, id }: { path: string; id: string }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const display = path.replace(/^\/Users\/[^/]+/, '~')
  const cut = display.lastIndexOf('/') + 1
  const name = display.slice(cut)
  return (
    <button
      type="button"
      title={`Copy id: ${id}`}
      onClick={() => {
        void navigator.clipboard.writeText(id)
        setCopied(true)
        clearTimeout(timer.current)
        timer.current = setTimeout(() => setCopied(false), 1000)
      }}
      className="relative hidden min-w-0 items-baseline font-mono text-xs text-[var(--muted)] hover:text-zinc-300 sm:flex"
    >
      <span className="truncate [direction:rtl]">
        <bdi>{display.slice(0, cut)}</bdi>
      </span>
      <span className="relative shrink-0 text-zinc-300">
        {name}
        <span role="status" aria-hidden={!copied} className={`copied-bubble${copied ? ' is-on' : ''}`}>
          Copied!
        </span>
      </span>
    </button>
  )
}

function Problem({ reason }: { reason: string }) {
  const text: Record<string, string> = {
    'not-registered': 'This file is not registered. It may have been removed with `asset-serve rm`.',
    missing: 'The file no longer exists on disk. It will reappear here if it comes back.',
    'too-large': 'This file is larger than 5 MB.',
  }
  return (
    <div className="flex flex-1 items-center justify-center px-6 text-sm text-[var(--muted)]">
      {text[reason] ?? 'Unable to load this file.'}
    </div>
  )
}

// ~230 words per minute; code blocks don't count as reading.
function readingStats(content: string) {
  const prose = content.replace(/```[\s\S]*?(```|$)/g, ' ')
  const words = prose.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length
  return { words, minutes: Math.max(1, Math.round(words / 230)) }
}

function formatAgo(ms: number, now: number) {
  const s = Math.round((now - ms) / 1000)
  if (s < 10) return 'just now'
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  if (s < 86400) return `${Math.round(s / 3600)}h ago`
  return new Date(ms).toLocaleDateString()
}
