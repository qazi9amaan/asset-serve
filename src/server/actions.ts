// Checks an action click from the viewer against the registry and records it.
// Plain module (no server-fn wrapper) so node --test can import it directly.
import { appendFileSync, mkdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { HOME_DIR, getEntry } from '../lib/registry.ts'

// One JSON line per accepted click, for the agent to read. There is no callback runner.
export const ACTIONS_LOG = join(HOME_DIR, 'actions.jsonl')

export type Verdict = { ok: boolean; message: string }

export function dispatch(id: string, actionId: string, revision: number, feedback: string): Verdict {
  const entry = getEntry(id)
  if (!entry) return { ok: false, message: 'This file is not registered.' }
  if (!entry.interactive) return { ok: false, message: 'This file has no actions.' }
  const action = entry.actions?.find((a) => a.id === actionId)
  if (!action) return { ok: false, message: 'Unknown action.' }
  let mtime: number
  try {
    mtime = statSync(entry.path).mtimeMs
  } catch {
    return { ok: false, message: 'The file is missing on disk.' }
  }
  // The click must be for the version the reader saw.
  if (mtime !== revision) return { ok: false, message: 'The doc changed. Review it again.' }
  mkdirSync(HOME_DIR, { recursive: true })
  const record = { at: new Date().toISOString(), id, action_id: actionId, revision, feedback, callback: entry.callback }
  appendFileSync(ACTIONS_LOG, JSON.stringify(record) + '\n')
  return { ok: true, message: `${action.label}: saved for the agent.` }
}
