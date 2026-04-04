import { useState, useCallback, useEffect } from 'react'
import KeyPanel from './components/KeyPanel.jsx'
import OutputPanel from './components/OutputPanel.jsx'
import AuditPanel from './components/AuditPanel.jsx'
import RulesPanel from './components/RulesPanel.jsx'

/* ─────────────────────────────────────────────────────────────
   GLOBAL STYLES (Merged High-Contrast Theme)
───────────────────────────────────────────────────────────── */
const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Syne+Mono&family=Syne:wght@400;600;800&family=DM+Mono:ital,wght@0,300;0,400;0,500;1,300&display=swap');

  .autodoc-root {
    --ink:        #0b0e14;
    --ink2:       #141820;
    --ink3:       #1e2430;
    --border:     rgba(255,255,255,0.07);
    --border2:    rgba(255,255,255,0.13);
    --amber:      #f5a623;
    --amber-dim:  rgba(245,166,35,0.12);
    --amber-glow: rgba(245,166,35,0.25);
    --text:       #e8e4db;
    --muted:      #6b7180;
    --muted2:     #4a5060;
    --green:      #3ddc84;
    --green-dim:  rgba(61,220,132,0.1);
    --red:        #ff5f6d;
    --blue:       #5ba4f5;
    --font-head:  'Syne', sans-serif;
    --font-mono:  'DM Mono', monospace;
    --font-disp:  'Syne Mono', monospace;

    font-family: var(--font-mono);
    background: var(--ink);
    color: var(--text);
    min-height: 100vh;
  }

  .autodoc-root * { box-sizing: border-box; margin: 0; padding: 0; }
  .fade-up { animation: fadeUp 0.45s cubic-bezier(.22,1,.36,1) both }
  @keyframes fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:none} }
  @keyframes spin { to{transform:rotate(360deg)} }

  .ad-input {
    width:100%; padding:11px 14px;
    background:var(--ink3); border:1px solid var(--border2);
    border-radius:6px; color:var(--text);
    font-family:var(--font-mono); font-size:.82rem;
    outline:none; transition:all .2s;
  }
  .ad-input:focus { border-color:var(--amber); box-shadow:0 0 0 3px var(--amber-dim); }

  .step-btn {
    display:flex; align-items:center; gap:10px;
    padding:12px 16px; border-radius:8px;
    border:1px solid var(--border); background:var(--ink2);
    cursor:pointer; transition:all .18s; width:100%;
    font-family:var(--font-mono); font-size:.8rem; color:var(--muted);
  }
  .step-btn.s-ready { color:var(--text); border-color:var(--border2); background:var(--ink3) }
  .step-btn.s-done  { color:var(--green); border-color:rgba(61,220,132,.25); background:var(--green-dim) }

  .spinner {
    width:14px; height:14px; border-radius:50%;
    border:2px solid var(--border2); border-top-color:var(--amber);
    animation:spin .7s linear infinite;
  }
