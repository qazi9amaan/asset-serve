import { useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { deleteFile } from '#/server/fns'
import { iconBtn } from './ReaderControls'

// Header trash button. Asks first, then drops the file from the registry
// (like `asset-serve rm`). The markdown file on disk is never touched.
export function RemoveFile({ id, title }: { id: string; title: string }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const cancelBtn = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    cancelBtn.current?.focus() // safe default: Enter cancels
    const onDown = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const remove = async () => {
    setBusy(true)
    setFailed(false)
    try {
      await deleteFile({ data: { id } })
      setOpen(false)
      await navigate({ to: '/' })
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => {
          setFailed(false)
          setOpen((o) => !o)
        }}
        className={`${iconBtn} hover:text-red-300 ${open ? 'bg-white/[0.06] text-zinc-100' : ''}`}
        title="Remove from viewer"
        aria-label="Remove from viewer"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2.5 4h11M6 4V2.75h4V4M4 4l.7 9.25h6.6L12 4M6.75 6.75v4M9.25 6.75v4" />
        </svg>
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Remove from viewer"
          className="absolute top-9 right-0 z-50 w-72 rounded-xl border border-white/10 bg-[var(--surface)] p-4 shadow-2xl shadow-black/60"
        >
          <p className="text-[13px] leading-relaxed text-zinc-200">
            Remove <span className="font-medium text-zinc-50">{title}</span> from the viewer?
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-[var(--muted)]">The file stays on disk.</p>
          {failed && <p className="mt-2 text-[12px] text-red-300">Couldn't remove it. Try again.</p>}
          <div className="mt-3 flex justify-end gap-2">
            <button
              ref={cancelBtn}
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md px-3 py-1.5 text-[13px] text-zinc-300 hover:bg-white/[0.06] hover:text-zinc-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void remove()}
              disabled={busy}
              className="rounded-md bg-red-500/15 px-3 py-1.5 text-[13px] font-medium text-red-300 hover:bg-red-500/25 disabled:opacity-60"
            >
              {busy ? 'Removing…' : 'Remove'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
