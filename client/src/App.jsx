import { useState, useCallback, useEffect } from 'react'
import KeyPanel from './components/KeyPanel.jsx'
import OutputPanel from './components/OutputPanel.jsx'
import AuditPanel from './components/AuditPanel.jsx'
import RulesPanel from './components/RulesPanel.jsx'

/* ─────────────────────────────────────────────────────────────
   GLOBAL STYLES
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

  .autodoc-root::before {
    content: '';
    position: fixed; inset: 0;
    background: repeating-linear-gradient(
      0deg, transparent, transparent 2px,
      rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px
    );
    pointer-events: none; z-index: 100;
  }

  @keyframes blink       { 0%,100%{opacity:1} 50%{opacity:0} }
  @keyframes fadeUp      { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:none} }
  @keyframes amber-pulse { 0%,100%{box-shadow:0 0 0 0 var(--amber-glow)} 50%{box-shadow:0 0 18px 4px var(--amber-glow)} }
  @keyframes spin        { to{transform:rotate(360deg)} }

  .fade-up  { animation: fadeUp 0.45s cubic-bezier(.22,1,.36,1) both }
  .delay-1  { animation-delay: 0.08s }
  .delay-2  { animation-delay: 0.16s }
  .delay-3  { animation-delay: 0.24s }

  .autodoc-root ::-webkit-scrollbar       { width:4px; height:4px }
  .autodoc-root ::-webkit-scrollbar-track  { background: var(--ink2) }
  .autodoc-root ::-webkit-scrollbar-thumb  { background: var(--muted2); border-radius:2px }

  .ad-input {
    width:100%; padding:11px 14px;
    background:var(--ink3); border:1px solid var(--border2);
    border-radius:6px; color:var(--text);
    font-family:var(--font-mono); font-size:.82rem;
    outline:none; transition:border-color .2s, box-shadow .2s;
  }
  .ad-input:focus {
    border-color:var(--amber);
    box-shadow:0 0 0 3px var(--amber-dim);
  }
  .ad-input::placeholder { color: var(--muted2) }
  .ad-input:disabled     { opacity:.45; cursor:not-allowed }

  .prov-card {
    padding:14px 16px; border-radius:8px;
    border:1px solid var(--border2); background:var(--ink2);
    cursor:pointer; transition:all .2s; text-align:left;
    position:relative; overflow:hidden;
  }
  .prov-card:hover { background:var(--ink3) }
  .prov-card.active-groq {
    border-color:rgba(91,164,245,.5); background:rgba(91,164,245,.07);
    box-shadow:0 0 20px rgba(91,164,245,.12);
  }
  .prov-card.active-ollama {
    border-color:rgba(61,220,132,.5); background:var(--green-dim);
    box-shadow:0 0 20px rgba(61,220,132,.12);
  }

  .step-btn {
    display:flex; align-items:center; gap:10px;
    padding:12px 16px; border-radius:8px;
    border:1px solid var(--border); background:var(--ink2);
    cursor:pointer; transition:all .18s; width:100%;
    font-family:var(--font-mono); font-size:.8rem;
    color:var(--muted); position:relative; overflow:hidden;
  }
  .step-btn::before {
    content:''; position:absolute; left:0; top:0; bottom:0;
    width:3px; background:transparent; transition:background .2s;
  }
  .step-btn.s-ready  { color:var(--text); border-color:var(--border2); background:var(--ink3) }
  .step-btn.s-ready::before  { background:var(--amber) }
  .step-btn.s-ready:hover    { border-color:var(--amber); box-shadow:0 0 16px var(--amber-dim) }
  .step-btn.s-done   { color:var(--green); border-color:rgba(61,220,132,.25); background:var(--green-dim) }
  .step-btn.s-done::before   { background:var(--green) }
  .step-btn.s-loading{ cursor:not-allowed; opacity:.7 }
  .step-btn:disabled { cursor:not-allowed }

  .toggle-track {
    width:38px; height:20px; border-radius:10px;
    background:var(--ink3); border:1px solid var(--border2);
    position:relative; cursor:pointer; transition:all .2s; flex-shrink:0;
  }
  .toggle-track.on {
    background:var(--amber); border-color:var(--amber);
    box-shadow:0 0 10px var(--amber-dim);
  }
  .toggle-thumb {
    position:absolute; top:2px; left:2px;
    width:14px; height:14px; border-radius:50%;
    background:#fff; transition:transform .2s;
    box-shadow:0 1px 3px rgba(0,0,0,.4);
  }
  .toggle-track.on .toggle-thumb { transform:translateX(18px) }

  .status-pill {
    display:inline-flex; align-items:center; gap:6px;
    padding:3px 10px; border-radius:99px; font-size:.68rem;
    font-family:var(--font-mono); letter-spacing:.5px;
  }
  .status-pill.ok   { background:var(--green-dim); color:var(--green); border:1px solid rgba(61,220,132,.2) }
  .status-pill.warn { background:rgba(245,166,35,.1); color:var(--amber); border:1px solid rgba(245,166,35,.2) }
  .status-pill.err  { background:rgba(255,95,109,.1); color:var(--red);   border:1px solid rgba(255,95,109,.2) }
  .status-pill.info { background:rgba(91,164,245,.1); color:var(--blue);  border:1px solid rgba(91,164,245,.2) }

  .settings-drawer { margin-top:1.25rem; animation:fadeUp .3s cubic-bezier(.22,1,.36,1) both }

  .spinner {
    width:14px; height:14px; border-radius:50%;
    border:2px solid var(--border2); border-top-color:var(--amber);
    animation:spin .7s linear infinite; flex-shrink:0;
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
   SMALL COMPONENTS
───────────────────────────────────────────────────────────── */
function Cursor() {
  return (
    <span style={{
      display:'inline-block', width:8, height:14,
      background:'var(--amber)', marginLeft:3, verticalAlign:'middle',
      animation:'blink 1.1s step-end infinite',
    }} />
  )
}

