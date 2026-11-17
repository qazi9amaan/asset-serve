import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { savePrefs } from '#/server/prefs'

// Reader preferences, saved to ~/.asset-serve/preferences.json (see SettingsProvider).
// They are data attributes / a CSS variable on <html>; CSS does the rest. The
// server renders them into the page, so the first paint already matches.

export type FontChoice = 'geist' | 'system' | 'serif' | 'mono'
const FONTS: FontChoice[] = ['geist', 'system', 'serif', 'mono']
export type WidthChoice = 'narrow' | 'normal' | 'wide'

export interface Settings {
  font: FontChoice
  size: number
  width: WidthChoice
  sidebar: boolean
  outline: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  font: 'geist',
  size: 18,
  width: 'normal',
  sidebar: true,
  outline: true,
}

export const MIN_SIZE = 14
export const MAX_SIZE = 24

const WIDTHS: WidthChoice[] = ['narrow', 'normal', 'wide']

/** Coerce anything (stored JSON, old versions) into valid settings. */
export function sanitizeSettings(raw: unknown): Settings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof Settings, unknown>>
  const size = Math.round(Number(r.size))
  return {
    font: FONTS.includes(r.font as FontChoice) ? (r.font as FontChoice) : DEFAULT_SETTINGS.font,
    size: Number.isFinite(size) ? Math.min(MAX_SIZE, Math.max(MIN_SIZE, size)) : DEFAULT_SETTINGS.size,
    width: WIDTHS.includes(r.width as WidthChoice) ? (r.width as WidthChoice) : DEFAULT_SETTINGS.width,
    sidebar: typeof r.sidebar === 'boolean' ? r.sidebar : DEFAULT_SETTINGS.sidebar,
    outline: typeof r.outline === 'boolean' ? r.outline : DEFAULT_SETTINGS.outline,
  }
}

/** Attributes for <html>, rendered on the server so the first paint is already right. */
export function htmlSettingsAttrs(s: Settings) {
  return {
    'data-font': s.font,
    'data-width': s.width,
    'data-sidebar': s.sidebar ? 'on' : 'off',
    'data-outline': s.outline ? 'on' : 'off',
    style: { '--reader-size': `${s.size}px` } as React.CSSProperties,
  }
}

// Same thing on the client, after a change.
function applySettings(s: Settings) {
  const el = document.documentElement
  el.dataset.font = s.font
  el.dataset.width = s.width
  el.dataset.sidebar = s.sidebar ? 'on' : 'off'
  el.dataset.outline = s.outline ? 'on' : 'off'
  el.style.setProperty('--reader-size', `${s.size}px`)
}

// Older versions kept settings in this browser only; read once to migrate them.
const LEGACY_KEY = 'asset-serve:settings'
function takeLegacy(): Settings | null {
  try {
    const raw = localStorage.getItem(LEGACY_KEY)
    if (!raw) return null
    localStorage.removeItem(LEGACY_KEY)
    return sanitizeSettings(JSON.parse(raw))
  } catch {
    return null
  }
}

interface Ctx {
  settings: Settings
  update: (patch: Partial<Settings>) => void
  reset: () => void
  /** Mobile drawer (not persisted). */
  drawerOpen: boolean
  setDrawerOpen: (open: boolean) => void
  /** Desktop: show/hide the sidebar. Phone: open the drawer. */
  toggleSidebar: () => void
}

const SettingsContext = createContext<Ctx>({
  settings: DEFAULT_SETTINGS,
  update: () => {},
  reset: () => {},
  drawerOpen: false,
  setDrawerOpen: () => {},
  toggleSidebar: () => {},
})

/**
 * `initial` comes from ~/.asset-serve/preferences.json via the root loader
 * (null if nothing saved yet). Every change is written back there, so the last
 * choice sticks across reloads, ports (3000/7777), localhost vs 127.0.0.1 and browsers.
 */
export function SettingsProvider({ initial, children }: { initial: Settings | null; children: ReactNode }) {
  const start = initial ?? DEFAULT_SETTINGS
  const [settings, setSettings] = useState(start)
  const current = useRef(start)

  const commit = useCallback((next: Settings) => {
    current.current = next
    setSettings(next)
    applySettings(next)
    void savePrefs({ data: next }).catch(() => {
      // server unreachable: the change still applies until reload
    })
  }, [])

  // First run after upgrading: carry over settings saved in this browser.
  useEffect(() => {
    if (initial) return
    const legacy = takeLegacy()
    if (legacy) commit(legacy)
  }, [initial, commit])

  const update = useCallback(
    (patch: Partial<Settings>) => commit({ ...current.current, ...patch }),
    [commit],
  )
  const reset = useCallback(() => commit(DEFAULT_SETTINGS), [commit])

  const [drawerOpen, setDrawerOpen] = useState(false)
  const toggleSidebar = useCallback(() => {
    if (window.matchMedia('(min-width: 768px)').matches) update({ sidebar: !current.current.sidebar })
    else setDrawerOpen((o) => !o)
  }, [update])

  // ⌘B or "[" toggles the sidebar; ⌘L or "]" toggles the outline. Ignored while typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable]')) return
      if (e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        const k = e.key.toLowerCase()
        if (k === 'b') {
          e.preventDefault()
          toggleSidebar()
        } else if (k === 'l') {
          e.preventDefault() // otherwise ⌘L focuses the address bar
          update({ outline: !current.current.outline })
        }
        return
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === '[') toggleSidebar()
      if (e.key === ']') update({ outline: !current.current.outline })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [update, toggleSidebar])

  const value = useMemo(
    () => ({ settings, update, reset, drawerOpen, setDrawerOpen, toggleSidebar }),
    [settings, update, reset, drawerOpen, toggleSidebar],
  )
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export const useSettings = () => useContext(SettingsContext)
