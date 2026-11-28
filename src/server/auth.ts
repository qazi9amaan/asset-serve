// Password gate. Active only when ASSET_SERVE_PASSWORD is set; otherwise the
// app is fully open (unchanged behavior). Server-only: imported dynamically so
// node:crypto never reaches the client bundle, like the rest of src/server.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

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

// Interactive action tokens: an HMAC over one exact asset/revision/action/nonce
// tuple, so a token can't be replayed on another doc, a newer revision, or
// another action. Without ASSET_SERVE_SECRET, a random per-process key is used
// (tokens then stop working after a restart, fine for short-lived actions).
export type ActionTokenFields = { assetId: string; revision: string; actionId: string; nonce: string }

let fallbackSecret: string | undefined
const actionSecret = () =>
  process.env.ASSET_SERVE_SECRET || (fallbackSecret ??= randomBytes(32).toString('hex'))

// JSON array encoding keeps distinct tuples distinct (no separator collisions).
const actionMessage = (f: ActionTokenFields) => JSON.stringify([f.assetId, f.revision, f.actionId, f.nonce])

export const signActionToken = (f: ActionTokenFields) =>
  createHmac('sha256', actionSecret()).update(actionMessage(f)).digest('hex')

export const verifyActionToken = (token: string, f: ActionTokenFields) => safeEqual(token, signActionToken(f))
