import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import type { Entry } from '../src/lib/registry.ts'

const home = mkdtempSync(join(tmpdir(), 'as-test-'))
process.env.ASSET_SERVE_HOME = home
// HOME_DIR is read at import time, so import after setting the env.
const { readRegistry, writeRegistry, idFor, REGISTRY_PATH } = await import('../src/lib/registry.ts')

const BIN = resolve(import.meta.dirname, '../bin/asset-serve.mjs')
const cli = (...args: string[]) =>
  execFileSync(process.execPath, [BIN, ...args], {
    env: { ...process.env, ASSET_SERVE_HOME: home },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
const md = (name: string) => {
  const p = join(home, name)
  writeFileSync(p, `# ${name}\n`)
  return p
}

const oldEntry: Entry = { id: 'aaaaaaaa', path: '/tmp/old.md', title: 'Old', tags: ['x'], addedAt: '2026-01-01T00:00:00.000Z' }
const newEntry: Entry = {
  ...oldEntry,
  id: 'bbbbbbbb',
  interactive: true,
  actions: [{ id: 'run', label: 'Run' }],
  callback: { handler: 'doThing', context_id: 'ctx1' },
}

test('registry round-trips old and new entries unchanged', () => {
  writeRegistry([oldEntry, newEntry])
  assert.deepEqual(readRegistry(), [oldEntry, newEntry])
})

test('add without new flags writes the same keys as before', () => {
  writeRegistry([])
  const p = md('plain.md')
  cli('add', p, '--tags', 'a')
  const [e] = readRegistry()
  assert.deepEqual(Object.keys(e).sort(), ['addedAt', 'id', 'path', 'tags', 'title'])
})

test('add writes interactive fields, list handles mixed entries', () => {
  writeRegistry([oldEntry])
  const p = md('live.md')
  cli('add', p, '--interactive', '--action', 'run:Run', '--action', 'stop:Stop: now', '--handler', 'doThing', '--context', 'ctx1')
  const e = readRegistry().find((x) => x.id === idFor(p))!
  assert.equal(e.interactive, true)
  assert.deepEqual(e.actions, [{ id: 'run', label: 'Run' }, { id: 'stop', label: 'Stop: now' }])
  assert.deepEqual(e.callback, { handler: 'doThing', context_id: 'ctx1' })
  // Re-adding without flags keeps the fields.
  cli('add', p)
  assert.deepEqual(readRegistry().find((x) => x.id === e.id), e)
  assert.deepEqual(JSON.parse(readFileSync(REGISTRY_PATH, 'utf8')).files[0], oldEntry)
  const out = cli('list')
  assert.match(out, /aaaaaaaa {2}Old/)
  assert.match(out, new RegExp(`${e.id} {2}live\\.md`))
})

test('add turns away bad interactive flags', () => {
  const p = md('bad.md')
  for (const args of [['--action', 'nolabel'], ['--action', ':x'], ['--handler', 'h'], ['--context', 'c'], ['--action', 'a:A', '--action', 'a:B']]) {
    assert.throws(() => cli('add', p, ...args), /asset-serve: /)
  }
  assert.equal(readRegistry().some((x) => x.id === idFor(p)), false)
})
