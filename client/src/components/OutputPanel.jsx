import { useMemo, useEffect, useRef } from 'react'
import { marked }  from 'marked'
import mermaid     from 'mermaid'

// ── init once, outside component ─────────────────────────────────────────────
mermaid.initialize({
  startOnLoad:   false,
  theme:         'dark',
  securityLevel: 'loose',
  fontFamily:    'inherit',
})

// ── version-safe mermaid renderer ────────────────────────────────────────────
// marked v4: renderer.code(code, lang, escaped)  — two separate args
// marked v5: renderer.code({ text, lang, escaped }) — one token object
// We handle both so the component works regardless of which version is installed.
let _id = 0

marked.use({
  renderer: {
    code(codeOrToken, langOrUndefined) {
      const isToken = typeof codeOrToken === 'object' && codeOrToken !== null
      const lang    = isToken ? codeOrToken.lang : langOrUndefined
      const code    = isToken ? codeOrToken.text : codeOrToken

      if (lang === 'mermaid') {
        // unique id required — mermaid silently skips any duplicate id it has seen
        return `<div class="mermaid" id="mmd-${++_id}">${code}</div>`
      }

      // returning false tells marked to use its built-in code block renderer
      return false
    }
  }
})

export default function OutputPanel({ output, tab, setTab }) {
  const containerRef = useRef(null)

  // Step 1 — parse markdown string to HTML
  // mermaid fences become <div class="mermaid"> instead of <pre><code>
  const rendered = useMemo(() => {
    _id = 0  // reset counter so ids are unique per document
    try   { return marked.parse(output || '') }
    catch { return output || '' }
  }, [output])

  // Step 2 — after HTML is in the DOM, run mermaid on the .mermaid divs
  useEffect(() => {
    if (tab !== 'rendered' || !containerRef.current) return

    // 80ms delay ensures React has flushed innerHTML before mermaid scans it
    const timer = setTimeout(() => {
      const diagrams = containerRef.current?.querySelectorAll('.mermaid:not([data-processed])')
      if (!diagrams || diagrams.length === 0) return

      mermaid.run({ nodes: diagrams }).catch(err => {
        console.warn('[OutputPanel] mermaid render error:', err.message)
      })
    }, 80)

    return () => clearTimeout(timer)
  }, [rendered, tab])

  const sharedBox = {
    background:   'var(--ink)',
    border:       '1px solid var(--border2)',
    borderRadius: 6,
    height:       380,
    overflow:     'auto',
    fontSize:     '.75rem',
    lineHeight:   1.6,
    fontFamily:   'var(--font-mono)',
  }

  return (
    <div>
      {tab === 'raw' && (
        <pre style={{
          ...sharedBox,
          padding:    '1rem',
          color:      'var(--amber)',
          whiteSpace: 'pre-wrap',
          wordBreak:  'break-word',
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
            padding:    '1.25rem',
            fontSize:   '.82rem',
            lineHeight: 1.7,
            color:      'var(--text)',
          }}
          dangerouslySetInnerHTML={{ __html: rendered }}
        />
      )}
    </div>
  )
}