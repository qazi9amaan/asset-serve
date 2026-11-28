import { useState } from 'react'
import type { IssuedAction } from '#/server/actions'
import { runAction } from '#/server/fns'

type Status =
  | { state: 'idle' }
  | { state: 'processing'; label: string }
  | { state: 'success' | 'failure'; message: string }

// Agent-defined buttons plus one feedback box, shown only on interactive docs.
// Tokens come from the latest getFile, so a live refresh brings fresh ones.
export function ActionBar({ fileId, actions }: { fileId: string; actions: IssuedAction[] }) {
  const [feedback, setFeedback] = useState('')
  const [status, setStatus] = useState<Status>({ state: 'idle' })
  const busy = status.state === 'processing'

  const run = async (a: IssuedAction) => {
    setStatus({ state: 'processing', label: a.label })
    try {
      const res = await runAction({ data: { id: fileId, actionId: a.id, nonce: a.nonce, token: a.token, head: a.head, feedback } })
      if (!res.ok) return setStatus({ state: 'failure', message: res.error })
      const accepted = res.verdict === 'accept'
      setStatus({
        state: accepted ? 'success' : 'failure',
        message: res.message ?? (accepted ? 'Accepted.' : 'Rejected.'),
      })
      if (accepted) setFeedback('')
    } catch {
      setStatus({ state: 'failure', message: "Couldn't reach the server. Try again." })
    }
  }

  return (
    <section aria-label="Actions" className="mt-12 rounded-xl bg-[var(--surface)] p-4">
      <textarea
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
        maxLength={5000}
        rows={3}
        placeholder="Feedback (optional)"
        aria-label="Feedback"
        className="w-full resize-y rounded-md bg-black/20 px-3 py-2 text-[14px] text-zinc-200 placeholder:text-[var(--muted)] focus:outline-none focus:ring-1 focus:ring-white/15"
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {actions.map((a) => (
          <button
            key={a.id}
            type="button"
            disabled={busy}
            onClick={() => void run(a)}
            className="rounded-md bg-white/[0.06] px-3 py-1.5 text-[13px] font-medium text-zinc-200 hover:bg-white/[0.1] hover:text-zinc-50 disabled:opacity-60"
          >
            {a.label}
          </button>
        ))}
        <p role="status" className="ml-1 text-[13px]">
          {status.state === 'processing' && <span className="text-[var(--muted)]">{status.label}: processing…</span>}
          {status.state === 'success' && <span className="text-emerald-300">{status.message}</span>}
          {status.state === 'failure' && <span className="text-red-300">{status.message}</span>}
        </p>
      </div>
    </section>
  )
}
