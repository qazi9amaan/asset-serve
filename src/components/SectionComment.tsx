import { useState } from 'react'
import type { IssuedAction } from '#/server/actions'
import { runAction } from '#/server/fns'
import { sectionFeedback, type Heading } from './blocks'

type Status =
  | { state: 'idle' }
  | { state: 'processing' }
  | { state: 'success' | 'failure'; message: string }

// Margin "comment" control on a section heading, opening an inline box that
// sends request_changes for that section. Each box keeps its own state.
export function SectionComment({
  fileId,
  heading,
  action,
  onSubmitted,
}: {
  fileId: string
  heading: Heading
  action: IssuedAction
  onSubmitted?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [comment, setComment] = useState('')
  const [status, setStatus] = useState<Status>({ state: 'idle' })
  const busy = status.state === 'processing'

  const submit = async () => {
    if (!comment.trim()) return
    setStatus({ state: 'processing' })
    try {
      const res = await runAction({
        data: {
          id: fileId,
          actionId: action.id,
          nonce: action.nonce,
          token: action.token,
          head: action.head,
          feedback: sectionFeedback(heading, comment),
        },
      })
      if (!res.ok) return setStatus({ state: 'failure', message: res.error })
      const accepted = res.verdict === 'accept'
      setStatus({
        state: accepted ? 'success' : 'failure',
        message: res.message ?? (accepted ? 'Accepted.' : 'Rejected.'),
      })
      if (accepted) setComment('')
    } catch {
      setStatus({ state: 'failure', message: "Couldn't reach the server. Try again." })
    } finally {
      // The nonce is single-use either way; fetch fresh tokens for the next submit.
      onSubmitted?.()
    }
  }

  return (
    <>
      <button
        type="button"
        className="md-comment"
        aria-expanded={open}
        aria-label={`Comment on "${heading.text}"`}
        title="Comment on this section"
        onClick={() => setOpen((o) => !o)}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z" />
        </svg>
      </button>
      {open && (
        <form
          className="md-comment-box"
          aria-label={`Comment on ${heading.text}`}
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={4000}
            rows={3}
            autoFocus
            placeholder={`Request changes to "${heading.text}"`}
            aria-label="Comment"
          />
          <div className="md-comment-bar">
            <p role="status">
              {status.state === 'processing' && <span className="text-[var(--muted)]">Sending…</span>}
              {status.state === 'success' && <span className="text-emerald-300">{status.message}</span>}
              {status.state === 'failure' && <span className="text-red-300">{status.message}</span>}
            </p>
            <button type="button" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="submit" disabled={busy || !comment.trim()} className="is-primary">
              Request changes
            </button>
          </div>
        </form>
      )}
    </>
  )
}
