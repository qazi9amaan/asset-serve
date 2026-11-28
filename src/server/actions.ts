// Interactive action dispatch. Server-only: fns.ts imports it dynamically, so
// the handler map and the token secret never reach the client bundle.
import { randomUUID } from 'node:crypto'
import { stat } from 'node:fs/promises'
import { getEntry, type Entry } from '../lib/registry.ts'
import { signActionToken, verifyActionToken } from './auth.ts'

export interface ActionEvent {
  event_id: string
  asset_id: string
  revision: number
  action_id: string
  feedback: string
  context_ref: string
}

export type Verdict = { verdict: 'accept' | 'reject'; message?: string }
export type ActionHandler = (event: ActionEvent) => Verdict | Promise<Verdict>

export interface ActionRequest {
  id: string
  actionId: string
  nonce: string
  token: string
  feedback: string
}

export type DispatchResult = ({ ok: true } & Verdict) | { ok: false; error: string }

// Handlers are named in code on the server; a registry entry can only pick one by name.
const handlers = new Map<string, ActionHandler>()

export const registerHandler = (name: string, fn: ActionHandler) => void handlers.set(name, fn)

export type IssuedAction = { id: string; label: string; nonce: string; token: string }

// Signs one token per action for this exact revision, for the viewer to send back.
// Null for read-only entries, or when no secret is set (doc then shows without buttons).
export function issueActions(entry: Entry, revision: number): IssuedAction[] | null {
  if (!entry.interactive || !entry.actions?.length) return null
  try {
    return entry.actions.map(({ id, label }) => {
      const nonce = randomUUID()
      return { id, label, nonce, token: signActionToken({ asset_id: entry.id, revision, action_id: id, nonce }) }
    })
  } catch {
    return null
  }
}

export async function dispatchAction(req: ActionRequest): Promise<DispatchResult> {
  const entry = getEntry(req.id)
  if (!entry) return { ok: false, error: 'Not a registered file.' }
  if (!entry.interactive || !entry.actions?.some((a) => a.id === req.actionId))
    return { ok: false, error: 'Unknown action for this file.' }

  let revision: number
  try {
    revision = (await stat(entry.path)).mtimeMs
  } catch {
    return { ok: false, error: 'File is missing on disk.' }
  }

  // Signed against the current revision, so a token from an older version of the file fails.
  let valid = false
  try {
    valid = verifyActionToken(req.token, { asset_id: entry.id, revision, action_id: req.actionId, nonce: req.nonce })
  } catch {
    return { ok: false, error: 'Actions are not configured on this server (ASSET_SERVE_SECRET is not set).' }
  }
  if (!valid) return { ok: false, error: 'Invalid or stale action token. Reload the file and try again.' }

  const handler = entry.callback && handlers.get(entry.callback.handler)
  if (!entry.callback || !handler) return { ok: false, error: 'No registered handler for this file.' }

  const event: ActionEvent = {
    event_id: randomUUID(),
    asset_id: entry.id,
    revision,
    action_id: req.actionId,
    feedback: req.feedback,
    context_ref: entry.callback.context_id,
  }
  try {
    const { verdict, message } = await handler(event)
    if (verdict !== 'accept' && verdict !== 'reject') return { ok: false, error: 'Handler returned no verdict.' }
    return message === undefined ? { ok: true, verdict } : { ok: true, verdict, message }
  } catch {
    return { ok: false, error: 'Handler failed.' }
  }
}
