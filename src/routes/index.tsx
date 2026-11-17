import { createFileRoute } from '@tanstack/react-router'
import { usePalette } from '#/components/Palette'
import { ConnectionNotice, SearchButton, SidebarToggle } from '#/components/ReaderControls'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  const { openPalette } = usePalette()
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex h-12 items-center px-3 md:px-4">
        <SidebarToggle />
        <span className="ml-auto flex items-center gap-2">
          <ConnectionNotice />
          <SearchButton />
        </span>
      </header>
    <div className="flex flex-1 items-center justify-center px-6 pb-12">
      <div className="max-w-md text-center">
        <h1 className="text-lg font-medium text-zinc-200">Pick a file from the sidebar</h1>
        <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
          Register markdown from your terminal. The page updates as files change.
        </p>
        <pre className="mt-6 rounded-xl border border-white/5 bg-[var(--surface)] p-4 text-left font-mono text-xs leading-6 text-zinc-400">
          {`asset-serve add ./notes.md --tags work
asset-serve add ./docs            # whole folder
asset-serve add "plans/**/*.md"   # glob
asset-serve list
asset-serve rm <id>`}
        </pre>
        <button type="button" onClick={() => openPalette()} className="mt-6 text-sm text-sky-300 hover:underline">
          Search your files <kbd className="ml-1 font-mono text-xs text-[var(--muted)]">/</kbd>
        </button>
      </div>
    </div>
    </div>
  )
}
