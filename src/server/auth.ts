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

const safeEqual = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))

export const sessionCookie = (password: string) =>
  `${COOKIE}=${tokenFor(password)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${MAX_AGE}`

export function isAuthed(request: Request, password: string): boolean {
  const m = (request.headers.get('cookie') ?? '').match(/(?:^|;\s*)asset-serve-session=([a-f0-9]+)/)
  return m ? safeEqual(m[1], tokenFor(password)) : false
}

export const passwordMatches = (submitted: string, password: string) => safeEqual(submitted, password)
