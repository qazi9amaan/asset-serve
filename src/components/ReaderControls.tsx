import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useConnected } from '#/lib/events'
import { usePalette } from './Palette'
import {
  MAX_SIZE,
  MIN_SIZE,
  useSettings,
  type FontChoice,
  type WidthChoice,
} from '#/lib/settings'

export const iconBtn =
  'inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--muted)] transition-colors hover:bg-white/[0.06] hover:text-zinc-100'

export function SidebarToggle() {
  const { settings, toggleSidebar } = useSettings()
  return (
    <button
      type="button"
      onClick={toggleSidebar}
      className={iconBtn}
      title={`${settings.sidebar ? 'Hide' : 'Show'} sidebar  ⌘B · [`}
      aria-label="Toggle sidebar"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
        <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="2" />
        <path d="M6 3v10" />
      </svg>
    </button>
  )
}

export function SearchButton() {
  const { openPalette } = usePalette()
  return (
    <button type="button" onClick={() => openPalette()} className={iconBtn} title="Search  /  ⌘K" aria-label="Search">
      <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="8.5" cy="8.5" r="6" />
        <path d="m13 13 4.5 4.5" strokeLinecap="round" />
      </svg>
    </button>
  )
}

// Shown only when the live connection drops; silence means everything is fine.
export function ConnectionNotice() {
  const connected = useConnected()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted || connected) return null
  return (
    <span className="flex items-center gap-1.5 text-xs text-amber-300" title="Lost connection to the viewer server. Retrying.">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
      Reconnecting…
    </span>
  )
}

export function OutlineToggle() {
  const { settings, update } = useSettings()
  return (
    <button
      type="button"
      onClick={() => update({ outline: !settings.outline })}
      // The outline only fits on wide screens, so the toggle only shows there too.
      className={`${iconBtn} hidden xl:inline-flex ${settings.outline ? 'text-zinc-300' : ''}`}
      title={`${settings.outline ? 'Hide' : 'Show'} outline  ⌘L · ]`}
      aria-label="Toggle outline"
      aria-pressed={settings.outline}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
        <path d="M3 4h10M5.5 8H13M5.5 12H13" />
      </svg>
    </button>
  )
}

const FONTS: { id: FontChoice; label: string; family: string }[] = [
  { id: 'geist', label: 'Geist', family: '"Geist Variable", sans-serif' },
  { id: 'system', label: 'System', family: 'system-ui, -apple-system, sans-serif' },
  { id: 'serif', label: 'Serif', family: '"Source Serif 4 Variable", Georgia, serif' },
  { id: 'mono', label: 'Mono', family: '"Geist Mono Variable", monospace' },
]
const WIDTHS: { id: WidthChoice; label: string }[] = [
  { id: 'narrow', label: 'Narrow' },
  { id: 'normal', label: 'Normal' },
  { id: 'wide', label: 'Wide' },
]

function Segmented({ children }: { children: ReactNode }) {
  return <div className="grid auto-cols-fr grid-flow-col gap-1 rounded-lg bg-white/[0.05] p-1">{children}</div>
}
function Seg({ on, onClick, children, style }: { on: boolean; onClick: () => void; children: ReactNode; style?: React.CSSProperties }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      style={style}
      className={`rounded-md px-2 py-1.5 text-[13px] transition-colors ${
        on ? 'bg-zinc-700 text-zinc-50' : 'text-zinc-400 hover:text-zinc-100'
      }`}
    >
      {children}
    </button>
  )
}
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-[11px] font-medium tracking-wide text-[var(--muted)] uppercase">{label}</div>
      {children}
    </div>
  )
}
function Switch({ label, hint, on, onChange }: { label: string; hint: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="flex w-full items-center justify-between py-1 text-[13px] text-zinc-300"
    >
      <span>
        {label} <kbd className="ml-1 font-mono text-[11px] text-[var(--muted)]">{hint}</kbd>
      </span>
      <span className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${on ? 'bg-sky-400' : 'bg-zinc-700'}`}>
        <span
          className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-4' : 'translate-x-0'}`}
        />
      </span>
    </button>
  )
}

// "Aa" menu: font, size, width, and what's visible.
export function ReaderMenu() {
  const { settings, update, reset } = useSettings()
  const [open, setOpen] = useState(false)
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

  const step = (d: number) => update({ size: Math.min(MAX_SIZE, Math.max(MIN_SIZE, settings.size + d)) })

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`${iconBtn} w-auto px-2 text-[13px] font-medium ${open ? 'bg-white/[0.06] text-zinc-100' : ''}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Reading settings"
      >
        Aa
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Reading settings"
          className="absolute top-9 right-0 z-50 w-72 space-y-4 rounded-xl border border-white/10 bg-[var(--surface)] p-4 shadow-2xl shadow-black/60"
        >
          <Row label="Font">
            <Segmented>
              {FONTS.map((f) => (
                <Seg key={f.id} on={settings.font === f.id} onClick={() => update({ font: f.id })} style={{ fontFamily: f.family }}>
                  {f.label}
                </Seg>
              ))}
            </Segmented>
          </Row>

          <Row label="Size">
            <div className="flex items-center gap-1 rounded-lg bg-white/[0.05] p-1">
              <Seg on={false} onClick={() => step(-1)}>
                <span className="text-[11px]">A</span>
              </Seg>
              <div className="flex-1 text-center text-[13px] text-zinc-200 tabular-nums">{settings.size}px</div>
              <Seg on={false} onClick={() => step(1)}>
                <span className="text-base leading-none">A</span>
              </Seg>
            </div>
          </Row>

          <Row label="Width">
            <Segmented>
              {WIDTHS.map((w) => (
                <Seg key={w.id} on={settings.width === w.id} onClick={() => update({ width: w.id })}>
                  {w.label}
                </Seg>
              ))}
            </Segmented>
          </Row>

          <Row label="Show">
            <Switch label="Sidebar" hint="⌘B" on={settings.sidebar} onChange={(v) => update({ sidebar: v })} />
            <Switch label="Outline" hint="⌘L" on={settings.outline} onChange={(v) => update({ outline: v })} />
          </Row>

          <button type="button" onClick={reset} className="text-[12px] text-[var(--muted)] hover:text-zinc-200">
            Reset to defaults
          </button>
        </div>
      )}
    </div>
  )
}
