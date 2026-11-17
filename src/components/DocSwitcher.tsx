import { useNavigate, useParams } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { FileListItem } from '#/server/fns'
import { sortNewestFirst } from './Sidebar'

// ⌘Tab-style switcher for the most recently added docs (sidebar order), shown
// as a row of cards.
//   Shift+Tab          open, with the NEXT doc already highlighted, so a quick
//                      tap-and-release switches straight away
//   Tab (⇧ still held) move the highlight right (wraps)
//   release Shift      open the highlighted doc
//   Esc / click outside / window blur   close and stay on the current doc
// Clicking a card opens that doc. Not triggered while typing in a field.
export const SWITCHER_SIZE = 4

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && !!t.closest('input, textarea, select, [contenteditable]')

export function DocSwitcher({ files }: { files: FileListItem[] }) {
  const navigate = useNavigate()
  const { id: activeId } = useParams({ strict: false })
  const order = useMemo(() => sortNewestFirst(files).slice(0, SWITCHER_SIZE), [files])

  const [open, setOpen] = useState(false)
  const [index, setIndex] = useState(0)
  // Mirrors for the key handlers, so a keyup that lands before a re-render
  // still sees the latest highlight.
  const live = useRef({ open, index, order, activeId })
  live.current = { open, index, order, activeId }

  const highlight = (i: number) => {
    live.current.index = i
    setIndex(i)
  }

  const close = () => {
    live.current.open = false
    setOpen(false)
  }

  const commit = (i = live.current.index) => {
    const { order, activeId } = live.current
    const target = order[Math.min(i, order.length - 1)]
    close()
    if (target && target.id !== activeId) void navigate({ to: '/f/$id', params: { id: target.id } })
  }

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      const { open, index, order, activeId } = live.current
      const isShiftTab = e.key === 'Tab' && e.shiftKey && !e.altKey && !e.metaKey && !e.ctrlKey
      if (isShiftTab) {
        if (!open) {
          if (isTyping(e.target) || order.length === 0) return
          e.preventDefault()
          // Start one past the current doc; with no doc open (or one outside
          // the set), start on the newest.
          const at = order.findIndex((f) => f.id === activeId)
          highlight(at === -1 ? 0 : (at + 1) % order.length)
          live.current.open = true
          setOpen(true)
        } else {
          e.preventDefault()
          highlight((index + 1) % order.length)
        }
        return
      }
      if (open && e.key === 'Escape') {
        e.preventDefault()
        close() // cancel: stay where we are
      }
    }
    const onUp = (e: KeyboardEvent) => {
      if (live.current.open && e.key === 'Shift') commit()
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
      window.removeEventListener('blur', close)
    }
    // Registered once: handlers read state through `live`, and navigate is stable.
  }, [])

  if (!open || order.length === 0) return null
  const selected = Math.min(index, order.length - 1)

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-4 bg-black/55 px-4"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <div
        role="listbox"
        aria-label="Switch document"
        aria-orientation="horizontal"
        className="palette-in flex max-w-full gap-3 overflow-x-auto rounded-2xl border border-white/10 bg-[var(--surface)] p-3 shadow-2xl shadow-black/70"
      >
        {order.map((f, i) => {
          const on = i === selected
          const current = f.id === activeId
          return (
            <div
              key={f.id}
              role="option"
              aria-selected={on}
              title={f.title}
              // mousemove, not mouseenter: the overlay can appear under a still
              // cursor, and that must not steal the keyboard highlight.
              onMouseMove={() => !on && highlight(i)}
              onClick={() => commit(i)}
              className={`flex h-28 w-40 shrink-0 cursor-pointer flex-col justify-between rounded-xl border p-3.5 transition-colors duration-150 sm:w-44 ${
                on
                  ? 'border-white/25 bg-white/[0.08] shadow-lg shadow-black/40'
                  : 'border-white/[0.06] bg-white/[0.02] hover:border-white/15'
              }`}
            >
              <div className="flex items-center justify-between">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinejoin="round"
                  className={on ? 'text-zinc-300' : 'text-zinc-600'}
                  aria-hidden
                >
                  <path d="M4 1.75h5.25L12.5 5v9.25h-8.5z" />
                  <path d="M9 1.75V5.25h3.5" />
                </svg>
                {current && <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" aria-label="Open now" />}
              </div>
              <div
                className={`line-clamp-3 text-[13.5px] leading-snug font-medium [overflow-wrap:anywhere] ${
                  f.missing ? 'text-[var(--muted)] line-through' : on ? 'text-zinc-50' : 'text-zinc-400'
                }`}
              >
                {f.title}
              </div>
            </div>
          )
        })}
      </div>
      <div className="text-[11px] text-[var(--muted)]">
        ⇧Tab next · release ⇧ to open · esc to cancel
      </div>
    </div>
  )
}
