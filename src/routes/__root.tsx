import { HeadContent, Outlet, Scripts, createRootRoute, useRouter } from '@tanstack/react-router'
import { DocSwitcher } from '#/components/DocSwitcher'
import { PaletteProvider } from '#/components/Palette'
import { Sidebar } from '#/components/Sidebar'
import { EventsProvider, useLiveEvent } from '#/lib/events'
import { DEFAULT_SETTINGS, SettingsProvider, htmlSettingsAttrs, useSettings } from '#/lib/settings'
import { listFiles } from '#/server/fns'
import { getPrefs } from '#/server/prefs'

import appCss from '../styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { name: 'color-scheme', content: 'dark' },
      { title: 'asset-serve' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      {
        rel: 'icon',
        href: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='8' fill='black'/><text x='16' y='22' font-size='15' font-family='monospace' fill='%237dd3fc' text-anchor='middle'>md</text></svg>",
      },
    ],
  }),
  loader: async () => {
    const [files, prefs] = await Promise.all([listFiles(), getPrefs()])
    return { files, prefs }
  },
  staleTime: Infinity, // refreshed by live events, not on navigation
  shellComponent: RootDocument,
  component: Layout,
  notFoundComponent: () => (
    <div className="flex flex-1 items-center justify-center text-sm text-[var(--muted)]">Not found.</div>
  ),
})

function RootDocument({ children }: { children: React.ReactNode }) {
  // Saved preferences are rendered straight into <html>, so the very first paint
  // already has the right font, width and sidebar. Client changes update these
  // attributes directly, hence suppressHydrationWarning.
  const { prefs } = Route.useLoaderData()
  return (
    <html
      lang="en"
      className="bg-[var(--bg)]"
      suppressHydrationWarning
      {...htmlSettingsAttrs(prefs ?? DEFAULT_SETTINGS)}
    >
      <head>
        <HeadContent />
      </head>
      <body className="bg-[var(--bg)] text-zinc-200 antialiased">
        {children}
        <Scripts />
      </body>
    </html>
  )
}

function Layout() {
  return (
    <EventsProvider>
      <SettingsProvider initial={Route.useLoaderData().prefs}>
        <Shell />
      </SettingsProvider>
    </EventsProvider>
  )
}

function Shell() {
  const { files } = Route.useLoaderData()
  const router = useRouter()
  const { drawerOpen, setDrawerOpen } = useSettings()

  useLiveEvent((e) => {
    if (e.type === 'registry') void router.invalidate({ filter: (m) => m.routeId === '__root__' })
  })


  return (
    <PaletteProvider files={files}>
      <div className="flex h-dvh overflow-hidden bg-[var(--bg)]">
        <div className="app-sidebar hidden md:flex">
          <Sidebar files={files} />
        </div>

        {drawerOpen && (
          <div className="fixed inset-0 z-40 flex md:hidden">
            <Sidebar files={files} onNavigate={() => setDrawerOpen(false)} />
            <button
              type="button"
              aria-label="Close sidebar"
              className="flex-1 bg-black/70"
              onClick={() => setDrawerOpen(false)}
            />
          </div>
        )}

        <main className="relative flex min-w-0 flex-1 flex-col">
          <Outlet />
        </main>

        <DocSwitcher files={files} />
      </div>
    </PaletteProvider>
  )
}
