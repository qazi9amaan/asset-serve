import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, test } from 'node:test'

const home = mkdtempSync(join(tmpdir(), 'as-roadmap-'))
process.env.ASSET_SERVE_HOME = home
process.env.ASSET_SERVE_ROADMAPS = join(home, 'roadmaps')
process.env.ASSET_SERVE_SECRET = 'test-secret'
// HOME_DIR and ROADMAPS_DIR are read at import time, so import after setting the env.
const { idFor, writeRegistry } = await import('../src/lib/registry.ts')
const { headFor, writeRoadmap } = await import('../src/server/roadmap.ts')
const { clearSpentNonces, dispatchAction, issueActions, registerHandler } = await import('../src/server/actions.ts')

const git = (dir: string, ...args: string[]) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' }).trim()

let calls = 0
registerHandler('review', () => {
  calls++
  return { verdict: 'accept' }
})

const setup = (product: string) => {
  const { path } = writeRoadmap(product, 'roadmap.md', '# Roadmap\n\nv1\n')
  const entry = {
    id: idFor(path),
    path,
    title: 'Roadmap',
    tags: [],
    addedAt: '2026-01-01T00:00:00.000Z',
    interactive: true,
    actions: [{ id: 'approve', label: 'Approve' }],
    callback: { handler: 'review', context_id: 'ctx' },
  }
  writeRegistry([entry])
  const [a] = issueActions(entry, statSync(path).mtimeMs)!
  return { path, entry, a, req: { id: entry.id, actionId: a.id, nonce: a.nonce, token: a.token, head: a.head, feedback: '' } }
}

beforeEach(() => {
  clearSpentNonces()
  calls = 0
})

test('first roadmap creates a repo with bot identity and .gitignore; each update commits at a stable path', () => {
  const first = writeRoadmap('alpha', 'roadmap.md', '# A\n')
  const dir = join(home, 'roadmaps', 'alpha')
  assert.equal(first.path, join(dir, 'roadmap.md'))
  assert.equal(readFileSync(join(dir, '.gitignore'), 'utf8'), '*.tmp\n')
  assert.equal(git(dir, 'log', '-1', '--format=%an <%ae>'), 'asset-serve-bot <asset-serve-bot@localhost>')
  const second = writeRoadmap('alpha', 'roadmap.md', '# A\n\nmore\n')
  assert.equal(second.path, first.path)
  assert.notEqual(second.head, first.head)
  assert.equal(headFor(second.path), second.head)
  assert.equal(git(dir, 'rev-list', '--count', 'HEAD'), '3') // init + 2 updates
})

test('a failed write keeps the last committed doc', () => {
  const { path } = writeRoadmap('beta', 'roadmap.md', '# Good\n')
  const dir = join(home, 'roadmaps', 'beta')
  // A directory at the temp-file path makes the write fail midway.
  mkdirSync(`${path}.${process.pid}.tmp`)
  assert.throws(() => writeRoadmap('beta', 'roadmap.md', '# Half'))
  assert.equal(readFileSync(path, 'utf8'), '# Good\n')
  assert.equal(git(dir, 'status', '--porcelain'), '')
})

test('a failed first write leaves no doc behind', () => {
  const dir = join(home, 'roadmaps', 'gamma')
  writeRoadmap('gamma', 'other.md', 'x')
  mkdirSync(join(dir, `roadmap.md.${process.pid}.tmp`))
  assert.throws(() => writeRoadmap('gamma', 'roadmap.md', '# Half'))
  assert.equal(existsSync(join(dir, 'roadmap.md')), false)
})

test('a token from an older roadmap HEAD is turned away', async () => {
  const { req, a } = setup('delta')
  assert.match(a.head, /^[0-9a-f]{7,}$/)
  writeRoadmap('delta', 'roadmap.md', '# Roadmap\n\nv2\n')
  const res = await dispatchAction(req)
  assert.equal(res.ok, false)
  assert.match((res as { error: string }).error, /roadmap moved on.*reload/i)
  assert.equal(calls, 0)
})

test('a forged head is turned away by the signature', async () => {
  const { req, path } = setup('epsilon')
  const old = req.head
  writeRoadmap('epsilon', 'roadmap.md', '# Roadmap\n\nv2\n')
  // Claiming the new head with a token signed for the old one must fail verification.
  const res = await dispatchAction({ ...req, head: headFor(path) })
  assert.notEqual(old, headFor(path))
  assert.equal(res.ok, false)
  assert.match((res as { error: string }).error, /Invalid or stale/)
  assert.equal(calls, 0)
})

test('the same action token runs at most once', async () => {
  const { req } = setup('zeta')
  assert.deepEqual(await dispatchAction(req), { ok: true, verdict: 'accept' })
  const again = await dispatchAction(req)
  assert.equal(again.ok, false)
  assert.match((again as { error: string }).error, /already used/)
  assert.equal(calls, 1)
})
