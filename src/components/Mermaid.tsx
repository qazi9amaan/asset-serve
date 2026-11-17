import { useEffect, useId, useState } from 'react'

let ready: Promise<typeof import('mermaid').default> | null = null
const loadMermaid = () =>
  (ready ??= import('mermaid').then(({ default: m }) => {
    m.initialize({
      startOnLoad: false,
      theme: 'dark',
      securityLevel: 'strict',
      themeVariables: { background: '#1b1b1e', fontFamily: 'inherit' },
    })
    return m
  }))

export function Mermaid({ code }: { code: string }) {
  const id = `m${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let alive = true
    loadMermaid()
      .then((m) => m.render(id, code))
      .then(({ svg }) => alive && (setSvg(svg), setError(false)))
      .catch(() => alive && setError(true)) // often a half-written diagram mid-stream
    return () => {
      alive = false
    }
  }, [code, id])

  if (error || !svg) {
    return (
      <pre className="md-pre">
        <code>{code}</code>
      </pre>
    )
  }
  return <div className="md-mermaid" dangerouslySetInnerHTML={{ __html: svg }} />
}