function SectionLabel({ children, style = {} }) {
  return (
    <div style={{
      fontSize:'.62rem', color:'var(--muted)', letterSpacing:'2.5px',
      textTransform:'uppercase', fontFamily:'var(--font-disp)',
      marginBottom:10, display:'flex', alignItems:'center', gap:8, ...style,
    }}>
      <span style={{ color:'var(--amber)', opacity:.7 }}>›</span>
      {children}
    </div>
  )
}

function Divider() {
  return (
    <div style={{
      height:1, margin:'1.5rem 0',
      background:'linear-gradient(90deg, var(--amber-dim), transparent 70%)',
    }} />
  )
}

function StepButton({ index, label, desc, status, onClick, disabled }) {
  const cls = `step-btn s-${status}`
  return (
    <button className={cls} onClick={onClick} disabled={disabled || status === 'idle'}>
      {status === 'loading'
        ? <span className="spinner" />
        : (
          <span style={{
            fontFamily:'var(--font-disp)', fontSize:'.75rem', flexShrink:0,
            color: status === 'done' ? 'var(--green)' : status === 'ready' ? 'var(--amber)' : 'var(--muted2)',
          }}>
            {status === 'done' ? '●' : status === 'ready' ? '◉' : '○'}
          </span>
        )
      }
      <div style={{ flex:1, textAlign:'left' }}>
        <div style={{ fontSize:'.8rem' }}>
          <span style={{ color:'var(--muted2)', marginRight:8, fontFamily:'var(--font-disp)' }}>
            {String(index).padStart(2,'0')}
          </span>
          {label}
        </div>
        {desc && <div style={{ fontSize:'.68rem', color:'var(--muted2)', marginTop:2 }}>{desc}</div>}
      </div>
      {status === 'done'  && <span style={{ fontSize:'.62rem', color:'var(--green)',  fontFamily:'var(--font-disp)' }}>done</span>}
      {status === 'ready' && <span style={{ fontSize:'.62rem', color:'var(--amber)',  fontFamily:'var(--font-disp)' }}>run ↵</span>}
    </button>
  )
}

