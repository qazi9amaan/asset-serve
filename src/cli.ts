import { spawn } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Command } from 'commander'
import { glob, isDynamicPattern } from 'tinyglobby'
import {
  REGISTRY_PATH,
  defaultTitle,
  idFor,
  readRegistry,
  writeRegistry,
  type Entry,
} from './lib/registry.ts'

// Built viewer (serve, open) on 7777; dev server (serve --dev) on 3000.
const PORT = Number(process.env.ASSET_SERVE_PORT ?? 7777)
const DEV_PORT = Number(process.env.ASSET_SERVE_PORT ?? 3000)
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const isMarkdown = (p: string) => /\.(md|markdown|mdx)$/i.test(p)

async function expand(input: string): Promise<string[]> {
  if (isDynamicPattern(input)) {
    return (await glob(input, { absolute: true, onlyFiles: true })).filter(isMarkdown)
  }
  const abs = resolve(input)
  if (!existsSync(abs)) throw new Error(`Path does not exist: ${abs}`)
  if (statSync(abs).isDirectory()) {
    return glob('**/*.{md,markdown,mdx}', {
      cwd: abs,
      absolute: true,
      ignore: ['**/node_modules/**', '**/.git/**'],
    })
  }
  return [abs]
}

const parseTags = (raw?: string) =>
  (raw ?? '').split(',').map((t) => t.trim()).filter(Boolean)

// "id:label", split on the first colon so labels may contain colons.
function parseAction(raw: string): { id: string; label: string } {
  const at = raw.indexOf(':')
  const id = raw.slice(0, at).trim()
  const label = raw.slice(at + 1).trim()
  if (at < 0 || !id || !label) throw new Error(`--action must look like id:label, got: ${raw}`)
  return { id, label }
}

interface AddOpts {
  title?: string
  tags?: string
  interactive?: boolean
  action: string[]
  handler?: string
  context?: string
}

// Only the flags that were given, so a plain `add` writes exactly what it used to.
function interactiveFields(opts: AddOpts): Pick<Entry, 'interactive' | 'actions' | 'callback'> {
  const fields: Pick<Entry, 'interactive' | 'actions' | 'callback'> = {}
  if (opts.interactive) fields.interactive = true
  if (opts.action.length) {
    const actions = opts.action.map(parseAction)
    const ids = actions.map((a) => a.id)
    const dup = ids.find((id, i) => ids.indexOf(id) !== i)
    if (dup) throw new Error(`Duplicate --action id: ${dup}`)
    fields.actions = actions
  }
  if (opts.handler !== undefined || opts.context !== undefined) {
    const handler = opts.handler?.trim()
    const context_id = opts.context?.trim()
    if (!handler || !context_id) throw new Error('--handler and --context must be given together.')
    fields.callback = { handler, context_id }
  }
  return fields
}

const program = new Command()
  .name('asset-serve')
  .description('Register local markdown files and view them live in the browser')

program
  .command('add')
  .argument('<paths...>', 'markdown files, folders or glob patterns')
  .option('-t, --title <title>', 'display title (single file only)')
  .option('--tags <tags>', 'comma-separated tags')
  .option('--interactive', 'mark the entry as interactive')
  .option('--action <id:label>', 'add an action button (repeatable)', (v: string, acc: string[]) => [...acc, v], [])
  .option('--handler <handler>', 'callback handler (needs --context)')
  .option('--context <context_id>', 'callback context id (needs --handler)')
  .action(async (inputs: string[], opts: AddOpts) => {
    const extra = interactiveFields(opts)
    const paths = [...new Set((await Promise.all(inputs.map(expand))).flat())]
    if (paths.length === 0) throw new Error('No markdown files matched.')
    if (opts.title && paths.length > 1) throw new Error('--title only works with a single file.')

    const tags = parseTags(opts.tags)
    const files = readRegistry()
    for (const path of paths) {
      const id = idFor(path)
      const existing = files.find((e) => e.id === id)
      if (existing) {
        if (opts.title) existing.title = opts.title
        existing.tags = [...new Set([...existing.tags, ...tags])]
        Object.assign(existing, extra)
        console.log(`updated  ${id}  ${path}`)
        continue
      }
      const entry: Entry = {
        id,
        path,
        title: opts.title ?? defaultTitle(path),
        tags,
        addedAt: new Date().toISOString(),
        ...extra,
      }
      files.push(entry)
      console.log(`added    ${id}  ${path}`)
    }
    writeRegistry(files)
  })

