import { useEffect, useState } from 'react'
import { dispatchAction } from '#/server/fns'

type Status = { kind: 'idle' } | { kind: 'processing'; action: string } | { kind: 'done'; ok: boolean; message: string }

// Action buttons plus one feedback box, shown only on interactive docs.
export function ActionBar({
  fileId,
  revision,
  actions,
}: {
  fileId: string
  revision: number
  actions: { id: string; label: string }[]
}) {
  const [feedback, setFeedback] = useState('')
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

  // A verdict belongs to the version it was given for; drop it when the doc changes.
  useEffect(() => setStatus((s) => (s.kind === 'done' ? { kind: 'idle' } : s)), [revision])

  const run = async (actionId: string) => {
    setStatus({ kind: 'processing', action: actionId })
    try {
      const v = await dispatchAction({ data: { id: fileId, action_id: actionId, revision, feedback } })
      setStatus({ kind: 'done', ok: v.ok, message: v.message })
      if (v.ok) setFeedback('')
    } catch {
      setStatus({ kind: 'done', ok: false, message: "Couldn't reach the viewer. Try again." })
    }
  }

  const busy = status.kind === 'processing'
  return (
    <section
      aria-label="Actions"
      className="mx-auto mt-14 font-[family-name:var(--font-ui)]"
      style={{ fontSize: 'var(--reader-size)', maxWidth: 'var(--reader-width)' }}
    >
      <textarea
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
        placeholder="Feedback (optional)"
        aria-label="Feedback"
        rows={3}
        disabled={busy}
        className="block w-full resize-y rounded-lg bg-[var(--surface)] px-3 py-2 text-[14px] leading-relaxed text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]/50 disabled:opacity-60"
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {actions.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => void run(a.id)}
            disabled={busy}
            className="rounded-md bg-[var(--raised)] px-3 py-1.5 text-[13px] font-medium text-[var(--text)] transition-colors hover:bg-white/[0.1] hover:text-[var(--strong)] disabled:opacity-60"
          >
            {busy && status.action === a.id ? 'Working…' : a.label}
          </button>
        ))}
        <p role="status" className="ml-1 text-[13px]">
          {status.kind === 'processing' && <span className="text-[var(--muted)]">Processing…</span>}
          {status.kind === 'done' && (
            <span className={status.ok ? 'text-emerald-300' : 'text-red-300'}>{status.message}</span>
          )}
        </p>
      </div>
    </section>
  )
}
