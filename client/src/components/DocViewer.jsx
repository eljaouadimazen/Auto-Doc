import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import DOMPurify from 'dompurify'
import { marked } from 'marked'
import mermaid from 'mermaid'
mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'loose', fontFamily: 'system-ui' })
import { useDebounce } from '@/hooks/useDebounce'

const THEME_KEY = 'ghp-docs-theme'

function slugify(text) {
  return text.toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

export default function DocViewer({ markdown, repoName, onClose }) {
  const [theme, setTheme] = useState(() => {
    const stored = localStorage.getItem(THEME_KEY)
    if (stored) return stored
    // No saved viewer preference yet — match the app's current theme instead
    // of defaulting to 'light', which produced a white viewer over a dark app.
    return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
  })
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search, 300)
  const [activeId, setActiveId] = useState('')
  const contentRef = useRef(null)
  const observerRef = useRef(null)

  const toggleTheme = useCallback(() => {
    setTheme(prev => {
      const next = prev === 'light' ? 'dark' : 'light'
      localStorage.setItem(THEME_KEY, next)
      return next
    })
  }, [])

  const headings = useMemo(() => {
    const html = marked.parse(markdown || '', { breaks: true, gfm: true })
    const div = document.createElement('div')
    div.innerHTML = html
    const els = div.querySelectorAll('h1, h2, h3')
    return Array.from(els).map(h => ({
      level: parseInt(h.tagName[1]),
      text: h.textContent.trim(),
      id: slugify(h.textContent.trim())
    }))
  }, [markdown])

  const renderedHtml = useMemo(() => {
    return marked.parse(markdown || '', { breaks: true, gfm: true })
  }, [markdown])

  const filteredSections = useMemo(() => {
    if (!debouncedSearch.trim()) return null
    const lower = debouncedSearch.toLowerCase()
    const div = document.createElement('div')
    div.innerHTML = renderedHtml
    const sections = div.querySelectorAll('h1, h2, h3')
    const result = new Set()
    sections.forEach(h => {
      const sectionContent = []
      let node = h.nextSibling
      while (node && !/^H[123]$/.test(node.tagName)) {
        sectionContent.push(node.textContent || '')
        node = node.nextSibling
      }
      if ((h.textContent + sectionContent.join(' ')).toLowerCase().includes(lower)) {
        result.add(h.id || slugify(h.textContent))
      }
    })
    return result
  }, [debouncedSearch, renderedHtml])

  const highlightHtml = useMemo(() => {
    if (!debouncedSearch.trim()) return renderedHtml
    const lower = debouncedSearch.toLowerCase()
    const div = document.createElement('div')
    div.innerHTML = renderedHtml
    const treeWalker = document.createTreeWalker(div, NodeFilter.SHOW_TEXT, null, false)
    const nodes = []
    while (treeWalker.nextNode()) nodes.push(treeWalker.currentNode)
    nodes.forEach(node => {
      const idx = node.textContent.toLowerCase().indexOf(lower)
      if (idx === -1) return
      const frag = document.createDocumentFragment()
      const before = node.textContent.slice(0, idx)
      if (before) frag.appendChild(document.createTextNode(before))
      const mark = document.createElement('mark')
      mark.textContent = node.textContent.slice(idx, idx + debouncedSearch.length)
      frag.appendChild(mark)
      const after = node.textContent.slice(idx + debouncedSearch.length)
      if (after) frag.appendChild(document.createTextNode(after))
      node.parentNode.replaceChild(frag, node)
    })
    return div.innerHTML
  }, [debouncedSearch, renderedHtml])

  useEffect(() => {
    if (!contentRef.current) return

    const root = contentRef.current

    const renderMermaidBlocks = async () => {
      const codeBlocks = root.querySelectorAll('pre code.language-mermaid')
      for (const codeEl of codeBlocks) {
        if (codeEl.dataset.mermaidReplaced) continue
        codeEl.dataset.mermaidReplaced = 'true'

        const pre = codeEl.closest('pre')
        if (!pre) continue
        const diagram = (codeEl.textContent || '').trim()
        if (!diagram) continue

        const container = document.createElement('div')
        container.className = 'mermaid-container'
        const div = document.createElement('div')
        div.className = 'mermaid'
        div.textContent = diagram
        container.appendChild(div)
        pre.replaceWith(container)
      }

      const mermaidDivs = root.querySelectorAll('.mermaid:not([data-processed])')
      if (mermaidDivs.length === 0) return

      for (const div of mermaidDivs) {
        try {
          await mermaid.run({ nodes: [div] })
        } catch (err) {
          const container = div.parentNode
          if (container) {
            container.innerHTML = `<div style="padding:12px;color:#ef4444;font-size:13px;font-family:monospace;text-align:center">⚠ ${err.message || 'Diagram syntax error'}</div>`
          }
        }
      }
    }

    renderMermaidBlocks()

    const observer = new MutationObserver(() => {
      renderMermaidBlocks()
    })
    observer.observe(root, { childList: true, subtree: true })

    return () => observer.disconnect()
  }, [highlightHtml])

  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect()
    const sections = contentRef.current?.querySelectorAll('[id]')
    if (!sections?.length) return
    observerRef.current = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) setActiveId(entry.target.id)
      })
    }, { rootMargin: '-80px 0px -60% 0px' })
    sections.forEach(s => observerRef.current.observe(s))
    return () => observerRef.current?.disconnect()
  }, [highlightHtml])

  const matchCount = filteredSections ? filteredSections.size : 0
  const isDark = theme === 'dark'

  return (
    <div style={{
      ...styles.wrapper,
      background: isDark ? '#0f172a' : '#ffffff',
      color: isDark ? '#e2e8f0' : '#1e293b'
    }}>
      {/* Top bar */}
      <div style={{
        ...styles.topbar,
        background: isDark ? '#0f172a' : '#ffffff',
        borderColor: isDark ? '#334155' : '#e2e8f0'
      }}>
        <button onClick={onClose} style={styles.closeBtn} title="Close preview">✕</button>
        <span style={styles.topbarLogo}>📄 Docs</span>
        <span style={{
          ...styles.topbarDivider,
          background: isDark ? '#334155' : '#e2e8f0'
        }} />
        <span style={{ ...styles.topbarRepo, color: isDark ? '#94a3b8' : '#64748b' }}>
          {repoName}
        </span>
        <div style={styles.topbarActions}>
          <button onClick={toggleTheme} style={{
            ...styles.themeBtn,
            borderColor: isDark ? '#334155' : '#e2e8f0',
            color: isDark ? '#94a3b8' : '#64748b'
          }}>
            {isDark ? '☀️ Light' : '🌙 Dark'}
          </button>
        </div>
      </div>

      <div style={styles.layout}>
        {/* Sidebar */}
        <div style={{
          ...styles.sidebar,
          background: isDark ? '#1e293b' : '#f8fafc',
          borderColor: isDark ? '#334155' : '#e2e8f0'
        }}>
          <div style={{
            ...styles.searchBox,
            borderColor: isDark ? '#334155' : '#e2e8f0',
            background: isDark ? '#1e293b' : '#f1f5f9'
          }}>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search documentation..."
              style={{
                ...styles.searchInput,
                background: isDark ? '#1e293b' : '#f1f5f9',
                color: isDark ? '#e2e8f0' : '#1e293b',
                borderColor: isDark ? '#334155' : '#e2e8f0'
              }}
            />
            {search.trim() && (
              <div style={{ ...styles.searchCount, color: isDark ? '#64748b' : '#94a3b8' }}>
                {matchCount} section{matchCount !== 1 ? 's' : ''} match
              </div>
            )}
          </div>
          <div style={styles.toc}>
            {headings.map((h, i) => (
              <a
                key={i}
                href={`#${h.id}`}
                onClick={e => {
                  e.preventDefault()
                  document.getElementById(h.id)?.scrollIntoView({ behavior: 'smooth' })
                }}
                style={{
                  ...styles.tocLink,
                  paddingLeft: h.level === 1 ? 16 : h.level === 2 ? 28 : 40,
                  fontSize: h.level === 1 ? 13 : h.level === 2 ? 12.5 : 12,
                  color: activeId === h.id ? '#ff4f00' : (isDark ? '#94a3b8' : '#64748b'),
                  background: activeId === h.id ? (isDark ? '#1c1917' : '#fff3ed') : 'transparent',
                  borderLeftColor: activeId === h.id ? '#ff4f00' : 'transparent',
                  fontWeight: activeId === h.id ? 600 : 400
                }}
              >
                {h.text}
              </a>
            ))}
          </div>
        </div>

        {/* Main content */}
        <main
          ref={contentRef}
          style={{
            ...styles.main,
            background: isDark ? '#0f172a' : '#ffffff'
          }}
        >
          <div
            className="doc-viewer-content"
            style={{
              ...styles.content,
              color: isDark ? '#e2e8f0' : '#1e293b',
              '--doc-bg-code': isDark ? '#1e293b' : '#f1f5f9',
              '--doc-bg-th': isDark ? '#1e293b' : '#f8fafc',
              '--doc-bg-mark': isDark ? '#854d0e' : '#fef3c7',
              '--doc-bg-mermaid': '#1e293b',
            }}
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(highlightHtml, { ADD_ATTR: ['class'], ADD_TAGS: ['svg', 'path', 'g', 'circle', 'rect', 'line', 'text', 'polygon', 'polyline', 'ellipse', 'defs', 'clipPath', 'linearGradient', 'stop', 'marker', 'use', 'foreignObject'] }) }}
          />
          <div style={{
            ...styles.footer,
            borderColor: isDark ? '#334155' : '#e2e8f0',
            color: isDark ? '#64748b' : '#94a3b8'
          }}>
            <p>Documentation generated by Auto-Doc</p>
            <p>Repository: {repoName}</p>
          </div>
        </main>
      </div>
    </div>
  )
}

