import { useState, useCallback } from 'react'
import KeyPanel from './components/KeyPanel.jsx'
import PipelineSteps from './components/PipelineSteps.jsx'
import OutputPanel from './components/OutputPanel.jsx'
import StatusBar from './components/StatusBar.jsx'
import PipelineState from './components/PipelineState.jsx'
import AuditPanel from './components/AuditPanel.jsx'
import RulesPanel from './components/RulesPanel.jsx'

export default function App() {
  // --- STATE ---
  const [apiKey,        setApiKey]        = useState('')
  const [githubUrl,     setGithubUrl]     = useState('')
  const [useAST,        setUseAST]        = useState(true)
  const [provider,      setProvider]      = useState('groq')
  const [pipelineMode,  setPipelineMode]  = useState('classic') 
  
  // Data State
  const [raw,           setRaw]           = useState(null)      // String for Preview
  const [rawFiles,      setRawFiles]      = useState([])        // Array for Agentic Pipeline
  const [repoName,      setRepoName]      = useState('')        // Parsed Repo Name
  const [messages,      setMessages]      = useState(null)
  
  // UI State
  const [output,        setOutput]        = useState('Ready. Paste a GitHub URL and click Fetch Repo.')
  const [loading,       setLoading]       = useState(false)
  const [loadingMsg,    setLoadingMsg]    = useState('Working...')
  const [error,         setError]         = useState(null)
  const [tab,           setTab]           = useState('raw')
  const [mode,          setMode]          = useState(null)
  const [auditSummary,  setAuditSummary]  = useState(null)
  const [pipelineState, setPipelineState] = useState({ fetch: false, build: false, generate: false })
  const [showSettings,  setShowSettings]  = useState(false)

  // --- HELPERS ---
  const authHeaders = useCallback(() => {
    const h = { 'Content-Type': 'application/json' }
    if (apiKey) h['x-api-key'] = apiKey
    h['x-provider'] = provider
    h['x-mode']     = pipelineMode
    return h
  }, [apiKey, provider, pipelineMode])

  // --- PIPELINE ACTIONS ---

  // STEP 1: FETCH
  const fetchRepo = useCallback(async () => {
    if (!githubUrl) { setError('Enter a GitHub URL'); return }
    setError(null); setLoading(true); setLoadingMsg('Fetching repository...')
    setOutput('Fetching...'); setRaw(null); setRawFiles([]); setMessages(null)
    setPipelineState({ fetch: false, build: false, generate: false })

    try {
      const res  = await fetch('/fetch', { 
        method: 'POST', 
        headers: authHeaders(), 
        body: JSON.stringify({ githubUrl }) 
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Fetch failed')
      
      // FIX: Store both the string for UI and array for logic
      setRaw(data.rawMarkdown) 
      setRawFiles(data.files)  
      setRepoName(data.repoName)
      
      setOutput(`✓ FETCH COMPLETE\n\nSize: ${data.size} chars\n\n--- PREVIEW ---\n\n${data.preview}`)
      setPipelineState(s => ({ ...s, fetch: true }))
    } catch (err) {
      setError(err.message); setOutput('Fetch failed.')
    } finally { setLoading(false) }
  }, [githubUrl, authHeaders])

  // STEP 2: BUILD
  const buildInput = useCallback(async () => {
    if (!rawFiles.length) { setError('Run Fetch Repo first'); return }

    // Logic shift: Agentic mode skips the manual LLM input building step
    if (pipelineMode === 'agentic') {
      setMessages(['agentic_placeholder']) 
      setMode('agentic')
      setOutput('✓ READY FOR AGENTIC GENERATION\n\nThe Orchestrator will now handle input preparation automatically.')
      setPipelineState(s => ({ ...s, build: true }))
      return
    }

    setError(null); setLoading(true); setLoadingMsg(`Building LLM input...`)
    try {
      const res  = await fetch('/build', { 
        method: 'POST', 
        headers: authHeaders(), 
        body: JSON.stringify({ files: rawFiles, useAST }) 
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Build failed')
      
      setMessages(data.messages)
      setMode(data.mode)
      setAuditSummary(data.auditSummary)
      setOutput(`✓ BUILD COMPLETE [mode: ${data.mode}]\n\nSecurity audit: ${data.auditSummary.filesScanned} files scanned`)
      setPipelineState(s => ({ ...s, build: true }))
    } catch (err) {
      setError(err.message); setOutput('Build failed.')
    } finally { setLoading(false) }
  }, [rawFiles, useAST, authHeaders, pipelineMode])

  // STEP 3: GENERATE
  const generateDocs = useCallback(async () => {
    if (!messages) { setError('Run Build Input first'); return }
    setError(null); setLoading(true)
    setLoadingMsg('Calling Pipeline...')

    try {
      const res = await fetch('/generate-docs', {
        method:  'POST',
        headers: authHeaders(),
        body:    JSON.stringify({
          messages,
          files: rawFiles, // Critical: Send the actual structured array
          repoName: repoName
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Generation failed')
      
      setOutput(data.documentation)
      setPipelineState(s => ({ ...s, generate: true }))
      setTab('rendered')
    } catch (err) {
      setError(err.message); setOutput('Generation failed.')
    } finally { setLoading(false) }
  }, [messages, rawFiles, repoName, authHeaders])

  // --- RENDER ---
  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '2.5rem 1.5rem', minHeight: '100vh' }}>
      <header style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', padding: '6px 16px', borderRadius: 999, marginBottom: 20 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block' }} />
          <span style={{ color: 'var(--accent)', fontSize: '.72rem', fontFamily: 'var(--font-mono)', letterSpacing: 2 }}>AUTO-DOC v0.5</span>
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(1.6rem, 4vw, 2.4rem)', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-primary)', marginBottom: 10 }}>
          Repository Documentation Generator
        </h1>
      </header>

      <div style={{ position: 'relative', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: '2rem', boxShadow: '0 20px 40px rgba(0,0,0,0.4)' }}>
        
        {/* Settings Toggle */}
        <button 
          onClick={() => setShowSettings(!showSettings)} 
          style={{ position: 'absolute', top: '1.5rem', right: '1.5rem', background: showSettings ? 'var(--accent)' : 'var(--bg-elevated)', color: showSettings ? '#000' : 'var(--text-muted)', border: '1px solid var(--border)', padding: '6px 12px', borderRadius: 8, fontSize: '.7rem', cursor: 'pointer', zIndex: 10 }}
        >
          {showSettings ? '✕ Close Settings' : '⚙ Advanced Settings'}
        </button>

        {/* Pipeline Selection */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', fontSize: '.68rem', color: 'var(--text-muted)', letterSpacing: 2, marginBottom: 10, textTransform: 'uppercase' }}>Pipeline Mode</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <ModeButton active={pipelineMode === 'classic'} onClick={() => setPipelineMode('classic')} icon="⚡" label="Classic" desc="AST parser · single LLM call" color="#fbbf24" />
            <ModeButton active={pipelineMode === 'agentic'} onClick={() => setPipelineMode('agentic')} icon="🤖" label="Agentic" desc="Multi-agent · deeper analysis" color="#a78bfa" />
          </div>
        </div>

        {/* Provider Selection */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', fontSize: '.68rem', color: 'var(--text-muted)', letterSpacing: 2, marginBottom: 10, textTransform: 'uppercase' }}>LLM Provider</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <ProviderButton active={provider === 'groq'} onClick={() => setProvider('groq')} icon="☁" label="Cloud — Groq" color="#60a5fa" />
            <ProviderButton active={provider === 'ollama'} onClick={() => setProvider('ollama')} icon="💻" label="Local — Ollama" color="#22c55e" />
          </div>
        </div>

        {provider === 'groq' && <KeyPanel apiKey={apiKey} setApiKey={setApiKey} />}
        
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', fontSize: '.68rem', color: 'var(--text-muted)', letterSpacing: 2, marginBottom: 8, textTransform: 'uppercase' }}>GitHub Repository URL</label>
          <input 
            className="ad-input" 
            type="url" 
            value={githubUrl} 
            onChange={e => setGithubUrl(e.target.value)} 
            placeholder="https://github.com/username/repository" 
            style={{ width: '100%', padding: '12px 16px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }} 
          />
        </div>

        {pipelineMode === 'classic' && (
          <ASTToggle useAST={useAST} setUseAST={setUseAST} disabled={loading} />
        )}

        <PipelineSteps 
          loading={loading} 
          raw={raw} 
          messages={messages} 
          onFetch={fetchRepo} 
          onBuild={buildInput} 
          onGenerate={generateDocs} 
        />
        
        <StatusBar 
          loading={loading} 
          message={loadingMsg} 
          error={error} 
          mode={mode} 
          auditSummary={auditSummary} 
        />
        
        <OutputPanel output={output} tab={tab} setTab={setTab} />

        {showSettings && (
          <div style={{ marginTop: '2rem', paddingTop: '2rem', borderTop: '1px dashed var(--border)' }}>
            <AuditPanel apiKey={apiKey} />
            <RulesPanel apiKey={apiKey} />
          </div>
        )}
      </div>

      <PipelineState state={pipelineState} />
    </div>
  )
}

// --- SUB-COMPONENTS (Styles preserved) ---

function ModeButton({ active, onClick, icon, label, desc, color }) {
  return (
    <button 
      onClick={onClick} 
      style={{ padding: '14px 16px', borderRadius: 8, border: '1px solid', borderColor: active ? color : 'var(--border)', background: active ? `${color}15` : 'var(--bg-surface)', cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s' }}
    >
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
    <button 
      onClick={onClick} 
      style={{ padding: '12px 16px', borderRadius: 8, border: '1px solid', borderColor: active ? color : 'var(--border)', background: active ? `${color}15` : 'var(--bg-surface)', cursor: 'pointer', transition: 'all 0.2s' }}
    >
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
      <button 
        onClick={() => !disabled && setUseAST(!useAST)} 
        style={{ width: 40, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer', background: useAST ? 'var(--accent)' : 'var(--bg-elevated)', position: 'relative' }}
      >
        <span style={{ position: 'absolute', top: 2, left: 2, width: 16, height: 16, background: '#fff', borderRadius: '50%', transform: useAST ? 'translateX(20px)' : 'translateX(0)', transition: 'transform 0.2s' }} />
      </button>
      <span style={{ fontSize: '.8rem' }}>AST Extraction Mode {useAST ? '(On)' : '(Off)'}</span>
    </div>
  )
}