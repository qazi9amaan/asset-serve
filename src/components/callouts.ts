// remark plugin: turn GitHub-style alerts and ⚠️ paragraphs into callouts.
//   > [!NOTE]        > [!TIP]        > [!IMPORTANT]
//   > [!WARNING]     > [!CAUTION]
//   ⚠️ Something to watch out for      (a paragraph that starts with ⚠️)
// Renders <aside class="callout callout-<kind>"> with a title line; styled in styles.css.

interface MdNode {
  type: string
  value?: string
  children?: MdNode[]
  data?: Record<string, unknown>
}

export const CALLOUT_TITLES = {
  note: 'Note',
  tip: 'Tip',
  important: 'Important',
  warning: 'Warning',
  caution: 'Caution',
} as const
type Kind = keyof typeof CALLOUT_TITLES

const ALERT = /^\[!(note|tip|important|warning|caution)\][ \t]*\n?/i
const WARN_EMOJI = /^(?:⚠️|⚠)\s*/

function makeCallout(node: MdNode, kind: Kind) {
  node.data = { hName: 'aside', hProperties: { className: ['callout', `callout-${kind}`] } }
  node.children = [
    {
      type: 'paragraph',
      data: { hName: 'div', hProperties: { className: ['callout-title'] } },
      children: [{ type: 'text', value: CALLOUT_TITLES[kind] }],
    },
    ...(node.children ?? []),
  ]
}

function walk(parent: MdNode) {
  const kids = parent.children
  if (!kids) return
  kids.forEach((child, i) => {
    if (child.type === 'blockquote') {
      const first = child.children?.[0]
      const text = first?.type === 'paragraph' ? first.children?.[0] : undefined
      const m = text?.type === 'text' ? text.value?.match(ALERT) : null
      if (m && text && first) {
        text.value = text.value!.slice(m[0].length)
        if (!text.value) first.children!.shift()
        if (first.children!.length === 0) child.children!.shift()
        makeCallout(child, m[1].toLowerCase() as Kind)
        return walk(child)
      }
      // "> ⚠️ text": the quote itself becomes the callout. Without this, the ⚠️
      // paragraph would be wrapped in its own callout inside the quote, stacking
      // the quote's grey background behind the callout's tint.
      if (text?.type === 'text' && WARN_EMOJI.test(text.value ?? '')) {
        text.value = text.value!.replace(WARN_EMOJI, '')
        makeCallout(child, 'warning')
        return walk(child)
      }
    }
    if (child.type === 'paragraph') {
      const text = child.children?.[0]
      if (text?.type === 'text' && WARN_EMOJI.test(text.value ?? '')) {
        text.value = text.value!.replace(WARN_EMOJI, '')
        const box: MdNode = { type: 'blockquote', children: [child] }
        makeCallout(box, 'warning')
        kids[i] = box
        return
      }
    }
    walk(child)
  })
}

export function remarkCallouts() {
  return (tree: MdNode) => walk(tree)
}
