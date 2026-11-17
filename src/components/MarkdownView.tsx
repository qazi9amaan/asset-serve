import {
  createContext,
  Fragment,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import ReactMarkdown, { defaultUrlTransform, type Components, type UrlTransform } from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import rehypeKatex from 'rehype-katex'
import rehypeSlug from 'rehype-slug'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import { EXPAND_EVENT } from '#/lib/scroll'
import { remarkCallouts } from './callouts'
import { Mermaid } from './Mermaid'

const remarkPlugins = [remarkGfm, remarkMath, remarkCallouts]
const rehypePlugins = [
  rehypeSlug,
  rehypeKatex,
  [rehypeHighlight, { plainText: ['mermaid'], detect: false }],
] as const

// react-markdown's default drops every data: URL. Let inline base64/encoded
// images through, for <img src> only; everything else keeps the default rules.
const DATA_IMAGE = /^data:image\/(png|jpe?g|gif|webp|svg\+xml)[;,]/i
const urlTransform: UrlTransform = (url, key, node) =>
  key === 'src' && node.tagName === 'img' && DATA_IMAGE.test(url) ? url : defaultUrlTransform(url)

// Relative image paths ("./img/a.png", "img/a.png") are served by /api/asset,
// resolved against the markdown file's own folder. Needs the file id.
const FileIdContext = createContext<string | null>(null)
const SCHEME = /^[a-z][a-z0-9+.-]*:/i

function Img({ src, alt, title }: { src?: string; alt?: string; title?: string }) {
  const fileId = useContext(FileIdContext)
  const relative = !!src && !SCHEME.test(src) && !src.startsWith('/') && !src.startsWith('#')
  const url = relative && fileId ? `/api/asset/${fileId}?p=${encodeURIComponent(src)}` : src
  return <img src={url} alt={alt ?? ''} title={title} loading="lazy" decoding="async" />
}

const textOf = (node: ReactNode): string =>
  typeof node === 'string' || typeof node === 'number'
    ? String(node)
    : Array.isArray(node)
      ? node.map(textOf).join('')
      : node && typeof node === 'object' && 'props' in node
        ? textOf((node.props as { children?: ReactNode }).children)
        : ''

// Long code folds to FOLD_LINES with a fade and a "Show all" button, so a wall
// of code doesn't swallow the page. Short blocks (<= FOLD_AT lines) never fold.
const FOLD_LINES = 18
const FOLD_AT = 24

function CodeBlock({ children }: { children?: ReactNode }) {
  const [copied, setCopied] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const code = Array.isArray(children) ? children[0] : children
  const className =
    code && typeof code === 'object' && 'props' in code
      ? ((code.props as { className?: string }).className ?? '')
      : ''
  const lang = className.match(/language-([\w-]+)/)?.[1]
  const raw = textOf(children).replace(/\n$/, '')
  const lines = raw.split('\n').length
  const foldable = lines > FOLD_AT
  const folded = foldable && !expanded

  if (lang === 'mermaid') return <Mermaid code={raw} />

  return (
    <div className={`md-code${folded ? ' is-folded' : ''}`}>
      <div className="md-code-bar">
        {lang && <span>{lang}</span>}
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(raw)
            setCopied(true)
            setTimeout(() => setCopied(false), 1200)
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="md-pre" style={folded ? { maxHeight: `calc(${FOLD_LINES * 1.65}em + 32px)` } : undefined}>
        {children}
      </pre>
      {foldable && (
        <button type="button" className="md-code-toggle" onClick={() => setExpanded((e) => !e)}>
          {folded ? `Show all ${lines} lines` : 'Show less'}
        </button>
      )}
    </div>
  )
}

// Long tables fold to a fixed-height scroll box (header stays stuck on top),
// with a toggle to show every row. Short tables (<= TABLE_FOLD_AT rows) never fold.
const TABLE_FOLD_AT = 12

interface HastNode {
  type: string
  tagName?: string
  children?: HastNode[]
}
const countRows = (node: HastNode | undefined): number =>
  !node ? 0 : node.tagName === 'tr' ? 1 : (node.children ?? []).reduce((n, c) => n + countRows(c), 0)

function Table({ rows, children }: { rows: number; children?: ReactNode }) {
  const [expanded, setExpanded] = useState(false)
  const foldable = rows > TABLE_FOLD_AT
  const folded = foldable && !expanded
  return (
    <div>
      <div className={`md-table${folded ? ' is-folded' : ''}`} style={folded ? { maxHeight: '28rem' } : undefined}>
        <table>{children}</table>
      </div>
      {foldable && (
        <button type="button" className="md-table-toggle" onClick={() => setExpanded((e) => !e)}>
          {folded ? `Show all ${rows - 1} rows` : 'Show less'}
        </button>
      )}
    </div>
  )
}

// Headings get a "#" on hover that copies a link straight to them.
function Heading({ as: Tag, id, children }: { as: 'h2' | 'h3' | 'h4'; id?: string; children?: ReactNode }) {
  const [copied, setCopied] = useState(false)
  return (
    <Tag id={id}>
      {children}
      {id && (
        <a
          href={`#${id}`}
          className="md-anchor"
          aria-label="Copy link to this section"
          title={copied ? 'Link copied' : 'Copy link to this section'}
          onClick={(e) => {
            e.preventDefault()
            void navigator.clipboard.writeText(`${location.href.split('#')[0]}#${id}`)
            history.replaceState(null, '', `#${id}`)
            setCopied(true)
            setTimeout(() => setCopied(false), 1200)
          }}
        >
          {copied ? '✓' : '#'}
        </a>
      )}
    </Tag>
  )
}

const components: Components = {
  pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
  h2: ({ id, children }) => <Heading as="h2" id={id}>{children}</Heading>,
  h3: ({ id, children }) => <Heading as="h3" id={id}>{children}</Heading>,
  h4: ({ id, children }) => <Heading as="h4" id={id}>{children}</Heading>,
  a: ({ href, children }) => (
    <a href={href} target={href?.startsWith('#') ? undefined : '_blank'} rel="noreferrer">
      {children}
    </a>
  ),
  table: ({ node, children }) => <Table rows={countRows(node as HastNode | undefined)}>{children}</Table>,
  img: ({ src, alt, title }) => <Img src={typeof src === 'string' ? src : undefined} alt={alt} title={title} />,
}

interface BlockProps {
  text: string
  enter: boolean
  section: string | null
  /** This block is an H2 that starts a section. */
  head: boolean
  /** Hidden because its section is collapsed. */
  hidden: boolean
  collapsed: boolean
  hiddenCount: number
  onToggle: (section: string) => void
}

// One top-level markdown block, memoised on its props (text above all).
const Block = memo(function Block({ text, enter, section, head, hidden, collapsed, hiddenCount, onToggle }: BlockProps) {
  return (
    <div
      className={enter ? 'md-block md-enter' : 'md-block'}
      data-section={section ?? undefined}
      data-head={head || undefined}
      hidden={hidden}
    >
      {head && section && (
        <button
          type="button"
          className="md-fold"
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand section' : 'Collapse section'}
          title={collapsed ? 'Expand section' : 'Collapse section'}
          onClick={() => onToggle(section)}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="m4 6 4 4 4-4" />
          </svg>
        </button>
      )}
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins as never}
        components={components}
        urlTransform={urlTransform}
      >
        {text}
      </ReactMarkdown>
      {head && section && collapsed && hiddenCount > 0 && (
        <button type="button" className="md-fold-hint" onClick={() => onToggle(section)}>
          Collapsed · Show
        </button>
      )}
    </div>
  )
})