program
  .command('list')
  .alias('ls')
  .description('list registered files')
  .action(() => {
    const files = readRegistry()
    if (files.length === 0) return console.log(`No files yet. Registry: ${REGISTRY_PATH}`)
    for (const e of files) {
      const missing = existsSync(e.path) ? '' : '  [missing]'
      const tags = e.tags.length ? `  #${e.tags.join(' #')}` : ''
      console.log(`${e.id}  ${e.title}${tags}${missing}\n          ${e.path}`)
    }
  })

program
  .command('rm')
  .argument('<ids...>', 'ids (from `list`) or file paths')
  .description('unregister files (the files themselves are not touched)')
  .action((ids: string[]) => {
    const targets = new Set(ids.map((x) => (existsSync(x) ? idFor(resolve(x)) : x)))
    const files = readRegistry()
    const kept = files.filter((e) => !targets.has(e.id))
    for (const e of files) if (targets.has(e.id)) console.log(`removed  ${e.id}  ${e.path}`)
    if (kept.length === files.length) throw new Error('Nothing matched.')
    writeRegistry(kept)
  })

program
  .command('get')
  .argument('<id>', 'file id (the /f/<id> in a viewer link, or from `list`)')
  .description('print a registered file’s markdown to stdout')
  .action((id: string) => {
    const entry = readRegistry().find((e) => e.id === id)
    if (!entry) throw new Error(`No file with id: ${id}`)
    if (!existsSync(entry.path)) throw new Error(`File is missing on disk: ${entry.path}`)
    process.stdout.write(readFileSync(entry.path, 'utf8'))
  })

program
  .command('open')
  .argument('[id]', 'file id to open')
  .description('open the viewer in the browser')
  .action((id?: string) => {
    const url = `http://localhost:${PORT}${id ? `/f/${id}` : '/'}`
    const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open'
    spawn(opener, [url], { stdio: 'ignore', detached: true, shell: process.platform === 'win32' }).unref()
    console.log(url)
  })

program
  .command('serve')
  .description('start the viewer (builds first if the code changed)')
  .option('--dev', 'run the Vite dev server instead (hot reload, for editing the viewer)')
  .action((opts: { dev?: boolean }) => {
    const run = (args: string[]) =>
      new Promise<void>((done, fail) =>
        spawn('pnpm', args, { cwd: PROJECT_ROOT, stdio: 'inherit' }).on('exit', (code) =>
          code === 0 ? done() : fail(new Error(`pnpm ${args[0]} exited with code ${code}`)),
        ),
      )
    if (opts.dev) return run(['dev', '--port', String(DEV_PORT)])
    const build = needsBuild() ? (console.log('Building viewer...'), run(['build'])) : Promise.resolve()
    return build.then(() => run(['preview', '--port', String(PORT)]))
  })

// Rebuild when dist is missing or any source/config file is newer than it.
function needsBuild(): boolean {
  const built = join(PROJECT_ROOT, 'dist/server/server.js')
  if (!existsSync(built)) return true
  const builtAt = statSync(built).mtimeMs
  const newest = (dir: string): number =>
    readdirSync(dir, { withFileTypes: true }).reduce((max, d) => {
      const p = join(dir, d.name)
      return Math.max(max, d.isDirectory() ? newest(p) : statSync(p).mtimeMs)
    }, 0)
  const sources = ['package.json', 'pnpm-lock.yaml', 'vite.config.ts'].map((f) => join(PROJECT_ROOT, f))
  return Math.max(newest(join(PROJECT_ROOT, 'src')), ...sources.filter(existsSync).map((f) => statSync(f).mtimeMs)) > builtAt
}

program.parseAsync().catch((err: Error) => {
  console.error(`asset-serve: ${err.message}`)
  process.exit(1)
})
