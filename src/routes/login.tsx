import { createFileRoute } from '@tanstack/react-router'

// Plain HTML login page (no React): the app shell must not load until authed.
// Styled to match the viewer's charcoal theme.
function page(error: boolean): Response {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="dark" />
<title>asset-serve — sign in</title>
<style>
  :root { color-scheme: dark }
  * { box-sizing: border-box }
  body { margin: 0; min-height: 100dvh; display: grid; place-items: center;
    background: #141416; color: #e4e4e7;
    font: 16px/1.5 system-ui, -apple-system, Segoe UI, Roboto, sans-serif }
  form { width: 100%; max-width: 20rem; padding: 1.75rem;
    background: #1b1b1e; border: 1px solid rgba(255,255,255,.06); border-radius: 14px }
  h1 { margin: 0 0 1.25rem; font-size: 1.05rem; font-weight: 600 }
  input { width: 100%; padding: .6rem .7rem; border-radius: 9px;
    border: 1px solid rgba(255,255,255,.1); background: #141416; color: #e4e4e7; font-size: .95rem }
  input:focus { outline: none; border-color: #7dd3fc }
  button { width: 100%; margin-top: .9rem; padding: .6rem; border: 0; border-radius: 9px;
    background: #7dd3fc; color: #0b1620; font-weight: 600; font-size: .95rem; cursor: pointer }
  button:hover { background: #a5e4ff }
  .err { margin-top: .8rem; color: #fca5a5; font-size: .85rem }
</style>
</head>
<body>
<form method="post" action="/login">
  <h1>asset-serve</h1>
  <input type="password" name="password" placeholder="Password" autofocus autocomplete="current-password" />
  <button type="submit">Sign in</button>
  ${error ? '<div class="err">Wrong password.</div>' : ''}
</form>
</body>
</html>`
  return new Response(html, { status: error ? 401 : 200, headers: { 'content-type': 'text/html; charset=utf-8' } })
}

// Simple in-memory rate limiter for login attempts. 5 attempts per IP per 15 min.
const MAX_ATTEMPTS = 5
const WINDOW_MS = 15 * 60 * 1000
const attempts = new Map<string, { count: number; resetAt: number }>()

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const entry = attempts.get(ip)
  if (!entry || now > entry.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS })
    return false
  }
  entry.count++
  return entry.count > MAX_ATTEMPTS
}

export const Route = createFileRoute('/login')({
  server: {
    handlers: {
      GET: () => {
        if (!process.env.ASSET_SERVE_PASSWORD) return new Response(null, { status: 302, headers: { location: '/' } })
        return page(false)
      },
      POST: async ({ request }) => {
        const password = process.env.ASSET_SERVE_PASSWORD
        if (!password) return new Response(null, { status: 302, headers: { location: '/' } })
        const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
        if (isRateLimited(ip)) return new Response('Too many attempts. Try again later.', { status: 429, headers: { 'content-type': 'text/plain', 'retry-after': '900' } })
        const submitted = String((await request.formData()).get('password') ?? '')
        const { passwordMatches, sessionCookie } = await import('#/server/auth')
        if (!passwordMatches(submitted, password)) return page(true)
        return new Response(null, { status: 302, headers: { location: '/', 'set-cookie': sessionCookie(password) } })
      },
    },
  },
})
