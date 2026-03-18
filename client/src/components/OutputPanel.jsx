import { useMemo } from 'react'
import { marked } from 'marked'

export default function OutputPanel({ output, tab, setTab }) {
  const rendered = useMemo(() => {
    try { return marked.parse(output || '') }
    catch { return output || '' }
  }, [output])

  return (
    <div>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {['raw', 'rendered'].map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '5px 14px', borderRadius: 6, border: '1px solid',
              borderColor: tab === t ? 'var(--border-bright)' : 'var(--border)',
              background: tab === t ? 'var(--bg-elevated)' : 'transparent',
              color: tab === t ? 'var(--text-primary)' : 'var(--text-muted)',
              fontFamily: 'var(--font-mono)', fontSize: '.75rem', cursor: 'pointer',
              transition: 'all 0.15s'
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Raw */}
      {tab === 'raw' && (
        <pre style={{
          background: 'var(--bg-base)', border: '1px solid var(--border)',
          color: 'var(--accent)', padding: '1.2rem', borderRadius: 'var(--radius)',
          height: 400, overflow: 'auto', fontSize: '.75rem', lineHeight: 1.6,
          fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap', wordBreak: 'break-word'
        }}>
          {output}
        </pre>
      )}

      {/* Rendered */}
      {tab === 'rendered' && (
        <div
          className="markdown"
          style={{
            background: 'var(--bg-base)', border: '1px solid var(--border)',
            padding: '1.5rem', borderRadius: 'var(--radius)',
            height: 400, overflow: 'auto', fontSize: '.85rem', lineHeight: 1.7
          }}
          dangerouslySetInnerHTML={{ __html: rendered }}
        />
      )}
    </div>
  )
}