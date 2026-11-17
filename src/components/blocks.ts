import GithubSlugger from 'github-slugger'
import { toString } from 'mdast-util-to-string'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkParse from 'remark-parse'
import { unified } from 'unified'

export interface Heading {
  depth: number
  text: string
  slug: string
}

export interface Parsed {
  blocks: string[]
  headings: Heading[]
}

const parser = unified().use(remarkParse).use(remarkGfm).use(remarkMath)

// Split a document into top-level blocks (paragraph, list, code fence, table...).
// Each block renders on its own, so a change re-renders only the blocks that
// differ, and new blocks can animate in.
export function parseBlocks(src: string): Parsed {
  const tree = parser.parse(src)
  const slugger = new GithubSlugger()
  const headings: Heading[] = []
  let crossRefs = false

  for (const node of tree.children) {
    if (node.type === 'heading') {
      const text = toString(node)
      slugger.reset() // each block renders with a fresh slugger, so match that
      headings.push({ depth: node.depth, text, slug: slugger.slug(text) })
    }
    if (node.type === 'definition' || node.type === 'footnoteDefinition') crossRefs = true
  }

  // Link references and footnotes point across blocks; render those docs whole.
  if (crossRefs) return { blocks: [src], headings }

  const blocks = tree.children
    .filter((n) => n.position)
    .map((n) => src.slice(n.position!.start.offset, n.position!.end.offset))
  return { blocks, headings }
}
