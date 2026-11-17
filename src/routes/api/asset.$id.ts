import { createFileRoute } from '@tanstack/react-router'

// Serves images referenced by relative paths in a registered markdown file:
//   GET /api/asset/<id>?p=images/foo.png
// The browser sends the file id and the path as written in the markdown, never
// an absolute path. The path is resolved against that markdown file's folder,
// symlinks included, and must stay inside that folder tree. Images only.
const TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
}
const MAX_BYTES = 20 * 1024 * 1024

const notFound = () => new Response('Not found', { status: 404, headers: { 'content-type': 'text/plain' } })

export const Route = createFileRoute('/api/asset/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { readFile, realpath, stat } = await import('node:fs/promises')
        const { dirname, extname, isAbsolute, resolve, sep } = await import('node:path')
        const { getEntry } = await import('#/lib/registry')

        const entry = getEntry(String(params.id))
        let rel = new URL(request.url).searchParams.get('p') ?? ''
        try {
          rel = decodeURIComponent(rel) // markdown may write "my%20shot.png"
        } catch {
          // not percent-encoded; use as is
        }
        rel = rel.replace(/[?#].*$/, '')
        // Relative paths only: no absolute paths, no schemes, no NUL bytes.
        if (!entry || !rel || rel.includes('\0') || isAbsolute(rel) || /^[a-z][a-z0-9+.-]*:/i.test(rel)) {
          return notFound()
        }
        const type = TYPES[extname(rel).toLowerCase()]
        if (!type) return notFound()

        try {
          // realpath both sides, so neither "../" nor a symlink can step outside.
          const base = await realpath(dirname(entry.path))
          const target = await realpath(resolve(base, rel))
          if (!target.startsWith(base + sep)) return notFound()
          if (TYPES[extname(target).toLowerCase()] !== type) return notFound()
          const s = await stat(target)
          if (!s.isFile() || s.size > MAX_BYTES) return notFound()
          const body = await readFile(target) // read fresh every time; nothing cached server-side
          return new Response(new Uint8Array(body), {
            headers: {
              'content-type': type,
              'cache-control': 'no-cache',
              'x-content-type-options': 'nosniff',
              // SVG can carry script; if opened directly, it runs sandboxed with no origin.
              'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
            },
          })
        } catch {
          return notFound()
        }
      },
    },
  },
})
