import { createCsrfMiddleware, createMiddleware, createStart } from '@tanstack/react-start'

// CSRF protection for server functions. Registering any requestMiddleware here
// replaces the framework's default, so we re-add it (see TanStack Start docs).
const csrfMiddleware = createCsrfMiddleware({ filter: (ctx) => ctx.handlerType === 'serverFn' })

// Password gate on every request. Open when ASSET_SERVE_PASSWORD is unset.
// /login serves its own page and must stay reachable to avoid a redirect loop.
// Static assets (/assets, /_build) are served before this handler, so they stay open.
const authMiddleware = createMiddleware({ type: 'request' }).server(async ({ request, pathname, next }) => {
  const password = process.env.ASSET_SERVE_PASSWORD
  if (!password || pathname === '/login') return next()
  const { isAuthed } = await import('#/server/auth')
  if (isAuthed(request, password)) return next()
  return new Response(null, { status: 302, headers: { location: '/login' } })
})

export const startInstance = createStart(() => ({
  requestMiddleware: [authMiddleware, csrfMiddleware],
}))
