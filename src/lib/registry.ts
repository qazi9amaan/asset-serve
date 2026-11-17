// Shared registry used by both the CLI and the web server.
// Stores metadata only; markdown content is always read from disk.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, extname, join } from 'node:path'

export interface Entry {
  id: string
  path: string
  title: string
  tags: string[]
  addedAt: string
}

interface RegistryFile {
  version: 1
  files: Entry[]
}

export const HOME_DIR = process.env.ASSET_SERVE_HOME ?? join(homedir(), '.asset-serve')
export const REGISTRY_PATH = join(HOME_DIR, 'registry.json')
// Viewer preferences (font, width, sidebar...). Shared by every port and browser.
export const PREFS_PATH = join(HOME_DIR, 'preferences.json')

export const idFor = (absPath: string) =>
  createHash('sha1').update(absPath).digest('hex').slice(0, 8)

export function defaultTitle(absPath: string): string {
  try {
    const head = readFileSync(absPath, 'utf8').slice(0, 4000)
    const h1 = head.match(/^#\s+(.+?)\s*#*\s*$/m)
    if (h1) return h1[1]
  } catch {
    // fall through to the file name
  }
  return basename(absPath, extname(absPath))
}

export function readRegistry(): Entry[] {
  if (!existsSync(REGISTRY_PATH)) return []
  try {
    const data = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8')) as RegistryFile
    return Array.isArray(data.files) ? data.files : []
  } catch {
    return []
  }
}

// Write to a temp file then rename, so the server never reads a half-written file.
export function writeRegistry(files: Entry[]): void {
  mkdirSync(HOME_DIR, { recursive: true })
  const tmp = `${REGISTRY_PATH}.${process.pid}.tmp`
  const body: RegistryFile = { version: 1, files }
  writeFileSync(tmp, JSON.stringify(body, null, 2) + '\n')
  renameSync(tmp, REGISTRY_PATH)
}

export function readPrefs(): unknown {
  try {
    return JSON.parse(readFileSync(PREFS_PATH, 'utf8'))
  } catch {
    return null // no file yet, or unreadable
  }
}

export function writePrefs(prefs: unknown): void {
  mkdirSync(HOME_DIR, { recursive: true })
  const tmp = `${PREFS_PATH}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(prefs, null, 2) + '\n')
  renameSync(tmp, PREFS_PATH)
}

export function getEntry(id: string): Entry | undefined {
  return readRegistry().find((e) => e.id === id)
}
