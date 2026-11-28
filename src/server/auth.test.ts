import { test } from 'node:test'
import assert from 'node:assert/strict'
import { signActionToken, verifyActionToken } from './auth.ts'

process.env.ASSET_SERVE_SECRET = 'test-only-secret'
const fields = { assetId: 'a1b2c3d4', revision: 'r1', actionId: 'approve', nonce: 'n-123' }

test('valid token verifies for its exact tuple', () => {
  assert.equal(verifyActionToken(signActionToken(fields), fields), true)
})

test('tampered token fails', () => {
  const token = signActionToken(fields)
  const flipped = (token[0] === '0' ? '1' : '0') + token.slice(1)
  assert.equal(verifyActionToken(flipped, fields), false)
  assert.equal(verifyActionToken(token.slice(1), fields), false)
  assert.equal(verifyActionToken('', fields), false)
})

test('stale revision or any other changed field fails', () => {
  const token = signActionToken(fields)
  assert.equal(verifyActionToken(token, { ...fields, revision: 'r2' }), false)
  assert.equal(verifyActionToken(token, { ...fields, assetId: 'deadbeef' }), false)
  assert.equal(verifyActionToken(token, { ...fields, actionId: 'reject' }), false)
  assert.equal(verifyActionToken(token, { ...fields, nonce: 'n-124' }), false)
})

test('field boundaries are unambiguous', () => {
  const a = { assetId: 'a', revision: 'b,c', actionId: 'd', nonce: 'e' }
  const b = { assetId: 'a', revision: 'b', actionId: 'c,d', nonce: 'e' }
  assert.equal(verifyActionToken(signActionToken(a), b), false)
})

test('a different secret fails', () => {
  const token = signActionToken(fields)
  process.env.ASSET_SERVE_SECRET = 'other-secret'
  try {
    assert.equal(verifyActionToken(token, fields), false)
  } finally {
    process.env.ASSET_SERVE_SECRET = 'test-only-secret'
  }
})
