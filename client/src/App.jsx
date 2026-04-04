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
  const [pipelineMode,  setPipelineMode]  = useState('classic') // 'classic' | 'agentic'
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
  
  // New state for toggling the extra panels
  const [showSettings,  setShowSettings]  = useState(false)

  // --- HELPERS ---
  const authHeaders = useCallback(() => {
    const h = { 'Content-Type': 'application/json' }
    if (apiKey) h['x-api-key'] = apiKey
    h['x-provider'] = provider
    h['x-mode']     = pipelineMode
    return h
  }, [apiKey, provider, pipelineMode])

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

    if (pipelineMode === 'agentic') {
      setMessages(['agentic']) 
      setMode('agentic')
      setOutput('✓ READY FOR AGENTIC GENERATION\n\nClick Generate Docs — the Orchestrator will run all agents automatically.')
      setPipelineState(s => ({ ...s, build: true }))
      return
    }

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
  }, [raw, useAST, authHeaders, pipelineMode])

  // ── Step 3 ────────────────────────────────────────────────────
  const generateDocs = useCallback(async () => {
    if (!messages) { setError('Run Build Input first'); return }

    setError(null); setLoading(true)
    setLoadingMsg(
      pipelineMode === 'agentic'
        ? 'Running agentic pipeline — Security → Code Intelligence → Architecture → Writer...'
        : provider === 'ollama'
          ? 'Running local phi3 — this may take 30–60 seconds...'
          : 'Calling Groq LLM — this may take 10–20 seconds...'
    )
    setOutput('Generating documentation...')

    try {
      const res = await fetch('/generate-docs', {
        method:  'POST',
        headers: authHeaders(),
        body:    JSON.stringify({
          messages,
          rawMarkdown: raw 
        })
      })
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
  }, [messages, raw, authHeaders, provider, pipelineMode])

  // --- RENDER ---
  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '2.5rem 1.5rem', minHeight: '100vh' }}>

      {/* Header */}
      <header style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', padding: '6px 16px', borderRadius: 999, marginBottom: 20 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block' }} />
          <span style={{ color: 'var(--accent)', fontSize: '.72rem', fontFamily: 'var(--font-mono)', letterSpacing: 2 }}>AUTO-DOC v0.5</span>
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.6rem, 4vw, 2.4rem)', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-primary)', marginBottom: 10 }}>
          Repository Documentation Generator
        </h1>
      </header>

      {/* Main Container */}
      <div style={{ position: 'relative', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '2rem', boxShadow: '0 20px 40px rgba(0,0,0,0.4)' }}>
        
        {/* Toggle Settings Button */}
        <button 
          onClick={() => setShowSettings(!showSettings)}
          style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', background: showSettings ? 'var(--accent)' : 'var(--bg-elevated)', color: showSettings ? '#000' : 'var(--text-muted)', border: '1px solid var(--border)', padding: '6px 12px', borderRadius: 8, fontSize: '.7rem', cursor: 'pointer', transition: 'all 0.2s', zIndex: 10 }}>
          {showSettings ? '✕ Close Settings' : '⚙ Advanced Settings'}
        </button>

        {/* ── Mode Selection ── */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', fontSize: '.68rem', color: 'var(--text-muted)', letterSpacing: 2, marginBottom: 10, textTransform: 'uppercase' }}>Pipeline Mode</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <ModeButton active={pipelineMode === 'classic'} onClick={() => setPipelineMode('classic')} icon="⚡" label="Classic" desc="AST parser · single LLM call" color="#fbbf24" />
            <ModeButton active={pipelineMode === 'agentic'} onClick={() => setPipelineMode('agentic')} icon="🤖" label="Agentic" desc="Multi-agent · deeper analysis" color="#a78bfa" />
          </div>
        </div>

        {/* ── LLM Provider ── */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', fontSize: '.68rem', color: 'var(--text-muted)', letterSpacing: 2, marginBottom: 10, textTransform: 'uppercase' }}>LLM Provider</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <ProviderButton active={provider === 'groq'} onClick={() => setProvider('groq')} icon="☁" label="Cloud — Groq" color="#60a5fa" />
            <ProviderButton active={provider === 'ollama'} onClick={() => setProvider('ollama')} icon="💻" label="Local — Ollama" color="#22c55e" />
          </div>
        </div>

        {/* ── Inputs ── */}
        {provider === 'groq' && <KeyPanel apiKey={apiKey} setApiKey={setApiKey} />}
        
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', fontSize: '.68rem', color: 'var(--text-muted)', letterSpacing: 2, marginBottom: 8, textTransform: 'uppercase' }}>GitHub Repository URL</label>
          <input 
            className="ad-input" 
            type="url" value={githubUrl} 
            onChange={e => setGithubUrl(e.target.value)} 
            placeholder="https://github.com/username/repository" 
            style={{ width: '100%', padding: '12px 16px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }} 
          />
        </div>

        {pipelineMode === 'classic' && <ASTToggle useAST={useAST} setUseAST={setUseAST} disabled={loading} />}

        {/* ── Core Pipeline ── */}
        <PipelineSteps loading={loading} raw={raw} messages={messages} onFetch={fetchRepo} onBuild={buildInput} onGenerate={generateDocs} />
        <StatusBar loading={loading} message={loadingMsg} error={error} mode={mode} auditSummary={auditSummary} />
        <OutputPanel output={output} tab={tab} setTab={setTab} />

        {/* ── Hidden Advanced Panels (Audit & Rules) ── */}
        {showSettings && (
          <div style={{ marginTop: '2rem', paddingTop: '2rem', borderTop: '1px dashed var(--border)', animation: 'fade-in 0.3s ease' }}>
            <h3 style={{ fontSize: '.85rem', color: 'var(--accent)', marginBottom: '1.5rem', fontFamily: 'var(--font-display)' }}>Advanced Configuration & Security</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <AuditPanel apiKey={apiKey} />
              <RulesPanel apiKey={apiKey} />
            </div>
          </div>
        )}
      </div>

      <PipelineState state={pipelineState} />
    </div>
  )
}

// --- Helper Components for Cleanliness ---

function ModeButton({ active, onClick, icon, label, desc, color }) {
  return (
    <button onClick={onClick} style={{
      padding: '14px 16px', borderRadius: 8, border: '1px solid',
      borderColor: active ? color : 'var(--border)',
      background: active ? `${color}15` : 'var(--bg-surface)',
      cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span>{icon}</span>
        <span style={{ fontSize: '.82rem', fontWeight: 600, color: active ? color : 'var(--text-secondary)' }}>{label}</span>
      </div>
      <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{desc}</div>
    </button>
  )
}

function ProviderButton({ active, onClick, icon, label, color }) {
  return (
    <button onClick={onClick} style={{
      padding: '12px 16px', borderRadius: 8, border: '1px solid',
      borderColor: active ? color : 'var(--border)',
      background: active ? `${color}15` : 'var(--bg-surface)',
      cursor: 'pointer', transition: 'all 0.2s'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>{icon}</span>
        <span style={{ fontSize: '.82rem', fontWeight: 600, color: active ? color : 'var(--text-secondary)' }}>{label}</span>
      </div>
    </button>
  )
}

function ASTToggle({ useAST, setUseAST, disabled }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px', marginBottom: '1.5rem', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8 }}>
      <button onClick={() => !disabled && setUseAST(!useAST)} style={{ width: 40, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer', background: useAST ? 'var(--accent)' : 'var(--bg-elevated)', position: 'relative' }}>
        <span style={{ position: 'absolute', top: 2, left: 2, width: 16, height: 16, background: '#fff', borderRadius: '50%', transform: useAST ? 'translateX(20px)' : 'translateX(0)', transition: 'transform 0.2s' }} />
      </button>
      <span style={{ fontSize: '.8rem' }}>AST Mode {useAST ? '(On)' : '(Off)'}</span>
    </div>
  )
}