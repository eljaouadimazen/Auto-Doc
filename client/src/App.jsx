import { useState, useCallback } from 'react'
import KeyPanel from './components/KeyPanel.jsx'
import PipelineSteps from './components/PipelineSteps.jsx'
import OutputPanel from './components/OutputPanel.jsx'
import StatusBar from './components/StatusBar.jsx'
import PipelineState from './components/PipelineState.jsx'
import AuditPanel from './components/AuditPanel.jsx'
import RulesPanel from './components/RulesPanel.jsx'

export default function App() {
  const [apiKey,        setApiKey]        = useState('')
  const [githubUrl,     setGithubUrl]     = useState('')
  const [useAST,        setUseAST]        = useState(true)
  const [provider,      setProvider]      = useState('groq')
  const [raw,           setRaw]           = useState(null)
  const [messages,      setMessages]      = useState(null)
  const [output,        setOutput]        = useState('Ready. Paste a GitHub URL and click Fetch Repo.')
  const [loading,       setLoading]       = useState(false)
  const [loadingMsg,    setLoadingMsg]    = useState('Working...')
  const [error,         setError]         = useState(null)
  const [tab,           setTab]           = useState('raw')
  const [mode,          setMode]          = useState(null)
  const [auditSummary,  setAuditSummary]  = useState(null)
  const [pipelineState, setPipelineState] = useState({ fetch: false, build: false, generate: false })

  const authHeaders = useCallback(() => {
    const h = { 'Content-Type': 'application/json' }
    if (apiKey) h['x-api-key'] = apiKey
    h['x-provider'] = provider
    return h
  }, [apiKey, provider])

  // ── Step 1 ────────────────────────────────────────────────────
  const fetchRepo = useCallback(async () => {
    if (!githubUrl) { setError('Enter a GitHub URL'); return }
    if (!githubUrl.includes('github.com')) { setError('Must be a github.com URL'); return }

    setError(null); setLoading(true); setLoadingMsg('Fetching repository...')
    setOutput('Fetching...'); setRaw(null); setMessages(null)
    setMode(null); setAuditSummary(null)
    setPipelineState({ fetch: false, build: false, generate: false })

    try {
      const res  = await fetch('/fetch', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ githubUrl }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Fetch failed')
      setRaw(data.rawMarkdown)
      setOutput(`✓ FETCH COMPLETE\n\nSize: ${data.size} chars\n\n--- PREVIEW ---\n\n${data.preview}`)
      setPipelineState(s => ({ ...s, fetch: true }))
    } catch (err) {
      setError(err.message)
      setOutput('Fetch failed.')
    } finally {
      setLoading(false)
    }
  }, [githubUrl, authHeaders])

  // ── Step 2 ────────────────────────────────────────────────────
  const buildInput = useCallback(async () => {
    if (!raw) { setError('Run Fetch Repo first'); return }

    setError(null); setLoading(true)
    setLoadingMsg(`Building ${useAST ? 'AST' : 'raw'} LLM input...`)
    setOutput('Building...'); setMessages(null)

    try {
      const res  = await fetch('/build', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ rawMarkdown: raw, useAST }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Build failed')
      setMessages(data.messages)
      setMode(data.mode)
      setAuditSummary(data.auditSummary)
      const a = data.auditSummary
      const auditLine = a.totalRedacted > 0
        ? `⚠  ${a.totalRedacted} secret(s) redacted in ${a.filesAffected} file(s)`
        : '✓ No secrets detected'
      setOutput(`✓ BUILD COMPLETE [mode: ${data.mode}]\n\nSecurity audit: ${a.filesScanned} files scanned\n${auditLine}`)
      setPipelineState(s => ({ ...s, build: true }))
    } catch (err) {
      setError(err.message)
      setOutput('Build failed.')
    } finally {
      setLoading(false)
    }
  }, [raw, useAST, authHeaders])

  // ── Step 3 ────────────────────────────────────────────────────
  const generateDocs = useCallback(async () => {
    if (!messages) { setError('Run Build Input first'); return }

    setError(null); setLoading(true)
    setLoadingMsg(
      provider === 'ollama'
        ? 'Running local phi3 — this may take 30–60 seconds...'
        : 'Calling Groq LLM — this may take 10–20 seconds...'
    )
    setOutput('Generating documentation...')

    try {
      const res  = await fetch('/generate-docs', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ messages }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Generation failed')
      setOutput(data.documentation)
      setPipelineState(s => ({ ...s, generate: true }))
      setTab('rendered')
    } catch (err) {
      setError(err.message)
      setOutput('Generation failed.')
    } finally {
      setLoading(false)
    }
  }, [messages, authHeaders, provider])

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '2.5rem 1.5rem', minHeight: '100vh' }}>

      {/* Header */}
      <header style={{ textAlign: 'center', marginBottom: '2.5rem' }} className="fade-in">
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)',
          padding: '6px 16px', borderRadius: 999, marginBottom: 20
        }}>
          <span style={{
            width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)',
            display: 'inline-block', animation: 'pulse-dot 2s ease-in-out infinite'
          }} />
          <span style={{ color: 'var(--accent)', fontSize: '.72rem', fontFamily: 'var(--font-mono)', letterSpacing: 2 }}>
            AUTO-DOC v0.4
          </span>
        </div>
        <h1 style={{
          fontFamily: 'var(--font-display)', fontSize: 'clamp(1.6rem, 4vw, 2.4rem)',
          fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.1,
          background: 'linear-gradient(135deg, #e8f5eb 0%, #6ee7b7 50%, #22c55e 100%)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          backgroundClip: 'text', marginBottom: 10
        }}>
          Repository Documentation Generator
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '.82rem', letterSpacing: 1 }}>
          SECURE · AI-POWERED · AUTOMATED
        </p>
      </header>

      {/* Main card */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 16, padding: '2rem',
        boxShadow: '0 0 60px rgba(34,197,94,0.04), 0 20px 40px rgba(0,0,0,0.4)'
      }} className="fade-in">

        {/* ── STEP 0: Provider Selection ── */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{
            display: 'block', fontSize: '.68rem', color: 'var(--text-muted)',
            letterSpacing: 2, marginBottom: 10, textTransform: 'uppercase'
          }}>
            LLM Provider
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[
              {
                id:    'groq',
                icon:  '☁',
                label: 'Cloud — Groq',
                desc:  'Fast generation via Groq API',
                color: '#60a5fa',
                bg:    'rgba(96,165,250,0.08)',
                border:'rgba(96,165,250,0.25)',
              },
              {
                id:    'ollama',
                icon:  '💻',
                label: 'Local — Ollama',
                desc:  '100% private · runs on your machine',
                color: '#22c55e',
                bg:    'rgba(34,197,94,0.08)',
                border:'rgba(34,197,94,0.25)',
              },
            ].map(p => (
              <button
                key={p.id}
                onClick={() => !loading && setProvider(p.id)}
                disabled={loading}
                style={{
                  padding: '14px 16px', borderRadius: 'var(--radius)', border: '1px solid',
                  borderColor:  provider === p.id ? p.border : 'var(--border)',
                  background:   provider === p.id ? p.bg : 'var(--bg-surface)',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  textAlign: 'left', transition: 'all 0.2s',
                  boxShadow: provider === p.id ? `0 0 16px ${p.bg}` : 'none'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: '1rem' }}>{p.icon}</span>
                  <span style={{
                    fontSize: '.82rem', fontWeight: 600,
                    color: provider === p.id ? p.color : 'var(--text-secondary)',
                    fontFamily: 'var(--font-display)',
                    transition: 'color 0.2s'
                  }}>
                    {p.label}
                  </span>
                  {provider === p.id && (
                    <span style={{
                      marginLeft: 'auto', fontSize: '.65rem', padding: '1px 8px',
                      borderRadius: 999, background: p.bg, color: p.color,
                      border: `1px solid ${p.border}`, fontFamily: 'var(--font-mono)'
                    }}>
                      selected
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', paddingLeft: 26 }}>
                  {p.desc}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* ── API Key — only shown for cloud mode ── */}
        {provider === 'groq' && (
          <div style={{
            marginBottom: '1.5rem',
            animation: 'fade-in 0.3s ease forwards'
          }}>
            <KeyPanel apiKey={apiKey} setApiKey={setApiKey} />
          </div>
        )}

        {/* ── Ollama info — only shown for local mode ── */}
        {provider === 'ollama' && (
          <div style={{
            marginBottom: '1.5rem', padding: '12px 16px',
            background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.15)',
            borderRadius: 'var(--radius)', animation: 'fade-in 0.3s ease forwards'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: '.78rem', color: 'var(--accent)', fontWeight: 500 }}>
                💻 Running phi3 locally
              </span>
              <span style={{
                fontSize: '.65rem', padding: '1px 8px', borderRadius: 999,
                background: 'rgba(34,197,94,0.1)', color: 'var(--accent)',
                border: '1px solid rgba(34,197,94,0.2)', fontFamily: 'var(--font-mono)'
              }}>
                no API key needed
              </span>
            </div>
            <p style={{ fontSize: '.72rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Make sure Ollama is running: <code style={{ color: 'var(--accent)', background: 'rgba(34,197,94,0.1)', padding: '1px 6px', borderRadius: 4 }}>ollama serve</code>
              &nbsp;· Generation takes 30–90 seconds · Data never leaves your machine
            </p>
          </div>
        )}

        {/* ── URL Input ── */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{
            display: 'block', fontSize: '.68rem', color: 'var(--text-muted)',
            letterSpacing: 2, marginBottom: 8, textTransform: 'uppercase'
          }}>
            GitHub Repository URL
          </label>
          <input
            type="url"
            value={githubUrl}
            onChange={e => setGithubUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !loading && fetchRepo()}
            placeholder="https://github.com/username/repository"
            disabled={loading}
            style={{
              width: '100%', padding: '12px 16px',
              background: 'var(--bg-surface)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius)', color: 'var(--text-primary)',
              fontFamily: 'var(--font-mono)', fontSize: '.85rem', outline: 'none',
              transition: 'border-color 0.2s',
            }}
            onFocus={e => e.target.style.borderColor = 'var(--accent)'}
            onBlur={e => e.target.style.borderColor = 'var(--border)'}
          />
        </div>

        {/* ── AST Toggle ── */}
        <ASTToggle
          useAST={useAST}
          setUseAST={val => { setUseAST(val); if (raw) setMessages(null); }}
          disabled={loading}
        />

        {/* ── Pipeline Steps ── */}
        <PipelineSteps
          loading={loading}
          raw={raw}
          messages={messages}
          onFetch={fetchRepo}
          onBuild={buildInput}
          onGenerate={generateDocs}
        />

        {/* ── Status + Error ── */}
        <StatusBar
          loading={loading}
          message={loadingMsg}
          error={error}
          mode={mode}
          auditSummary={auditSummary}
        />

        {/* ── Output ── */}
        <OutputPanel output={output} tab={tab} setTab={setTab} />

      </div>

      {/* Pipeline state indicator */}
      <PipelineState state={pipelineState} />
       {/* Audit log */}
      <AuditPanel apiKey={apiKey} />

      {/* Custom rules */}
      <RulesPanel apiKey={apiKey} />

    </div>
  )
}

function ASTToggle({ useAST, setUseAST, disabled }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '12px 16px', marginBottom: '1.5rem',
      background: 'var(--bg-surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)'
    }}>
      <button
        onClick={() => !disabled && setUseAST(!useAST)}
        style={{
          width: 44, height: 24, borderRadius: 12, border: 'none',
          cursor: disabled ? 'not-allowed' : 'pointer',
          background: useAST ? 'var(--accent)' : 'var(--bg-elevated)',
          position: 'relative', transition: 'background 0.25s', flexShrink: 0,
          boxShadow: useAST ? '0 0 12px rgba(34,197,94,0.4)' : 'none'
        }}
      >
        <span style={{
          position: 'absolute', top: 2, left: 2, width: 20, height: 20,
          background: '#fff', borderRadius: '50%', transition: 'transform 0.25s',
          transform: useAST ? 'translateX(20px)' : 'translateX(0)',
          boxShadow: '0 1px 4px rgba(0,0,0,0.3)'
        }} />
      </button>
      <div>
        <div style={{ fontSize: '.85rem', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
          AST Mode
          <span style={{
            fontSize: '.68rem', padding: '2px 8px', borderRadius: 999,
            background: useAST ? 'rgba(34,197,94,0.12)' : 'var(--bg-elevated)',
            color: useAST ? 'var(--accent)' : 'var(--text-muted)',
            border: `1px solid ${useAST ? 'rgba(34,197,94,0.3)' : 'var(--border)'}`,
            fontFamily: 'var(--font-mono)'
          }}>
            {useAST ? 'ON' : 'OFF'}
          </span>
        </div>
        <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginTop: 2 }}>
          {useAST ? 'Extracts code structure — fewer tokens, smarter docs' : 'Sends raw file content to the LLM'}
        </div>
      </div>
    </div>
  )
}