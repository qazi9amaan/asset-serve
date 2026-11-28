// Checks an action click from the viewer against the registry. Plain module
// (no server-fn wrapper) so node --test can import it directly.
import { getEntry } from '../lib/registry.ts'

export type Verdict = { ok: boolean; message: string }

// No callback runner exists yet, so a valid action is accepted as-is;
// entry.callback is never called from here.
export function dispatch(id: string, actionId: string): Verdict {
  const entry = getEntry(id)
  if (!entry) return { ok: false, message: 'This file is not registered.' }
  if (!entry.interactive) return { ok: false, message: 'This file has no actions.' }
  const action = entry.actions?.find((a) => a.id === actionId)
  if (!action) return { ok: false, message: 'Unknown action.' }
  return { ok: true, message: `${action.label}: done.` }
}
