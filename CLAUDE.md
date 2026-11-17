# asset-serve

Local markdown viewer. The `asset-serve` CLI registers md files. A TanStack Start
app shows them in a dark UI that updates live as the files change on disk.
See README.md for user-facing usage.

## Agent instructions (using the viewer)

The paste-ready instruction for any agent that should show the user markdown
files. Copy the block as is.

````markdown
## Show me markdown files with asset-serve

I read markdown in a local live viewer, `asset-serve`, at http://localhost:7777.
Whenever you write a markdown file meant for me (plan, report, investigation,
summary, docs), follow these steps:

1. Create the file at an absolute path **under ~/Documents** (the viewer runs in
   Docker and can only see that folder) with its `# Title` and a 1–2 line summary.
2. Register it right away:
   `asset-serve add /abs/path/file.md --tags <project>,<kind>`
   It prints `added <id>  <path>`. Keep the 8-character id.
3. Write the rest in steps, one section per edit or append, so it streams onto
   my screen. Saves are picked up automatically; never re-register after an edit.
4. In your reply, give me the URL and the path:
   "http://localhost:7777/f/<id> (`/abs/path/file.md`)"

If something goes wrong:
- Lost the id: run `asset-serve add <same path>` again. It prints `updated <id> <path>` and changes nothing else. Or check `asset-serve list`.
- `asset-serve: Path does not exist`: create the file first, then add it.
- `asset-serve: No markdown files matched.`: fix the path or glob, and quote globs.
- `asset-serve` not found, or a Node/esbuild error: ask user to look into it
  Don't install or switch Node or reinstall packages. If that also fails, stop and tell me.
