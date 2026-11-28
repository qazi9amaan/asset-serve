import assert from 'node:assert/strict'
import { mkdtempSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, test } from 'node:test'

const home = mkdtempSync(join(tmpdir(), 'as-btr-'))
process.env.ASSET_SERVE_HOME = home
process.env.ASSET_SERVE_ROADMAPS = join(home, 'roadmaps')
process.env.ASSET_SERVE_SECRET = 'test-secret'
// HOME_DIR and ROADMAPS_DIR are read at import time, so import after setting the env.
const { idFor, writeRegistry } = await import('../src/lib/registry.ts')
const { writeRoadmap } = await import('../src/server/roadmap.ts')
const { clearSpentNonces, dispatchAction, issueActions } = await import('../src/server/actions.ts')
const { readApprovals, readReplies, registerBtr } = await import('../src/server/btr.ts')

registerBtr()

const publish = (product: string) => {
  const { path, head } = writeRoadmap(product, 'roadmap.md', '# Roadmap\n\n## Wave 1\n')
  const entry = {
    id: idFor(path),
    path,
    title: 'Roadmap',
    tags: [],
    addedAt: '2026-01-01T00:00:00.000Z',
    interactive: true,
    actions: [
      { id: 'approve', label: 'Approve' },
      { id: 'request_changes', label: 'Request changes' },
    ],
    callback: { handler: 'btr', context_id: `task-${product}` },
  }
  writeRegistry([entry])
  return { path, head, entry }
}

// What the viewer sends back after loading the page: fresh tokens for the current revision.
const load = (entry: ReturnType<typeof publish>['entry'], actionId: string, feedback = '') => {
  const a = issueActions(entry, statSync(entry.path).mtimeMs)!.find((x) => x.id === actionId)!
  return { id: entry.id, actionId, nonce: a.nonce, token: a.token, head: a.head, feedback }
}

beforeEach(() => clearSpentNonces())

test('approve records the reviewed HEAD for the BTR task', async () => {
  const { head, entry } = publish('alpha')
  const res = await dispatchAction(load(entry, 'approve'))
  assert.equal(res.ok, true)
  assert.equal((res as { verdict: string }).verdict, 'accept')
  const mine = readApprovals().filter((a) => a.task_id === 'task-alpha')
  assert.equal(mine.length, 1)
  assert.equal(mine[0].head, head)
  assert.equal(mine[0].asset_id, entry.id)
})

test('a stale approve (roadmap moved on) is turned away and nothing is recorded', async () => {
  const { entry } = publish('beta')
  const req = load(entry, 'approve')
  writeRoadmap('beta', 'roadmap.md', '# Roadmap\n\n## Wave 1\n\nrevised\n')
  const res = await dispatchAction(req)
  assert.equal(res.ok, false)
  assert.match((res as { error: string }).error, /roadmap moved on/i)
  assert.equal(readApprovals().filter((a) => a.task_id === 'task-beta').length, 0)
})

test('a second approve of the same revision is turned away', async () => {
  const { entry } = publish('gamma')
  assert.equal((await dispatchAction(load(entry, 'approve'))).ok, true)
  // A fresh token for the same HEAD passes dispatch but the handler turns it away as a duplicate.
  const fresh = load(entry, 'approve')
  assert.deepEqual(await dispatchAction(fresh), { ok: true, verdict: 'reject', message: 'This revision is already approved.' })
  // Replaying that token fails on the spent nonce.
  const replay = await dispatchAction(fresh)
  assert.equal(replay.ok, false)
  assert.match((replay as { error: string }).error, /already used/)
  assert.equal(readApprovals().filter((a) => a.task_id === 'task-gamma').length, 1)
})

test('request_changes forwards the feedback and section to the BTR task', async () => {
  const { head, entry } = publish('delta')
  const feedback = 'Re: Wave 1 (#wave-1)\n\nSplit this wave.'
  const res = await dispatchAction(load(entry, 'request_changes', feedback))
  assert.equal((res as { verdict: string }).verdict, 'accept')
  const [r] = readReplies().filter((x) => x.task_id === 'task-delta')
  assert.equal(r.message, feedback)
  assert.equal(r.head, head)
  assert.equal(readApprovals().filter((a) => a.task_id === 'task-delta').length, 0)
})
