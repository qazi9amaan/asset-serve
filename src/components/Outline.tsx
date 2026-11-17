import { useEffect, useMemo, useState, type RefObject } from 'react'
import { scrollToHeading } from '#/lib/scroll'
import type { Heading } from './blocks'

const ACTIVE_OFFSET_PX = 96

// "On this page" outline with the current section highlighted.
export function Outline({
  headings,
  scroller,
}: {
  headings: Heading[]
  scroller: RefObject<HTMLDivElement | null>
}) {
  // Drop a leading H1: it's the page title, already shown above the content.
  const items = useMemo(() => {
    const list = headings[0]?.depth === 1 ? headings.slice(1) : headings
    const shown = list.filter((h) => h.depth <= 3)
    const min = Math.min(...shown.map((h) => h.depth))
    return shown.map((h) => ({ ...h, level: h.depth - min }))
  }, [headings])

  const [active, setActive] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const el = scroller.current
    if (!el) return
    let frame = 0
    const update = () => {
      frame = 0
      const top = el.getBoundingClientRect().top + ACTIVE_OFFSET_PX
      let current: string | null = null
      for (const h of items) {
        const node = document.getElementById(h.slug)
        // Headings inside a collapsed section are hidden; skip them.
        if (node && node.offsetParent !== null && node.getBoundingClientRect().top <= top) current = h.slug
      }
      // At the very bottom, the last section is the current one even if short.
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 4) current = items.at(-1)?.slug ?? current
      setActive(current)
      const max = el.scrollHeight - el.clientHeight
      setProgress(max > 0 ? Math.min(1, el.scrollTop / max) : 1)
    }
    const onScroll = () => (frame ||= requestAnimationFrame(update))
    update()
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(frame)
    }
  }, [items, scroller])

  if (items.length < 2) return null

  return (
    <nav aria-label="On this page" className="app-outline scroll-smooth-pane sticky top-6 hidden max-h-[calc(100dvh-8rem)] w-64 shrink-0 self-start overflow-y-auto xl:block">
      <div className="mb-3 flex items-baseline justify-between text-xs font-medium tracking-wider text-[var(--muted)] uppercase">
        <span>On this page</span>
        <span className="tabular-nums normal-case tracking-normal">{Math.round(progress * 100)}%</span>
      </div>
      <ul className="relative border-l border-zinc-800">
        {/* Reading progress, filling the outline's left rule. */}
        <span
          aria-hidden
          className="pointer-events-none absolute top-0 -left-px w-px bg-zinc-500 transition-[height] duration-150"
          style={{ height: `${progress * 100}%` }}
        />
        {items.map((h, i) => {
          const isActive = h.slug === active
          return (
            <li key={`${h.slug}-${i}`}>
              <a
                href={`#${h.slug}`}
                onClick={(e) => {
                  e.preventDefault()
                  scrollToHeading(h.slug)
                }}
                aria-current={isActive ? 'location' : undefined}
                className={`-ml-px block border-l py-1.5 pr-2 text-[15px] leading-snug transition-colors ${
                  isActive
                    ? 'border-sky-300 text-zinc-100'
                    : 'border-transparent text-[var(--muted)] hover:text-zinc-200'
                }`}
                style={{ paddingLeft: 14 + h.level * 14 }}
              >
                {/* Clamp on an inner span so the link's padding can't reveal a third line. */}
                <span className="line-clamp-2 [overflow-wrap:anywhere]">{h.text}</span>
              </a>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
