// Roadmap revisions backed by git: one repo per product under ROADMAPS_DIR.
// Each write is one commit, so HEAD's short SHA names the revision a reader saw.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { basename, join, relative, resolve, sep } from 'node:path'

export const ROADMAPS_DIR = resolve(process.env.ASSET_SERVE_ROADMAPS ?? '/home/ai-docs/roadmaps')

// Inline identity only: no global git config, no credentials.
const BOT = ['-c', 'user.name=asset-serve-bot', '-c', 'user.email=asset-serve-bot@localhost']

const git = (dir: string, ...args: string[]) =>
  execFileSync('git', ['-C', dir, ...BOT, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()

const SAFE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

export function repoDir(product: string): string {
  if (!SAFE.test(product) || product.includes('..')) throw new Error(`Bad product name: ${product}`)
  return join(ROADMAPS_DIR, product)
}

// First roadmap for a product: create its repo with a .gitignore for temp files.
export function ensureRepo(dir: string): void {
  if (existsSync(join(dir, '.git'))) return
  mkdirSync(dir, { recursive: true })
  git(dir, 'init', '-q')
  writeFileSync(join(dir, '.gitignore'), '*.tmp\n')
  git(dir, 'add', '.gitignore')
  git(dir, 'commit', '-q', '-m', 'init roadmap repo')
}

// Repo dir for a file inside a product repo, or null for any other file.
export function repoFor(filePath: string): string | null {
  const rel = relative(ROADMAPS_DIR, resolve(filePath))
  if (!rel || rel.startsWith('..') || !rel.includes(sep)) return null
  const dir = join(ROADMAPS_DIR, rel.split(sep)[0])
  return existsSync(join(dir, '.git')) ? dir : null
}

// '' for files outside a roadmap repo; throws if git itself fails on a roadmap file.
export function headFor(filePath: string): string {
  const dir = repoFor(filePath)
  return dir ? git(dir, 'rev-parse', '--short', 'HEAD') : ''
}

// Writes and commits one revision. On any failure the last committed doc is
// restored (or a never-committed file removed), so no half-written doc is left.
export function writeRoadmap(product: string, filename: string, content: string): { path: string; head: string } {
  if (basename(filename) !== filename || !SAFE.test(filename) || !/\.md$/i.test(filename))
    throw new Error(`Bad roadmap file name: ${filename}`)
  const dir = repoDir(product)
  ensureRepo(dir)
  const path = join(dir, filename)
  const tmp = `${path}.${process.pid}.tmp`
  try {
    writeFileSync(tmp, content)
    renameSync(tmp, path)
    git(dir, 'add', '--', filename)
    git(dir, 'commit', '-q', '--allow-empty', '-m', `update ${filename}`)
  } catch (err) {
    rmSync(tmp, { force: true })
    try {
      git(dir, 'cat-file', '-e', `HEAD:${filename}`)
      git(dir, 'checkout', 'HEAD', '--', filename)
    } catch {
      git(dir, 'rm', '-q', '--cached', '--ignore-unmatch', '--', filename)
      rmSync(path, { force: true })
    }
    throw err
  }
  return { path, head: git(dir, 'rev-parse', '--short', 'HEAD') }
}