interface Keyed {
  text: string
  key: number
  enter: boolean
}

// Give each block a stable key across updates:
// - unchanged blocks keep their key (no re-render, even if they moved),
// - a block that is only growing (being streamed into) keeps its key,
// - new or edited blocks get a fresh key, so they animate in.
function useKeyedBlocks(blocks: string[]): Keyed[] {
  const prev = useRef<Keyed[] | null>(null)
  const counter = useRef(0)
  const memo = useRef<{ blocks: string[]; out: Keyed[] } | null>(null)
  if (memo.current?.blocks === blocks) return memo.current.out

  const first = prev.current === null
  const pool = new Map<string, Keyed[]>()
  for (const k of prev.current ?? []) pool.set(k.text, [...(pool.get(k.text) ?? []), k])
  const used = new Set<number>()

  const out = blocks.map((text, i): Keyed => {
    const candidates = pool.get(text) ?? []
    const match = candidates.find((k) => !used.has(k.key))
    if (match) {
      used.add(match.key)
      return { text, key: match.key, enter: match.enter }
    }
    const before = prev.current?.[i]
    if (before && !used.has(before.key) && text.startsWith(before.text)) {
      used.add(before.key)
      return { text, key: before.key, enter: before.enter }
    }
    return { text, key: counter.current++, enter: !first }
  })

  prev.current = out
  memo.current = { blocks, out }
  return out
}