- Viewer down (`curl -s -o /dev/null -w "%{http_code}" http://localhost:7777/`
  isn't 200): still register the file and give me the URL, and tell me to run
  `docker start asset-serve`.

Never:
- Run `asset-serve rm`, `open` or `serve`, or any `docker` command for it, unless I ask. I run the server.
- Edit `~/.asset-serve/registry.json` by hand.
````

The global `~/.claude/CLAUDE.md` has a longer version of this, with a command
table and an error table. **If you change CLI commands, output lines, error
messages, ports or URL shape, update both this block and that section in the
same change.**

## Running it (Docker, always on)

The viewer runs as the `asset-serve` container (`compose.yaml`, `restart: unless-stopped`),
published on `127.0.0.1:7777` only. The CLI stays on the host and writes the registry.

| Mount | Why |
|---|---|
| `~/.asset-serve` → `/data` (rw) | registry (written by host CLI) and `preferences.json` (written by the viewer) |
| `${ASSET_SERVE_DOCS:-~/Documents}` → same path (ro) | the registry stores absolute host paths, so files must appear at the same path |

- After changing viewer code: `docker compose up -d --build`.
- Files outside the mounted folder show "missing on disk".
- Env in the image: `ASSET_SERVE_HOME=/data`, `ASSET_SERVE_HOST=0.0.0.0`.
  `ASSET_SERVE_POLL=1` switches chokidar to polling; not needed on Docker Desktop
  (VirtioFS delivers file events), verified 2026-11-11.
- Don't run `asset-serve serve` on the host while the container is up: both want port 7777.

## Stack

- TanStack Start + React 19, Vite 8, Tailwind v4, TypeScript (strict, `noUnusedLocals`)
- pnpm. Import alias `#/*` → `src/*`
- Markdown: react-markdown, remark-gfm, remark-math, rehype-katex, rehype-highlight, rehype-slug, mermaid (lazy)
- Watching: chokidar 6. CLI: commander 15, tinyglobby

## Commands

```bash
pnpm dev                 # Vite dev server (hot reload) — same as `asset-serve serve --dev`
pnpm build && pnpm preview
pnpm start               # = asset-serve serve: rebuilds only if src/config is newer than dist/, then previews
pnpm typecheck           # tsc --noEmit; run after every change
node bin/asset-serve.mjs <cmd>   # run the CLI without linking
```

Test against a throwaway registry, never the real one:
`ASSET_SERVE_HOME=/tmp/as-test node bin/asset-serve.mjs add /tmp/x.md`.
Ports: built viewer (`serve`, `open`, `pnpm preview`) on **7777**; dev server
(`serve --dev`, `pnpm dev`) on 3000. `ASSET_SERVE_PORT` overrides both.

## Node version and architecture

- Needs Node **22.18+**. Vite 8, chokidar 6, commander and mermaid all need 22+,
  and the CLI runs `.ts` with Node's built-in type stripping (no tsx, no build).
  `bin/asset-serve.mjs` checks the version and exits with a clear message.
- `.nvmrc` pins 24. The user's nvm default is 20.18 (too old). `node` is a
  zsh function that runs `nvm use default`, so call node binaries by absolute
  path in scripts.
- `node_modules` must be installed with the **same architecture** of Node that runs it.
  `/usr/local/bin/node` (22.22) is x86_64 under Rosetta; the nvm Nodes are arm64.
  A mismatch fails with esbuild's "installed esbuild for another platform".
  Fix: `nvm use && pnpm install --force`.

## Layout

| Path | Role |
|---|---|
| `src/lib/registry.ts` | Shared by CLI and server. `~/.asset-serve/registry.json` (override with `ASSET_SERVE_HOME`). Metadata only. id = first 8 hex chars of sha1(absolute path). Atomic write via temp file + rename. |
| `src/cli.ts`, `bin/asset-serve.mjs` | `add` (file/folder/glob, `--title`, `--tags`), `list`, `rm <id\|path>`, `open`, `serve [--dev]`. The bin is a shim that imports `src/cli.ts`. |
| `src/server/hub.ts` | One process-wide chokidar watcher, kept on `globalThis` so it survives HMR. Watches the registry **directory** (rename-based writes) plus every registered file. Throttles per file: leading edge, then at most one event per 100 ms. |
| `src/routes/api/events.ts` | SSE endpoint, events `{type:'registry'}` and `{type:'file', id}`. 15 s keepalive ping. |
| `src/routes/api/asset.$id.ts` | `GET /api/asset/<id>?p=<relative path>`: serves images referenced relatively in a registered md file. Resolves `p` against that file's folder with `realpath` on both sides and refuses anything outside that tree (`../`, symlinks, absolute paths, schemes). png/jpg/jpeg/gif/svg/webp only, 20 MB cap, read fresh each time, `nosniff` + sandbox CSP (SVG). `MarkdownView` rewrites relative `<img src>` to this route via `FileIdContext`. |
| `src/server/fns.ts` | Server fns `listFiles`, `getFile({id})` and `deleteFile({id})` (POST; drops the registry entry only, like `rm`; used by `src/components/RemoveFile.tsx`, the header trash button with a confirm popover, which then navigates to `/`). Node imports are dynamic, inside handlers, so they stay out of the client bundle. 5 MB cap. |
| `src/lib/events.tsx` | A single shared `EventSource` for the app. Components use `useLiveEvent`. |
| `src/routes/__root.tsx` | Shell, sidebar and the root loader (`listFiles`, `staleTime: Infinity`). Invalidated on `registry` events. Renders `DocSwitcher`. |
| `src/routes/f.$id.tsx` | Viewer. Header breadcrumb click copies only the file name ("Copied!" bubble). 3px reading-progress bar (width set from the rAF scroll handler, no re-render). Refetches on `file` events (one request in flight plus one queued). Follows the tail only when the reader is near the bottom. |
| `src/components/blocks.ts` | Splits markdown into top-level blocks with remark, and extracts headings for the outline. |
| `src/lib/settings.tsx` | Reader settings (font, size, width, sidebar, outline). Saved to **`~/.asset-serve/preferences.json`** through `src/server/prefs.ts` (`getPrefs` / `savePrefs`), **not** localStorage, which is per-origin and lost choices between :3000, :7777, localhost and 127.0.0.1. The root loader returns `{ files, prefs }`, and `RootDocument` renders `htmlSettingsAttrs(prefs)` onto `<html>` so the first paint is right. `sanitizeSettings` validates on both read and write. Old localStorage settings migrate once on first load. Shortcuts `[` / `⌘B` (sidebar) and `]` / `⌘L` (outline; `preventDefault` stops ⌘L focusing the address bar). Ignored while typing in inputs. |
| `src/components/ReaderControls.tsx` | Header controls: sidebar and outline toggles, search button, "Reconnecting…" notice, and the "Aa" settings menu. The sidebar itself (`Sidebar.tsx`) is just the file list, newest `addedAt` first, title as tiebreak (the palette keeps `listFiles`' title order): title, folder/file name and a "missing on disk" warning. No header, search box or tags. Tags are still searchable with `#tag` in the palette. |
| `src/components/CopyPage.tsx` | Header "Copy page" split button. **Default click = copy for LLM** (Markdown in a `<document title source>` wrapper; the user asked for this as the default). The menu adds "Copy Markdown only" and "Copy link". Clipboard only. Deliberately no "Open in ChatGPT/Claude": that would send internal docs off the machine. |
| `src/components/DocSwitcher.tsx` | ⌘Tab-style switcher on **⇧Tab** (outside text fields): overlay of the 4 newest docs (`SWITCHER_SIZE`, top of `sortNewestFirst` from `Sidebar.tsx`, so order matches the sidebar). Shown as a horizontal row of title-only cards. The first press already highlights the doc after the current one (like ⌘Tab), so tap-and-release switches at once; each further Tab with ⇧ held moves right (wraps); **only releasing ⇧ (or clicking a card) navigates**; Esc, a click outside or window blur cancel and stay put. Card hover uses `mousemove`, not `mouseenter`, so an overlay appearing under a still cursor can't steal the highlight. Key handlers are registered once and read state through a ref. Trade-off: this replaces the browser's reverse focus move. Hint in the sidebar footer. |
| `src/components/Palette.tsx` | Spotlight-style search on `/` or ⌘K: files (title, path, `#tag`), sections of the open doc, full-text matches (`searchContent` server fn) and actions. |
| `src/components/Outline.tsx` | "On this page" outline. Drops a leading H1, highlights the current section on scroll (rAF-throttled), clamps entries to 2 lines. |
| `src/components/MarkdownView.tsx` | Renders each block separately; `useKeyedBlocks` keeps keys stable. Also: code blocks over 24 lines fold to 18 ("Show all N lines"); `#` copy-link on h2–h4; H2 sections collapse (`useSections`, id = H2 text; hidden blocks stay in the DOM with `hidden` so heading lookups still work); reading-time line after the H1; tables over 12 rows fold into a scroll box with a sticky header; a custom `urlTransform` lets `data:image/*` through for `<img src>` only (react-markdown's default strips every `data:` URL). |
| `src/components/callouts.ts` | remark plugin: `> [!NOTE\|TIP\|IMPORTANT\|WARNING\|CAUTION]` and paragraphs starting with ⚠️ become `<aside class="callout callout-<kind>">`. |
| `src/lib/scroll.ts` | `scrollToHeading(slug)`: every in-page jump (outline, search) goes through it; it expands a collapsed section first. |
| `src/styles.css` | All markdown styling (`.md*` classes) and colour tokens. Charcoal theme (`--bg #141416`, a darker `--sidebar`), no typography plugin. Use the tokens; don't hardcode `bg-black` or `zinc-9xx`. |

## Invariants — don't break these

- **Read content only by id.** The browser never sends a path. The server resolves
  the id through the registry, which stops reads of arbitrary files. Keep that.
- **Never cache file content** on the server or in the registry. Always read from disk.
- The dev server binds to `127.0.0.1` (`vite.config.ts`). Don't expose it on the network.
- `rm` and the viewer's trash button (`deleteFile`) only unregister a file. Nothing ever deletes or modifies the user's md files.
- `/api/asset` takes an id plus a path **relative to that md file** and must stay confined to that file's folder tree. Never accept absolute paths there.
- **Block keys:** an unchanged block keeps its key, and a block that is only
  growing (new text is the old text plus more) keeps its key, so streamed text
  doesn't remount or flicker. New or edited blocks get a fresh key, which
  triggers the `.md-enter` animation. Keys must stay unique; check the `used` set.
- Documents with link references or footnote definitions render as **one block**,
  because those links cross block boundaries.
- Heading slugs: rehype-slug runs per block, so `blocks.ts` resets the slugger
  for every heading to match. Duplicate headings get the same id. That's a known limitation.

## Verifying UI changes

`chrome --headless --screenshot` captures before hydration, and
`--virtual-time-budget` hangs because of the open SSE connection. Instead, launch
headless Chrome with `--remote-debugging-port` and drive it over CDP, using Node's
built-in `WebSocket`. Check `.md-block` and `.md-enter` counts after appending to a watched file.
The UI shows no "Live" badge. A "Reconnecting…" notice appears in the header
only when SSE is down, so its absence means the connection is fine.

Layout: the header sits inside the scroll area, so it scrolls away with the page
(the user doesn't want a sticky header). Reading typography follows a
dev.to-style reference: system font at 18px, line height 1.65, headings at 700–800
weight, Geist fonts (Google Fonts, bundled via @fontsource so nothing loads from
Google). The width is set in `ch`, so it scales with font and size. Keep it calm: no
borders on code blocks or tables, and the copy button only shows on hover. The user
reads with limited attention, so extra boxes and chrome hurt.
No focus/dimming mode: the user tried one and rejected it. "Better reading" means
clearer content, not dimming.

Hydration: anything time- or locale-dependent (the "Edited x ago" label,
`toLocaleString`) must render only after mount (state starts `null`), or React
throws a hydration mismatch. Secondary text uses `var(--muted)` (#8b8b93,
6.2:1 on black). Don't go dimmer than that for text people need to read.

Mermaid chunks are over 500 kB. They're lazy-loaded, so ignore the build size warning.
