// BTR bridge for interactive roadmaps. Server-only: fns.ts imports it dynamically.
// context_ref is the BTR task id. Replies and approvals go to files under HOME_DIR
// that the BTR runner reads; nothing here talks to the network or holds a secret.
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { HOME_DIR, getEntry } from '../lib/registry.ts'
import { registerHandler, type ActionEvent, type Verdict } from './actions.ts'
import { headFor } from './roadmap.ts'

export const REPLIES_PATH = join(HOME_DIR, 'btr-replies.json')
export const APPROVALS_PATH = join(HOME_DIR, 'btr-approvals.json')

export type BtrReply = { task_id: string; event_id: string; asset_id: string; revision: number; head: string; message: string; at: string }
export type BtrApproval = { task_id: string; event_id: string; asset_id: string; revision: number; head: string; at: string }

// Only a missing file means empty; anything else throws so callers fail closed.
function readList<T>(path: string): T[] {
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw err
  }
  const data = JSON.parse(raw)
  if (!Array.isArray(data)) throw new Error(`${path} is not a list`)
  return data
}

function writeList(path: string, list: unknown[]): void {
  mkdirSync(HOME_DIR, { recursive: true })
  const tmp = `${path}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(list, null, 2))
  renameSync(tmp, path)
}

export const readApprovals = () => readList<BtrApproval>(APPROVALS_PATH)
export const readReplies = () => readList<BtrReply>(REPLIES_PATH)

// The revision the reader acted on: dispatchAction already checked req.head against
// HEAD; re-read here and turn away if the file moved since (mtime = event.revision).
function reviewedHead(event: ActionEvent): string | null {
  const entry = getEntry(event.asset_id)
  if (!entry || statSync(entry.path).mtimeMs !== event.revision) return null
  return headFor(entry.path)
}

export async function btrHandler(event: ActionEvent): Promise<Verdict> {
  const task_id = event.context_ref
  if (!task_id) return { verdict: 'reject', message: 'This roadmap has no BTR task attached.' }
  const head = reviewedHead(event)
  if (head === null) return { verdict: 'reject', message: 'The roadmap moved on since you loaded it. Reload and try again.' }
  const at = new Date().toISOString()
  const base = { task_id, event_id: event.event_id, asset_id: event.asset_id, revision: event.revision, head }

  if (event.action_id === 'request_changes') {
    const message = event.feedback.trim()
    if (!message) return { verdict: 'reject', message: 'Say what should change.' }
    writeList(REPLIES_PATH, [...readReplies(), { ...base, message, at }])
    return { verdict: 'accept', message: 'Sent to the planner. The roadmap will update here.' }
  }

  if (event.action_id === 'approve') {
    if (!head) return { verdict: 'reject', message: 'Only a git-backed roadmap can be approved.' }
    const approvals = readApprovals()
    if (approvals.some((a) => a.task_id === task_id && a.head === head))
      return { verdict: 'reject', message: 'This revision is already approved.' }
    writeList(APPROVALS_PATH, [...approvals, { ...base, at }])
    return { verdict: 'accept', message: `Approved revision ${head}. Queuing can start.` }
  }

  return { verdict: 'reject', message: `Unknown action: ${event.action_id}` }
}

export const registerBtr = () => registerHandler('btr', btrHandler)
