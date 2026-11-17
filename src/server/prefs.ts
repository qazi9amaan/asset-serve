import { createServerFn } from '@tanstack/react-start'
import { sanitizeSettings, type Settings } from '#/lib/settings'

// Viewer preferences live on disk next to the registry, not in the browser.
export const getPrefs = createServerFn({ method: 'GET' }).handler(async (): Promise<Settings | null> => {
  const { readPrefs } = await import('#/lib/registry')
  const raw = readPrefs()
  return raw === null ? null : sanitizeSettings(raw)
})

export const savePrefs = createServerFn({ method: 'POST' })
  .validator((d: unknown) => sanitizeSettings(d))
  .handler(async ({ data }) => {
    const { writePrefs } = await import('#/lib/registry')
    writePrefs(data)
    return data
  })