const H1 = /^#\s/
const H2 = /^##\s+(.+)/

// Sections run from one H2 to the next H2 (or H1). The id is the heading text,
// so folding survives live edits elsewhere in the file.
function useSections(keyed: Keyed[]) {
  return useMemo(() => {
    let current: string | null = null
    const rows = keyed.map((b) => {
      if (H1.test(b.text)) current = null
      const m = b.text.match(H2)
      if (m) current = `h2:${m[1].trim()}`
      return { section: current, head: !!m }
    })
    const counts = new Map<string, number>()
    for (const r of rows) if (r.section && !r.head) counts.set(r.section, (counts.get(r.section) ?? 0) + 1)
    return { rows, counts }
  }, [keyed])
}

export function MarkdownView({ blocks, meta, fileId }: { blocks: string[]; meta?: ReactNode; fileId?: string }) {
  const keyed = useKeyedBlocks(blocks)
  const { rows, counts } = useSections(keyed)
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())

  const toggle = useCallback((section: string) => {
    setCollapsed((cur) => {
      const next = new Set(cur)
      if (next.has(section)) next.delete(section)
      else next.add(section)
      return next
    })
  }, [])

  // Outline/search jumps into a collapsed section expand it first (see lib/scroll).
  useEffect(() => {
    const onExpand = (e: Event) => {
      const section = (e as CustomEvent<string>).detail
      setCollapsed((cur) => {
        if (!cur.has(section)) return cur
        const next = new Set(cur)
        next.delete(section)
        return next
      })
    }
    window.addEventListener(EXPAND_EVENT, onExpand)
    return () => window.removeEventListener(EXPAND_EVENT, onExpand)
  }, [])

  // Reading-time line goes right under the title when the doc opens with an H1.
  const metaAfter = keyed.length > 0 && H1.test(keyed[0].text) ? 0 : -1

  return (
    <FileIdContext.Provider value={fileId ?? null}>
      <article className="md">
        {metaAfter === -1 && meta}
        {keyed.map((b, i) => {
          const { section, head } = rows[i]
          const isCollapsed = !!section && collapsed.has(section)
          return (
            <Fragment key={b.key}>
              <Block
                text={b.text}
                enter={b.enter}
                section={section}
                head={head}
                hidden={isCollapsed && !head}
                collapsed={isCollapsed}
                hiddenCount={section ? (counts.get(section) ?? 0) : 0}
                onToggle={toggle}
              />
              {i === metaAfter && meta}
            </Fragment>
          )
        })}
      </article>
    </FileIdContext.Provider>
  )
}
