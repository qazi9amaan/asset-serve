# asset-serve

A local markdown viewer. Register files from the terminal; view them in a dark
browser UI that updates live as the files change, so a file being written by
an agent or a script streams onto the page.

## Setup

Needs Node 22.18+ (`.nvmrc` pins 24). Install and run with the same Node, or
native modules (esbuild, lightningcss) fail with a platform mismatch.

```bash
nvm use            # Node 24
pnpm install
pnpm link --global # puts `asset-serve` on your PATH (the CLI runs on the host)
docker compose up -d --build   # viewer, always on → http://localhost:7777
```

### Docker (recommended)

The viewer runs as the `asset-serve` container and restarts with Docker Desktop.
It mounts `~/.asset-serve` (registry and preferences) and `~/Documents`
read-only, at the same path, because the registry stores absolute paths. It
listens on `127.0.0.1:7777` only.

```bash
docker compose up -d --build     # start, or rebuild after code changes
docker logs -f asset-serve       # logs
docker stop asset-serve          # stop (stays stopped until you start it)
docker start asset-serve         # start again
ASSET_SERVE_DOCS=/other/dir docker compose up -d   # mount a different folder
```

Files outside the mounted folder show as "missing on disk". If edits stop
showing live, set `ASSET_SERVE_POLL=1` (switches to polling).
`asset-serve serve` still runs the viewer on the host instead; don't run both,
because they share port 7777.

## CLI

```bash
asset-serve add ./notes.md --title "My notes" --tags work,plans
asset-serve add ./docs               # every .md/.markdown/.mdx in a folder
asset-serve add "plans/**/*.md"      # glob (quote it)
asset-serve list                     # ids, titles, tags, [missing] flag
asset-serve rm <id|path>             # unregister (never deletes the file)
asset-serve open [id]                # open in the browser
asset-serve serve                    # build if code changed, then serve the build
asset-serve serve --dev              # Vite dev server with hot reload (editing the viewer)
```

`serve` rebuilds only when `dist/` is missing or older than `src/`,
`package.json`, `pnpm-lock.yaml` or `vite.config.ts`. Markdown edits never need
a rebuild; they stream in live in both modes.

Re-adding a file merges new tags. `--title` works only with a single file;
otherwise the title is the first `# heading`, or the file name.

## Using the viewer

| Key | Action |
|---|---|
| `/` or `⌘K` | Search: files, `#tag`, sections of this doc, text in all files, actions |
| `[` | Show/hide the sidebar (opens the drawer on phones) |
| `]` | Show/hide the outline |
| `Aa` (header) | Font (Geist, System, Serif, Mono), size, width. |

Your last choices (sidebar and outline shown or hidden, font, size, width) are
saved to `~/.asset-serve/preferences.json` and restored everywhere: after a
reload, on any port, and in any browser on this machine.

## Reading features

- **Callouts:** `> [!NOTE]`, `> [!TIP]`, `> [!IMPORTANT]`, `> [!WARNING]`,
  `> [!CAUTION]` (GitHub syntax). Paragraphs starting with ⚠️ become warnings.
- **Collapsible sections:** the chevron left of each `##` heading folds that
  section. Jumping to a heading inside it (outline or search) opens it again.
- **Heading links:** hover a heading and click `#` to copy a link to it.
- **Copy page** (header): copies the page for an LLM, as Markdown wrapped with its
  title and file path. The ▾ menu has "Copy Markdown only" and "Copy link".
- **Long code** (over 24 lines) folds to 18 lines, with a "Show all N lines" button.
- Reading time under the title, progress % in the outline, and a back-to-top
  button once you scroll.

## How it works

- **Registry:** `~/.asset-serve/registry.json` holds metadata only: id
  (sha1 of the absolute path, first 8 chars), path, title, tags, addedAt. The
  CLI writes it atomically (temp file and rename). Override the location with
  `ASSET_SERVE_HOME`.
- **Content:** always read from disk when requested, never cached. The browser
  asks by id only, so the server reads only registered files. The dev server
  binds to `127.0.0.1`.
- **Live updates:** one `chokidar` watcher (`src/server/hub.ts`) watches the
  registry directory and every registered file. Changes go to the browser over
  SSE (`/api/events`), throttled to at most one event per file per 100 ms, so
  fast writers don't flood the browser.
- **Rendering:** the document is split into top-level blocks
  (`src/components/blocks.ts`). Unchanged blocks keep their React key and don't
  re-render. A block that is only growing updates in place. New or edited
  blocks fade in. The page follows the tail only when you are already near the
  bottom. Supports GFM (tables, task lists), highlight.js code blocks with a
  copy button, KaTeX math, Mermaid diagrams, and a heading outline. Documents
  that use link references or footnotes render as one block, because those
  links point across blocks.

| Env var                | Default          |
| ---------------------- | ---------------- |
| `ASSET_SERVE_HOME`     | `~/.asset-serve` |
| `ASSET_SERVE_PORT`     | `7777` for `serve`/`open`, `3000` for `serve --dev` |
| `ASSET_SERVE_PASSWORD` | unset (open access) |

## Password

Set `ASSET_SERVE_PASSWORD` to lock the viewer behind a login page; leave it
unset and the app is fully open, as before. On the right password a signed,
HttpOnly session cookie is set (30 days). With Docker, set it in `compose.yaml`
or your shell: `ASSET_SERVE_PASSWORD=secret docker compose up -d`.