`

function injectStyles() {
  if (document.getElementById('autodoc-styles')) return
  const el = document.createElement('style')
  el.id = 'autodoc-styles'
  el.textContent = GLOBAL_CSS
  document.head.appendChild(el)
}

/* ─────────────────────────────────────────────────────────────
   MAIN APP
───────────────────────────────────────────────────────────── */
export default function App() {
  injectStyles()

  // --- Persistent State ---
  const [apiKey,        setApiKey]        = useState('')
  const [githubUrl,     setGithubUrl]     = useState('')
  const [provider,      setProvider]      = useState('groq')
  const [useAST,        setUseAST]        = useState(true)
  const [pipelineMode,  setPipelineMode]  = useState('classic') // 'classic' | 'agentic'

  // --- Processing State ---
  const [raw,           setRaw]           = useState(null)
  const [messages,      setMessages]      = useState(null)
  const [output,        setOutput]        = useState('// system ready — enter repository url')
  const [loading,       setLoading]       = useState(false)
  const [loadingStep,   setLoadingStep]   = useState(null)
  const [loadingMsg,    setLoadingMsg]    = useState('')
  const [error,         setError]         = useState(null)

  // --- Metadata (Branch 1 & 2 Merge) ---
  const [tab,           setTab]           = useState('raw')
  const [projectNature, setProjectNature] = useState(null)
  const [auditSummary,  setAuditSummary]  = useState(null)
  const [pipeline,      setPipeline]      = useState({ fetch: false, build: false, generate: false })

  const authHeaders = useCallback(() => {
    const h = { 'Content-Type': 'application/json' }
    if (apiKey) h['x-api-key'] = apiKey
    h['x-provider'] = provider
    h['x-pipeline-mode'] = pipelineMode
    return h
  }, [apiKey, provider, pipelineMode])

  // STEP 1: Fetch
  const fetchRepo = useCallback(async () => {
    if (!githubUrl) { setError('Target URL required'); return }
    setError(null); setLoading(true); setLoadingStep('fetch'); setLoadingMsg('scanning repository...')
    
    try {
      const res = await fetch('/fetch', { 
        method: 'POST', 
        headers: authHeaders(), 
        body: JSON.stringify({ githubUrl }) 
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      
      setRaw(data.rawMarkdown)
      setOutput(`// fetch successful\n// objects found: ${data.fileCount || 'N/A'}\n\n${data.preview}`)
      setPipeline(s => ({ ...s, fetch: true }))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false); setLoadingStep(null)
    }
  }, [githubUrl, authHeaders])

  // STEP 2: Build (The Security Chokepoint)
  const buildInput = useCallback(async () => {
    if (!raw) return
    setError(null); setLoading(true); setLoadingStep('build'); setLoadingMsg('enforcing pii sanitization...')
    
    try {
      const res = await fetch('/build', { 
        method: 'POST', 
        headers: authHeaders(), 
        body: JSON.stringify({ rawMarkdown: raw, useAST }) 
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      
      setMessages(data.messages)
      setAuditSummary(data.auditSummary)
      setProjectNature(data.nature || 'General')
      
      const a = data.auditSummary
      setOutput(`// build complete\n// security: ${a.totalRedacted} redacted\n// nature: ${data.nature || 'analyzing...'}`)
      setPipeline(s => ({ ...s, build: true }))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false); setLoadingStep(null)
    }
  }, [raw, useAST, authHeaders])

  // STEP 3: Generate
  const generateDocs = useCallback(async () => {
    if (!messages) return
    setLoading(true); setLoadingMsg('generating professional documentation...')
    
    try {
      const res = await fetch('/generate-docs', { 
        method: 'POST', 
        headers: authHeaders(), 
        body: JSON.stringify({ messages }) 
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      
      setOutput(data.documentation)
      setPipeline(s => ({ ...s, generate: true }))
      setTab('rendered')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [messages, authHeaders])

  return (
    <div className="autodoc-root">
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '40px 20px' }} className="fade-up">
        
        <header style={{ marginBottom: 40 }}>
          <h1 style={{ fontFamily: 'var(--font-head)', fontSize: '1.8rem', fontWeight: 800 }}>
            AUTO<span style={{ color: 'var(--amber)' }}>DOC</span>.SYS
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: '.75rem', marginTop: 4 }}>
            AGENTIC DOCUMENTATION ENGINE // PII-SAFE
          </p>
        </header>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 30 }}>
          
          {/* Main Controls */}
          <main>
            <section style={{ marginBottom: 24 }}>
              <input 
                className="ad-input" 
                placeholder="https://github.com/user/repo"
                value={githubUrl}
                onChange={e => setGithubUrl(e.target.value)}
              />
            </section>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <StepButton 
                index="1" label="Fetch Source" 
                status={pipeline.fetch ? 'done' : loadingStep === 'fetch' ? 'loading' : 'ready'} 
                onClick={fetchRepo} 
              />
              <StepButton 
                index="2" label="Build Context & Scour PII" 
                status={pipeline.build ? 'done' : loadingStep === 'build' ? 'loading' : pipeline.fetch ? 'ready' : 'idle'} 
                onClick={buildInput} 
              />
              <StepButton 
                index="3" label="Generate Architecture" 
                status={pipeline.generate ? 'done' : loading ? 'loading' : pipeline.build ? 'ready' : 'idle'} 
                onClick={generateDocs} 
              />
            </div>

            <OutputPanel output={output} tab={tab} setTab={setTab} />
          </main>

          {/* Sidebar / Panels */}
          <aside>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <KeyPanel apiKey={apiKey} setApiKey={setApiKey} provider={provider} setProvider={setProvider} />
              
              <div style={{ padding: 15, background: 'var(--ink2)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '.65rem', color: 'var(--muted)', marginBottom: 10, letterSpacing: 1 }}>ENGINE CONFIG</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '.8rem' }}>Agentic Mode</span>
                  <button 
                    onClick={() => setPipelineMode(prev => prev === 'classic' ? 'agentic' : 'classic')}
                    style={{ 
                      padding: '4px 8px', fontSize: '.6rem', borderRadius: 4, cursor: 'pointer',
                      background: pipelineMode === 'agentic' ? 'var(--amber)' : 'var(--ink3)',
                      color: pipelineMode === 'agentic' ? '#000' : 'var(--muted)'
                    }}
                  >
                    {pipelineMode.toUpperCase()}
                  </button>
                </div>
              </div>

              {auditSummary && <AuditPanel summary={auditSummary} />}
              <RulesPanel />
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}

function StepButton({ index, label, status, onClick }) {
  const isDone = status === 'done'
  const isLoading = status === 'loading'
  const isReady = status === 'ready'
  
  return (
    <button 
      className={`step-btn s-${status}`} 
      onClick={onClick} 
      disabled={status === 'idle' || isLoading}
    >
      {isLoading ? <div className="spinner" /> : <span style={{ color: isDone ? 'var(--green)' : isReady ? 'var(--amber)' : 'inherit' }}>{isDone ? '●' : '○'}</span>}
      <span style={{ flex: 1, textAlign: 'left' }}>{label}</span>
      <span style={{ fontSize: '.6rem', opacity: 0.5 }}>{index}</span>
    </button>
  )
}