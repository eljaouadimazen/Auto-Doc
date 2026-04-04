import { useMemo } from 'react'
import { marked } from 'marked'

export default function OutputPanel({ output, tab }) {
  const rendered = useMemo(() => {
    try { return marked.parse(output || '') }
    catch { return output || '' }
  }, [output])

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