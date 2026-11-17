// One file watcher per server process. Watches the registry and every registered
// markdown file, then fans change events out to connected SSE clients.
import { mkdirSync } from 'node:fs'
import { watch, type FSWatcher } from 'chokidar'
import { HOME_DIR, REGISTRY_PATH, readRegistry } from '#/lib/registry'

export type HubEvent = { type: 'registry' } | { type: 'file'; id: string }
type Listener = (e: HubEvent) => void

// Max one event per file per THROTTLE_MS. Fast writers (an agent streaming into
// a file) get a smooth ~10fps update instead of one event per write.
const THROTTLE_MS = 100

class Hub {
  private listeners = new Set<Listener>()
  private watcher: FSWatcher | null = null
  private pathToId = new Map<string, string>()
  private timers = new Map<string, { pending: boolean }>()

  subscribe(fn: Listener): () => void {
    this.start()
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private emit(e: HubEvent) {
    for (const fn of this.listeners) fn(e)
  }

  private throttled(key: string, e: HubEvent) {
    const t = this.timers.get(key)
    if (t) {
      t.pending = true
      return
    }
    // Leading edge fires now; anything arriving inside the window fires once at the end.
    this.emit(e)
    const state = { pending: false }
    const fire = () => {
      if (!state.pending) return void this.timers.delete(key)
      state.pending = false
      this.emit(e)
      setTimeout(fire, THROTTLE_MS)
    }
    setTimeout(fire, THROTTLE_MS)
    this.timers.set(key, state)
  }

  private syncWatchedFiles() {
    const next = new Map(readRegistry().map((e) => [e.path, e.id]))
    const removed = [...this.pathToId.keys()].filter((p) => !next.has(p))
    const added = [...next.keys()].filter((p) => !this.pathToId.has(p))
    this.pathToId = next
    if (removed.length) this.watcher?.unwatch(removed)
    if (added.length) this.watcher?.add(added)
  }

  private start() {
    if (this.watcher) return
    mkdirSync(HOME_DIR, { recursive: true })
    // Watch the directory, not the file: the CLI replaces registry.json via rename.
    // ASSET_SERVE_POLL=1 falls back to polling, for setups where file events don't
    // reach the process (some Docker bind mounts).
    const poll = process.env.ASSET_SERVE_POLL === '1'
    this.watcher = watch([HOME_DIR], { ignoreInitial: true, depth: 0, usePolling: poll, interval: 300 })
    this.watcher.on('all', (_event, path) => {
      if (path === REGISTRY_PATH) {
        this.syncWatchedFiles()
        this.throttled('__registry', { type: 'registry' })
        return
      }
      const id = this.pathToId.get(path)
      if (id) this.throttled(id, { type: 'file', id })
    })
    this.syncWatchedFiles()
  }
}

// Survive Vite HMR reloads of this module without leaking watchers.
const g = globalThis as typeof globalThis & { __assetServeHub?: Hub }
export const getHub = () => (g.__assetServeHub ??= new Hub())
