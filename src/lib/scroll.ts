// Jump to a heading by slug. If it sits inside a collapsed section, ask the
// markdown view to expand that section first, then scroll once it's visible.
export const EXPAND_EVENT = 'asset-serve:expand-section'

export function scrollToHeading(slug: string) {
  const el = document.getElementById(slug)
  if (!el) return
  const go = () => el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  const section = el.closest<HTMLElement>('[data-section]')?.dataset.section
  if (el.offsetParent === null && section) {
    window.dispatchEvent(new CustomEvent(EXPAND_EVENT, { detail: section }))
    requestAnimationFrame(() => requestAnimationFrame(go))
  } else {
    go()
  }
  history.replaceState(null, '', `#${slug}`)
}
