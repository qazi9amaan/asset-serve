import assert from 'node:assert/strict'
import { mkdtempSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

const home = mkdtempSync(join(tmpdir(), 'as-actions-'))
process.env.ASSET_SERVE_HOME = home
process.env.ASSET_SERVE_SECRET = 'test-secret'
// HOME_DIR is read at import time, so import after setting the env.
const { writeRegistry } = await import('../src/lib/registry.ts')
const { signActionToken } = await import('../src/server/auth.ts')
const { dispatchAction, registerHandler } = await import('../src/server/actions.ts')
type ActionEvent = import('../src/server/actions.ts').ActionEvent

const path = join(home, 'plan.md')
writeFileSync(path, '# Plan\n')
const entry = {
  id: 'aaaaaaaa',
  path,
  title: 'Plan',
  tags: [],
  addedAt: '2026-01-01T00:00:00.000Z',
  interactive: true,
  actions: [{ id: 'approve', label: 'Approve' }],
  callback: { handler: 'review', context_id: 'ctx-1' },
}
const tokenFor = (revision: number) => signActionToken({ asset_id: entry.id, revision, action_id: 'approve', nonce: 'n-1' })
const req = (token: string) => ({ id: entry.id, actionId: 'approve', nonce: 'n-1', token, feedback: 'looks good' })

const seen: ActionEvent[] = []
registerHandler('review', (e) => {
  seen.push(e)
  return { verdict: 'accept', message: 'thanks' }
})

test('valid token forwards the event and returns the verdict', async () => {
  writeRegistry([entry])
  seen.length = 0
  const revision = statSync(path).mtimeMs
  const res = await dispatchAction(req(tokenFor(revision)))
  assert.deepEqual(res, { ok: true, verdict: 'accept', message: 'thanks' })
  assert.equal(seen.length, 1)
  const { event_id, ...rest } = seen[0]
  assert.match(event_id, /^[0-9a-f-]{36}$/)
  assert.deepEqual(rest, { asset_id: entry.id, revision, action_id: 'approve', feedback: 'looks good', context_ref: 'ctx-1' })
})

test('bad or stale token is turned away and nothing is forwarded', async () => {
  writeRegistry([entry])
  seen.length = 0
  const revision = statSync(path).mtimeMs
  for (const token of ['nope', tokenFor(revision - 1000)]) {
    const res = await dispatchAction(req(token))
    assert.equal(res.ok, false)
    assert.match((res as { error: string }).error, /Invalid or stale/)
  }
  assert.equal(seen.length, 0)
})

test('unregistered handler name is refused', async () => {
  writeRegistry([{ ...entry, callback: { handler: 'ghost', context_id: 'ctx-1' } }])
  seen.length = 0
  const res = await dispatchAction(req(tokenFor(statSync(path).mtimeMs)))
  assert.deepEqual(res, { ok: false, error: 'No registered handler for this file.' })
  assert.equal(seen.length, 0)
})
