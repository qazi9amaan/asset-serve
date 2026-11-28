import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

const home = mkdtempSync(join(tmpdir(), 'as-actions-'))
process.env.ASSET_SERVE_HOME = home
// HOME_DIR is read at import time, so import after setting the env.
const { writeRegistry } = await import('../src/lib/registry.ts')
const { dispatch, ACTIONS_LOG } = await import('../src/server/actions.ts')

const doc = join(home, 'a.md')
writeFileSync(doc, '# A\n')
const rev = () => statSync(doc).mtimeMs
const base = { path: doc, title: 'A', tags: [], addedAt: '2026-01-01T00:00:00.000Z' }
const callback = { handler: 'h', context_id: 'c1' }
writeRegistry([
  { ...base, id: 'plain000' },
  { ...base, id: 'live0000', interactive: true, actions: [{ id: 'approve', label: 'Approve' }], callback },
])

test('a valid action for the current revision is recorded with its feedback', () => {
  const v = dispatch('live0000', 'approve', rev(), 'looks good')
  assert.deepEqual(v, { ok: true, message: 'Approve: saved for the agent.' })
  const rec = JSON.parse(readFileSync(ACTIONS_LOG, 'utf8').trim())
  assert.deepEqual(
    { ...rec, at: undefined },
    { at: undefined, id: 'live0000', action_id: 'approve', revision: rev(), feedback: 'looks good', callback },
  )
})

test('stale revision, unknown action, read-only doc and unknown id fail without recording', () => {
  const before = existsSync(ACTIONS_LOG) ? readFileSync(ACTIONS_LOG, 'utf8') : ''
  assert.deepEqual(dispatch('live0000', 'approve', rev() - 1000, ''), { ok: false, message: 'The doc changed. Review it again.' })
  assert.equal(dispatch('live0000', 'nope', rev(), '').ok, false)
  assert.equal(dispatch('plain000', 'approve', rev(), '').ok, false)
  assert.equal(dispatch('missing0', 'approve', rev(), '').ok, false)
  assert.equal(existsSync(ACTIONS_LOG) ? readFileSync(ACTIONS_LOG, 'utf8') : '', before)
})
