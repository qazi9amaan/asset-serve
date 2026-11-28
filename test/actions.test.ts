import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

process.env.ASSET_SERVE_HOME = mkdtempSync(join(tmpdir(), 'as-actions-'))
// HOME_DIR is read at import time, so import after setting the env.
const { writeRegistry } = await import('../src/lib/registry.ts')
const { dispatch } = await import('../src/server/actions.ts')

const base = { path: '/tmp/a.md', title: 'A', tags: [], addedAt: '2026-01-01T00:00:00.000Z' }
writeRegistry([
  { ...base, id: 'plain000' },
  { ...base, id: 'live0000', interactive: true, actions: [{ id: 'approve', label: 'Approve' }] },
])

test('a registered action on an interactive doc succeeds', () => {
  assert.deepEqual(dispatch('live0000', 'approve'), { ok: true, message: 'Approve: done.' })
})

test('unknown action, read-only doc and unknown id fail', () => {
  assert.equal(dispatch('live0000', 'nope').ok, false)
  assert.equal(dispatch('plain000', 'approve').ok, false)
  assert.equal(dispatch('missing0', 'approve').ok, false)
})
