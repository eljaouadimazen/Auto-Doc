import { useMemo, useEffect, useRef } from 'react'
import { marked } from 'marked'
import mermaid from 'mermaid'

export default function OutputPanel({ output, tab }) {
  const containerRef = useRef(null)

  const rendered = useMemo(() => {
    try {
      return marked.parse(output || '')
    } catch {
      return output || ''
    }
  }, [output])

  useEffect(() => {
    if (tab !== 'rendered') return

    mermaid.initialize({
      startOnLoad: false,
      theme: 'default'
    })

    const elements = containerRef.current?.querySelectorAll('code.language-mermaid')

    if (elements) {
      elements.forEach((el, i) => {
        const parent = el.parentElement
        const code = el.textContent

        const id = `mermaid-${i}-${Date.now()}`

        try {
          mermaid.render(id, code).then(({ svg }) => {
            parent.innerHTML = svg
          })
        } catch (e) {
          console.error('Mermaid render error:', e)
        }
      })
    }
  }, [rendered, tab])

  const sharedBox = {
    background: 'var(--ink)',
    border: '1px solid var(--border2)',
    borderRadius: 6,
    height: 380,
    overflow: 'auto',
    fontSize: '.75rem',
    lineHeight: 1.6,
    fontFamily: 'var(--font-mono)',
  }

  return (
    <div>
      {tab === 'raw' && (
        <pre style={{
          ...sharedBox,
          padding: '1rem',
          color: 'var(--amber)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}>
          {output}
        </pre>
      )}

      {tab === 'rendered' && (
        <div
          ref={containerRef}
          className="markdown"
          style={{
            ...sharedBox,
            padding: '1.25rem',
            fontSize: '.82rem',
            lineHeight: 1.7,
            color: 'var(--text)',
          }}
          dangerouslySetInnerHTML={{ __html: rendered }}
        />
      )}
    </div>
  )
}