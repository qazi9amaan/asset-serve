import { useEffect, useRef, useState } from 'react'

// "Copy page" split button, like the ones on docs sites: one click copies the page
// for an LLM (Markdown wrapped with its title and source path); the menu has variants.
// Everything stays on the clipboard; nothing is sent anywhere.

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    // Fallback for browsers that block the async clipboard API.
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    ta.remove()
  }
}

// Wrapped in tags with the title and path, so a model knows what it's reading
// and where the file lives.
function forLLM(title: string, path: string, content: string) {
  return `<document title="${title.replace(/"/g, "'")}" source="${path}">\n${content.trim()}\n</document>\n`
}

type Done = 'markdown' | 'llm' | 'link' | null

export function CopyPage({ title, path, content }: { title: string; path: string; content: string }) {
  const [open, setOpen] = useState(false)
  const [done, setDone] = useState<Done>(null)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  useEffect(() => {
    if (!done) return
    const t = setTimeout(() => setDone(null), 1600)
    return () => clearTimeout(t)
  }, [done])

  const run = async (kind: Exclude<Done, null>) => {
    setOpen(false)
    if (kind === 'markdown') await copyText(content)
    if (kind === 'llm') await copyText(forLLM(title, path, content))
    if (kind === 'link') await copyText(location.href.split('#')[0])
    setDone(kind)
  }

  const label = done === 'link' ? 'Link copied' : done ? 'Copied' : 'Copy page'

  return (
    <div ref={root} className="relative flex">
      <button
        type="button"
        onClick={() => void run('llm')}
        title="Copy this page for an LLM: Markdown with its title and source path"
        className="inline-flex h-7 items-center gap-1.5 rounded-l-md border border-r-0 border-white/10 pr-2 pl-2.5 text-xs text-zinc-300 transition-colors hover:bg-white/[0.06] hover:text-white"
      >
        {done ? (
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400">
            <path d="m3.5 8.5 3 3 6-7" />
          </svg>
        ) : (
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
            <path d="M10.5 5.5V3.5A1.5 1.5 0 0 0 9 2H3.5A1.5 1.5 0 0 0 2 3.5V9a1.5 1.5 0 0 0 1.5 1.5h2" />
          </svg>
        )}
        <span aria-live="polite" className="hidden sm:inline">{label}</span>
      </button>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="More copy options"
        aria-expanded={open}
        aria-haspopup="menu"
        className={`inline-flex h-7 w-6 items-center justify-center rounded-r-md border border-white/10 text-[var(--muted)] transition-colors hover:bg-white/[0.06] hover:text-white ${
          open ? 'bg-white/[0.06] text-white' : ''
        }`}
      >
        <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m4 6 4 4 4-4" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute top-9 right-0 z-50 w-72 rounded-xl border border-white/10 bg-[var(--surface)] p-1.5 shadow-2xl shadow-black/60"
        >
          <MenuItem
            title="Copy for LLM"
            hint="Markdown with the title and file path (default)"
            onClick={() => void run('llm')}
          />
          <MenuItem
            title="Copy Markdown only"
            hint="The raw file, nothing added"
            onClick={() => void run('markdown')}
          />
          <MenuItem title="Copy link" hint="URL of this page in the viewer" onClick={() => void run('link')} />
        </div>
      )}
    </div>
  )
}

function MenuItem({ title, hint, onClick }: { title: string; hint: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="block w-full rounded-lg px-3 py-2 text-left transition-colors hover:bg-white/[0.06]"
    >
      <span className="block text-[13px] text-zinc-100">{title}</span>
      <span className="block text-xs text-[var(--muted)]">{hint}</span>
    </button>
  )
}
