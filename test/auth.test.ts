import assert from 'node:assert/strict'
import { test } from 'node:test'

process.env.ASSET_SERVE_SECRET = 'test-secret'
const { signActionToken, verifyActionToken } = await import('../src/server/auth.ts')

const scope = { asset_id: 'aaaaaaaa', revision: 3, action_id: 'approve', nonce: 'n-123' }

test('action token verifies for the exact scope it was signed for', () => {
  const token = signActionToken(scope)
  assert.match(token, /^[a-f0-9]{64}$/)
  assert.equal(verifyActionToken(token, { ...scope }), true)
})

test('tampered token or changed field fails', () => {
  const token = signActionToken(scope)
  const flipped = (token[0] === 'a' ? 'b' : 'a') + token.slice(1)
  assert.equal(verifyActionToken(flipped, scope), false)
  assert.equal(verifyActionToken(token.slice(1), scope), false)
  assert.equal(verifyActionToken(token, { ...scope, asset_id: 'bbbbbbbb' }), false)
  assert.equal(verifyActionToken(token, { ...scope, action_id: 'reject' }), false)
  assert.equal(verifyActionToken(token, { ...scope, nonce: 'n-124' }), false)
})

test('token is scoped to the exact revision', () => {
  const old = signActionToken(scope)
  assert.equal(verifyActionToken(old, { ...scope, revision: 4 }), false)
  const next = signActionToken({ ...scope, revision: 4 })
  assert.equal(verifyActionToken(next, scope), false)
})

test('a different secret fails', () => {
  const token = signActionToken(scope)
  process.env.ASSET_SERVE_SECRET = 'other-secret'
  try {
    assert.equal(verifyActionToken(token, scope), false)
  } finally {
    process.env.ASSET_SERVE_SECRET = 'test-secret'
  }
})