const styles = {
  wrapper: {
    position: 'fixed', inset: 0, zIndex: 9999,
    display: 'flex', flexDirection: 'column',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    fontSize: 16, lineHeight: 1.7
  },
  topbar: {
    display: 'flex', alignItems: 'center', gap: 12,
    height: 56, padding: '0 20px',
    borderBottom: '1px solid', flexShrink: 0
  },
  closeBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    fontSize: 18, color: '#94a3b8', padding: '4px 8px',
    borderRadius: 4
  },
  topbarLogo: { fontWeight: 700, fontSize: 15, whiteSpace: 'nowrap' },
  topbarDivider: { width: 1, height: 20, flexShrink: 0 },
  topbarRepo: { fontSize: 14, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  topbarActions: { display: 'flex', alignItems: 'center', gap: 8 },
  themeBtn: {
    background: 'none', border: '1px solid',
    borderRadius: 6, padding: '6px 10px', cursor: 'pointer',
    fontSize: 13, transition: 'all 0.15s'
  },
  layout: { display: 'flex', flex: 1, overflow: 'hidden' },
  sidebar: {
    width: 280, flexShrink: 0,
    borderRight: '1px solid',
    display: 'flex', flexDirection: 'column', overflow: 'hidden'
  },
  searchBox: {
    padding: 12, borderBottom: '1px solid', flexShrink: 0
  },
  searchInput: {
    width: '100%', padding: '8px 12px',
    border: '1px solid', borderRadius: 6,
    fontSize: 13, outline: 'none'
  },
  searchCount: { fontSize: 11, marginTop: 4, paddingLeft: 4 },
  toc: { flex: 1, overflowY: 'auto', padding: '8px 0' },
  tocLink: {
    display: 'block', padding: '6px 16px',
    textDecoration: 'none', transition: 'all 0.1s',
    borderLeft: '2px solid transparent',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    cursor: 'pointer'
  },
  main: { flex: 1, overflowY: 'auto', padding: '40px 48px', maxWidth: 960 },
  content: {
    maxWidth: 800
  },
  footer: {
    marginTop: 48, paddingTop: 16,
    borderTop: '1px solid',
    fontSize: 12
  }
}