function ASTToggle({ useAST, setUseAST, disabled }) {
  return (
    <div style={{
      display:'flex', alignItems:'center', gap:14, padding:'11px 14px',
      background:'var(--ink2)', border:'1px solid var(--border)', borderRadius:8,
    }}>
      <button
        className={`toggle-track${useAST ? ' on' : ''}`}
        onClick={() => !disabled && setUseAST(!useAST)}
        disabled={disabled}
      >
        <div className="toggle-thumb" />
      </button>
      <div style={{ flex:1 }}>
        <div style={{ fontSize:'.82rem', display:'flex', alignItems:'center', gap:8 }}>
          AST mode
          <span style={{
            fontSize:'.6rem', padding:'1px 7px', borderRadius:99,
            fontFamily:'var(--font-disp)',
            background: useAST ? 'var(--amber-dim)' : 'var(--ink3)',
            color:      useAST ? 'var(--amber)'      : 'var(--muted)',
            border:     `1px solid ${useAST ? 'rgba(245,166,35,.3)' : 'var(--border2)'}`,
            transition:'all .2s',
          }}>
            {useAST ? 'ACTIVE' : 'OFF'}
          </span>
        </div>
        <div style={{ fontSize:'.7rem', color:'var(--muted)', marginTop:3 }}>
          {useAST
            ? 'Parses code into AST — leaner context, sharper output'
            : 'Sends raw file content directly to the model'}
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────
   MAIN APP
───────────────────────────────────────────────────────────── */
export default function App() {
  injectStyles()

  const [apiKey,        setApiKey]        = useState('')
  const [githubUrl,     setGithubUrl]     = useState('')
  const [useAST,        setUseAST]        = useState(true)
  const [provider,      setProvider]      = useState('groq')
  const [raw,           setRaw]           = useState(null)
  const [messages,      setMessages]      = useState(null)
  const [output,        setOutput]        = useState('// ready — paste a GitHub URL to begin')
  const [loading,       setLoading]       = useState(false)
  const [loadingStep,   setLoadingStep]   = useState(null)
  const [loadingMsg,    setLoadingMsg]    = useState('')
  const [error,         setError]         = useState(null)
  const [tab,           setTab]           = useState('raw')
  const [mode,          setMode]          = useState(null)
  const [auditSummary,  setAuditSummary]  = useState(null)
  const [pipeline,      setPipeline]      = useState({ fetch:false, build:false, generate:false })
  const [showSettings,  setShowSettings]  = useState(false)
  const [, setTick]                       = useState(0)

  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 1000)
    return () => clearInterval(t)
  }, [])

  const now = new Date()
  const ts  = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`

  const authHeaders = useCallback(() => {
    const h = { 'Content-Type':'application/json' }
    if (apiKey) h['x-api-key'] = apiKey
    h['x-provider'] = provider
    return h
  }, [apiKey, provider])

  // ── Step 1 ──────────────────────────────────────────────────
  const fetchRepo = useCallback(async () => {
    if (!githubUrl)                        { setError('Enter a GitHub URL'); return }
    if (!githubUrl.includes('github.com')) { setError('URL must be from github.com'); return }

    setError(null); setLoading(true); setLoadingStep('fetch')
    setLoadingMsg('fetching repository…')
    setOutput('// fetching…'); setRaw(null); setMessages(null)
    setMode(null); setAuditSummary(null)
    setPipeline({ fetch:false, build:false, generate:false })

    try {
      const res  = await fetch('/fetch', { method:'POST', headers:authHeaders(), body:JSON.stringify({ githubUrl }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Fetch failed')
      setRaw(data.rawMarkdown)
      setOutput(`// ✓ fetch complete\n// size: ${data.size} chars\n\n${data.preview}`)
      setPipeline(s => ({ ...s, fetch:true }))
    } catch (err) {
      setError(err.message)
      setOutput('// ✗ fetch failed')
    } finally {
      setLoading(false); setLoadingStep(null)
    }
  }, [githubUrl, authHeaders])

  // ── Step 2 ──────────────────────────────────────────────────
  const buildInput = useCallback(async () => {
    if (!raw) { setError('Run fetch first'); return }

    setError(null); setLoading(true); setLoadingStep('build')
    setLoadingMsg(`building ${useAST ? 'AST' : 'raw'} input…`)
    setOutput('// building…'); setMessages(null)

    try {
      const res  = await fetch('/build', { method:'POST', headers:authHeaders(), body:JSON.stringify({ rawMarkdown:raw, useAST }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Build failed')
      setMessages(data.messages)
      setMode(data.mode)
      setAuditSummary(data.auditSummary)
      const a = data.auditSummary
      const auditLine = a.totalRedacted > 0
        ? `// ⚠  ${a.totalRedacted} secret(s) redacted in ${a.filesAffected} file(s)`
        : '// ✓ no secrets detected'
      setOutput(`// ✓ build complete  [mode: ${data.mode}]\n// scanned: ${a.filesScanned} files\n${auditLine}`)
      setPipeline(s => ({ ...s, build:true }))
    } catch (err) {
      setError(err.message)
      setOutput('// ✗ build failed')
    } finally {
      setLoading(false); setLoadingStep(null)
    }
  }, [raw, useAST, authHeaders])

  // ── Step 3 ──────────────────────────────────────────────────
  const generateDocs = useCallback(async () => {
    if (!messages) { setError('Run build first'); return }

    setError(null); setLoading(true); setLoadingStep('generate')
    setLoadingMsg(provider === 'ollama' ? 'running phi3 locally…' : 'calling groq…')
    setOutput('// generating documentation…')

    try {
      const res  = await fetch('/generate-docs', { method:'POST', headers:authHeaders(), body:JSON.stringify({ messages }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Generation failed')
      setOutput(data.documentation)
      setPipeline(s => ({ ...s, generate:true }))
      setTab('rendered')
    } catch (err) {
      setError(err.message)
      setOutput('// ✗ generation failed')
    } finally {
      setLoading(false); setLoadingStep(null)
    }
  }, [messages, authHeaders, provider])

  // ── Compute step statuses ────────────────────────────────────
  const stepStatus = (key, readyCond) => {
    if (loadingStep === key) return 'loading'
    if (pipeline[key])       return 'done'
    if (readyCond)           return 'ready'
    return 'idle'
  }
  const fetchStatus    = stepStatus('fetch',    true)
  const buildStatus    = stepStatus('build',    !!raw)
  const generateStatus = stepStatus('generate', !!messages)

  const auditOk   = auditSummary && auditSummary.totalRedacted === 0
  const auditWarn = auditSummary && auditSummary.totalRedacted > 0

  return (
    <div className="autodoc-root">
      <div style={{ maxWidth:880, margin:'0 auto', padding:'2rem 1.25rem' }}>

        {/* ── Header ─────────────────────────────────────────── */}
        <header className="fade-up" style={{ marginBottom:'2.5rem' }}>
          {/* top bar */}
          <div style={{
            display:'flex', alignItems:'center', justifyContent:'space-between',
            marginBottom:'2rem', paddingBottom:'1rem',
            borderBottom:'1px solid var(--border)',
          }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <span style={{ fontFamily:'var(--font-disp)', fontSize:'.7rem', color:'var(--amber)', letterSpacing:2 }}>
                AUTODOC
              </span>
              <span style={{
                fontSize:'.58rem', padding:'2px 7px', borderRadius:3,
                background:'var(--amber-dim)', color:'var(--amber)',
                border:'1px solid rgba(245,166,35,.25)', fontFamily:'var(--font-disp)',
              }}>
                v0.4
              </span>
            </div>
            <div style={{
              fontFamily:'var(--font-disp)', fontSize:'.62rem', color:'var(--muted)',
              letterSpacing:1, display:'flex', alignItems:'center', gap:14,
            }}>
              <span style={{ color:'var(--muted2)' }}>sys</span>
              <span style={{ color:'var(--green)', display:'flex', alignItems:'center', gap:5 }}>
                <span style={{
                  width:5, height:5, borderRadius:'50%', background:'var(--green)',
                  display:'inline-block',
                }} />
                online
              </span>
              <span>{ts}</span>
            </div>
          </div>

          {/* title block */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:24, alignItems:'end' }}>
            <div>
              <div style={{
                fontFamily:'var(--font-disp)', fontSize:'.65rem', color:'var(--muted)',
                letterSpacing:'3px', marginBottom:14,
              }}>
                REPOSITORY DOCUMENTATION GENERATOR
              </div>
              <h1 style={{
                fontFamily:'var(--font-head)', fontSize:'clamp(2rem,5vw,3.2rem)',
                fontWeight:800, lineHeight:1.05, letterSpacing:'-0.03em', color:'var(--text)',
              }}>
                Auto<span style={{ color:'var(--amber)' }}>Doc</span>
                <Cursor />
              </h1>
              <p style={{
                fontFamily:'var(--font-mono)', fontSize:'.78rem',
                color:'var(--muted)', marginTop:10, lineHeight:1.6,
              }}>
                Fetch any GitHub repository · sanitize secrets · generate structured docs
              </p>
            </div>

            {/* Pipeline status indicator */}
            <div style={{
              display:'flex', flexDirection:'column', gap:7, alignItems:'flex-end',
              fontFamily:'var(--font-disp)', fontSize:'.62rem',
            }}>
              {[
                { key:'fetch',    label:'01 fetch'    },
                { key:'build',    label:'02 build'    },
                { key:'generate', label:'03 generate' },
              ].map(s => (
                <div key={s.key} style={{
                  display:'flex', alignItems:'center', gap:7,
                  color: pipeline[s.key]        ? 'var(--green)'
                       : loadingStep === s.key  ? 'var(--amber)'
                       : 'var(--muted2)',
                }}>
                  {s.label}
                  <span style={{
                    width:6, height:6, borderRadius:'50%', flexShrink:0,
                    background: pipeline[s.key]       ? 'var(--green)'
                               : loadingStep === s.key ? 'var(--amber)'
                               : 'var(--muted2)',
                    animation: loadingStep === s.key ? 'amber-pulse 1.5s ease infinite' : 'none',
                  }} />
                </div>
              ))}
            </div>
          </div>
        </header>

        {/* ── Body grid ──────────────────────────────────────── */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1.25rem', alignItems:'start' }}>

          {/* LEFT COLUMN */}
          <div style={{ display:'flex', flexDirection:'column', gap:'1.25rem' }}>

            {/* Provider */}
            <div className="fade-up delay-1" style={{
              background:'var(--ink2)', border:'1px solid var(--border)', borderRadius:10, padding:'1.25rem',
            }}>
              <SectionLabel>Provider</SectionLabel>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                {[
                  { id:'groq',   label:'Groq',   sub:'cloud API',  color:'var(--blue)',  activeClass:'active-groq',   icon:'⌁' },
                  { id:'ollama', label:'Ollama',  sub:'local phi3', color:'var(--green)', activeClass:'active-ollama', icon:'⊡' },
                ].map(p => (
                  <button
                    key={p.id}
                    className={`prov-card${provider === p.id ? ` ${p.activeClass}` : ''}`}
                    onClick={() => !loading && setProvider(p.id)}
                    disabled={loading}
                  >
                    <div style={{
                      fontFamily:'var(--font-disp)', fontSize:'1.2rem',
                      color: provider === p.id ? p.color : 'var(--muted)',
                      marginBottom:8, transition:'color .2s',
                    }}>
                      {p.icon}
                    </div>
                    <div style={{
                      fontSize:'.82rem', fontFamily:'var(--font-head)', fontWeight:600,
                      color: provider === p.id ? p.color : 'var(--text)', transition:'color .2s',
                    }}>
                      {p.label}
                    </div>
                    <div style={{ fontSize:'.68rem', color:'var(--muted)', marginTop:3 }}>{p.sub}</div>
                    {provider === p.id && (
                      <div style={{
                        position:'absolute', top:8, right:8, fontSize:'.55rem',
                        padding:'1px 6px', borderRadius:3, color:p.color,
                        border:`1px solid ${p.color}`, fontFamily:'var(--font-disp)', opacity:.8,
                      }}>
                        SEL
                      </div>
                    )}
                  </button>
                ))}
              </div>

              {provider === 'groq' && (
                <div style={{ marginTop:'1rem', animation:'fadeUp .25s both' }}>
                  <KeyPanel apiKey={apiKey} setApiKey={setApiKey} />
                </div>
              )}
              {provider === 'ollama' && (
                <div style={{
                  marginTop:'1rem', padding:'10px 12px',
                  background:'var(--green-dim)', border:'1px solid rgba(61,220,132,.15)',
                  borderRadius:6, animation:'fadeUp .25s both',
                }}>
                  <div style={{ fontSize:'.72rem', color:'var(--green)', marginBottom:4 }}>
                    ● running locally — no key needed
                  </div>
                  <code style={{ fontSize:'.68rem', color:'var(--muted)' }}>$ ollama serve</code>
                </div>
              )}
            </div>

            {/* URL + AST */}
            <div className="fade-up delay-2" style={{
              background:'var(--ink2)', border:'1px solid var(--border)', borderRadius:10, padding:'1.25rem',
            }}>
              <SectionLabel>Repository</SectionLabel>
              <div style={{ position:'relative', marginBottom:'1rem' }}>
                <span style={{
                  position:'absolute', left:12, top:'50%', transform:'translateY(-50%)',
                  fontSize:'.75rem', color:'var(--muted)', fontFamily:'var(--font-disp)', pointerEvents:'none',
                }}>
                  $
                </span>
                <input
                  type="url"
                  className="ad-input"
                  value={githubUrl}
                  onChange={e => setGithubUrl(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !loading && fetchRepo()}
                  placeholder="github.com/user/repo"
                  disabled={loading}
                  style={{ paddingLeft:28 }}
                />
              </div>
              <ASTToggle useAST={useAST} setUseAST={val => { setUseAST(val); if (raw) setMessages(null) }} disabled={loading} />
            </div>

            {/* Audit result */}
            {auditSummary && (
              <div className="fade-up" style={{
                background:'var(--ink2)',
                border:`1px solid ${auditOk ? 'rgba(61,220,132,.2)' : 'rgba(245,166,35,.2)'}`,
                borderRadius:10, padding:'1rem 1.25rem',
              }}>
                <SectionLabel>Security scan</SectionLabel>
                <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                  <span className="status-pill ok">{auditSummary.filesScanned} files scanned</span>
                  {auditOk   && <span className="status-pill ok">✓ no secrets</span>}
                  {auditWarn && <span className="status-pill warn">⚠ {auditSummary.totalRedacted} redacted</span>}
                  {mode      && <span className="status-pill info">mode: {mode}</span>}
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div style={{
                padding:'10px 14px', borderRadius:8,
                background:'rgba(255,95,109,.07)', border:'1px solid rgba(255,95,109,.2)',
                fontSize:'.76rem', color:'var(--red)', fontFamily:'var(--font-mono)',
              }}>
                ✗ {error}
              </div>
            )}

            {/* Loading */}
            {loading && (
              <div style={{
                display:'flex', alignItems:'center', gap:10, padding:'10px 14px', borderRadius:8,
                background:'var(--amber-dim)', border:'1px solid rgba(245,166,35,.2)',
                fontSize:'.76rem', color:'var(--amber)', fontFamily:'var(--font-mono)',
              }}>
                <span className="spinner" />
                {loadingMsg}
              </div>
            )}
          </div>

          {/* RIGHT COLUMN */}
          <div style={{ display:'flex', flexDirection:'column', gap:'1.25rem' }}>

            {/* Pipeline */}
            <div className="fade-up delay-2" style={{
              background:'var(--ink2)', border:'1px solid var(--border)', borderRadius:10, padding:'1.25rem',
            }}>
              <SectionLabel>Pipeline</SectionLabel>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                <StepButton
                  index={1} label="fetch repo"
                  desc="clone repository tree via Octokit"
                  status={fetchStatus} onClick={fetchRepo} disabled={loading}
                />
                <StepButton
                  index={2} label="build input"
                  desc={`prepare ${useAST ? 'AST-parsed' : 'raw'} context for LLM`}
                  status={buildStatus} onClick={buildInput} disabled={loading}
                />
                <StepButton
                  index={3} label="generate docs"
                  desc={`write docs via ${provider === 'groq' ? 'Groq API' : 'local Ollama'}`}
                  status={generateStatus} onClick={generateDocs} disabled={loading}
                />
              </div>
            </div>

            {/* Output */}
            <div className="fade-up delay-3" style={{
              background:'var(--ink2)', border:'1px solid var(--border)',
              borderRadius:10, padding:'1.25rem', flex:1,
            }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
                <SectionLabel style={{ marginBottom:0 }}>Output</SectionLabel>
                <div style={{ display:'flex', gap:4 }}>
                  {['raw','rendered'].map(t => (
                    <button
                      key={t}
                      onClick={() => setTab(t)}
                      style={{
                        padding:'3px 10px', borderRadius:5,
                        border:`1px solid ${tab === t ? 'var(--border2)' : 'var(--border)'}`,
                        background: tab === t ? 'var(--ink3)' : 'transparent',
                        color: tab === t ? 'var(--text)' : 'var(--muted)',
                        fontFamily:'var(--font-disp)', fontSize:'.62rem',
                        cursor:'pointer', transition:'all .15s', letterSpacing:1,
                      }}
                    >
                      {t.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              <OutputPanel output={output} tab={tab} setTab={setTab} />
            </div>

            {/* Settings toggle */}
            <div style={{ display:'flex', justifyContent:'flex-end' }}>
              <button
                onClick={() => setShowSettings(s => !s)}
                style={{
                  fontFamily:'var(--font-disp)', fontSize:'.62rem',
                  color: showSettings ? 'var(--amber)' : 'var(--muted)',
                  background:'transparent', border:'none', cursor:'pointer',
                  letterSpacing:'1.5px', display:'flex', alignItems:'center', gap:6,
                  padding:'4px 0', transition:'color .2s',
                }}
              >
                <span>{showSettings ? '▾' : '▸'}</span>
                {showSettings ? 'HIDE SETTINGS' : 'AUDIT & RULES'}
              </button>
            </div>
          </div>
        </div>

        {/* ── Settings drawer ─────────────────────────────────── */}
        {showSettings && (
          <div className="settings-drawer">
            <Divider />
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1.25rem' }}>
              <AuditPanel apiKey={apiKey} />
              <RulesPanel apiKey={apiKey} />
            </div>
          </div>
        )}

        {/* ── Footer ─────────────────────────────────────────── */}
        <footer style={{
          marginTop:'2.5rem', paddingTop:'1rem',
          borderTop:'1px solid var(--border)',
          display:'flex', alignItems:'center', justifyContent:'space-between',
          fontFamily:'var(--font-disp)', fontSize:'.6rem', color:'var(--muted2)', letterSpacing:'1px',
        }}>
          <span>AUTODOC · end-of-study project</span>
          <span style={{ color: pipeline.generate ? 'var(--green)' : 'var(--muted2)' }}>
            {pipeline.generate ? '✓ pipeline complete' : 'pipeline idle'}
          </span>
        </footer>

      </div>
    </div>
  )
}