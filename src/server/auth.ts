// Password gate. Active only when ASSET_SERVE_PASSWORD is set; otherwise the
// app is fully open (unchanged behavior). Server-only: imported dynamically so
// node:crypto never reaches the client bundle, like the rest of src/server.
import { createHmac, timingSafeEqual } from 'node:crypto'

const COOKIE = 'asset-serve-session'
const MAX_AGE = 60 * 60 * 24 * 30 // 30 days

// Deterministic session token: HMAC of the password keyed by itself. No store
// needed — a cookie is valid iff it equals this, and the password never leaves
// the server (the cookie is a derived digest, not the password).
const tokenFor = (password: string) => createHmac('sha256', password).update(password).digest('hex')

const safeEqual = (a: string, b: string) => {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB)
}

export const sessionCookie = (password: string) =>
  `${COOKIE}=${tokenFor(password)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${MAX_AGE}`

export function isAuthed(request: Request, password: string): boolean {
  const m = (request.headers.get('cookie') ?? '').match(/(?:^|;\s*)asset-serve-session=([a-f0-9]+)/)
  return m ? safeEqual(m[1], tokenFor(password)) : false
}

export const passwordMatches = (submitted: string, password: string) => safeEqual(submitted, password)

// Interactive action tokens: HMAC over the exact asset, revision, action and
// nonce, keyed by ASSET_SERVE_SECRET. Any changed field (e.g. a newer revision) fails.
// `head` is the roadmap repo's short SHA; omitted (= '') for files outside a roadmap repo.
export type ActionScope = { asset_id: string; revision: string | number; action_id: string; nonce: string; head?: string }

const actionSecret = () => {
  const secret = process.env.ASSET_SERVE_SECRET
  if (!secret) throw new Error('ASSET_SERVE_SECRET is not set')
  return secret
}

// JSON array encoding keeps field boundaries unambiguous whatever the fields contain.
const actionMessage = (s: ActionScope) => JSON.stringify([s.asset_id, String(s.revision), s.action_id, s.nonce, s.head ?? ''])

export const signActionToken = (scope: ActionScope) =>
  createHmac('sha256', actionSecret()).update(actionMessage(scope)).digest('hex')

export const verifyActionToken = (token: string, scope: ActionScope) => safeEqual(token, signActionToken(scope))
