import { useState, useRef, useEffect } from 'react'
import DocViewer from './components/DocViewer'
import AuditPanel from './components/AuditPanel'
import './App.css'

function Navbar() {
  return (
    <nav className="navbar">
      <div className="container navbar-inner">
        <a href="#" className="navbar-logo">Auto-Doc</a>
        <ul className="navbar-links">
          <li><a href="#pipeline">Pipeline</a></li>
          <li><a href="#features">Features</a></li>
          <li><a href="https://github.com/eljaouadimazen/Auto-Doc" target="_blank">GitHub</a></li>
        </ul>
      </div>
    </nav>
  )
}

function Pipeline() {
  const [apiKey, setApiKey] = useState('')
  const [keyStatus, setKeyStatus] = useState('not set')
  const [githubUrl, setGithubUrl] = useState('')
  const [useAST, setUseAST] = useState(true)
  const [loadingStep, setLoadingStep] = useState(null)
  const [error, setError] = useState('')
  const [rawMarkdown, setRawMarkdown] = useState('')
  const [messages, setMessages] = useState(null)
  const [output, setOutput] = useState('Ready. Paste a GitHub URL and click Fetch Repo.')
  const [tab, setTab] = useState('raw')
  const [mode, setMode] = useState('')
  const [states, setStates] = useState({ fetch: false, build: false, nature: false, generate: false })
  const [fetchedFiles, setFetchedFiles] = useState(null)
  const [repoName, setRepoName] = useState('')
  const [provider, setProvider] = useState('groq')
  const [pipelineMode, setPipelineMode] = useState('agentic')
  const [sessionId, setSessionId] = useState(null)
  const [projectNature, setProjectNature] = useState(null)
  const [githubPublishToken, setGithubPublishToken] = useState('')
  const [targetRepo, setTargetRepo] = useState('')
  const [publishStatus, setPublishStatus] = useState(null)
  const [publishUrl, setPublishUrl] = useState('')
  const [publishError, setPublishError] = useState('')
  const [wordWrap, setWordWrap] = useState(false)
  const [copyText, setCopyText] = useState('Copy')
  const [auditSummary, setAuditSummary] = useState(null)
  const keyTimer = useRef(null)
  const renderedRef = useRef(null)

  const authHeaders = () => {
    const headers = { 'Content-Type': 'application/json', 'x-provider': provider, 'x-mode': pipelineMode }
    if (apiKey.trim()) headers['x-api-key'] = apiKey.trim()
    return headers
  }

  // Always accepts fresh key as argument to avoid stale closure
  const validateKey = async (keyToValidate) => {
    const key = (keyToValidate ?? apiKey).trim()
    if (!key) { setKeyStatus('not set'); return }
    setKeyStatus('checking')
    try {
      const res = await fetch('/validate-key', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'x-provider': provider
        }
      })
      const data = await res.json()
      setKeyStatus(data.valid ? 'valid' : 'invalid')
    } catch {
      setKeyStatus('invalid')
    }
  }

  // Reset/re-validate when provider changes
  useEffect(() => {
    const needsKey = provider !== 'ollama'
    if (!needsKey) {
      setKeyStatus('not set') // eslint-disable-line react-hooks/set-state-in-effect
      clearTimeout(keyTimer.current)
    } else if (apiKey.trim()) {
      validateKey(apiKey.trim())
    }
  }, [provider]) // eslint-disable-line react-hooks/exhaustive-deps

  // Run Mermaid whenever rendered tab is active or output changes
  useEffect(() => {
    if (tab !== 'rendered' || !renderedRef.current) return

    const timer = setTimeout(async () => {
      if (typeof mermaid === 'undefined') return

      // marked outputs: <pre><code class="language-mermaid">...</code></pre>
      // We need to replace those with <div class="mermaid">...</div>
      const codeBlocks = renderedRef.current.querySelectorAll('pre code.language-mermaid, code.language-mermaid')

      codeBlocks.forEach(codeEl => {
        const pre = codeEl.closest('pre') || codeEl
        const diagram = codeEl.textContent || codeEl.innerText

        const mermaidDiv = document.createElement('div')
        mermaidDiv.className = 'mermaid'
        mermaidDiv.textContent = diagram
        pre.replaceWith(mermaidDiv)
      })

      // Run mermaid on all unprocessed .mermaid divs
      const mermaidDivs = renderedRef.current.querySelectorAll('.mermaid:not([data-processed])')
      if (mermaidDivs.length > 0) {
        for (const div of mermaidDivs) {
          try {
            await mermaid.run({ nodes: [div] })
          } catch (err) {
            console.warn('Mermaid render error:', err)
            const container = div.parentNode
            if (container) {
              container.innerHTML = '<div style="padding:12px;color:#ef4444;font-size:13px;font-family:monospace;text-align:center">⚠ ' + (err.message || 'Diagram syntax error') + '</div>'
            }
          }
        }
      }
    }, 100)

    return () => clearTimeout(timer)
  }, [tab, output])

  const updateLoading = (step, text) => {
    setLoadingStep(step)
    setError('')
    if (step) setOutput(text || 'Working...')
  }

  const fetchRepo = async () => {
    const url = githubUrl.trim()
    if (!url) { setError('Enter a GitHub URL'); return }
    if (!url.includes('github.com')) { setError('Must be a github.com URL'); return }

    updateLoading('fetch', 'Fetching repository...')
    setOutput('Fetching...')
    setPublishStatus(null)
    setPublishUrl('')
    setPublishError('')
    setStates({ fetch: false, build: false, nature: false, generate: false })
    setMessages(null)
    setSessionId(null)
    setFetchedFiles(null)
    setRepoName('')
    setProjectNature(null)

    try {
      const res = await fetch('/fetch', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ githubUrl: url })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Fetch failed')

      setRawMarkdown(data.rawMarkdown)
      setFetchedFiles(data.files)
      setRepoName(data.repoName)
      setTargetRepo(data.repoName || '')
      setAuditSummary(data.auditSummary || null)
      setOutput(`✓ FETCH COMPLETE\n\nSize: ${data.size} chars\n\n--- PREVIEW ---\n\n${data.preview}`)
      setStates(s => ({ ...s, fetch: true }))
      setMode('')
    } catch (err) {
      setError(err.message)
      setOutput('Fetch failed.')
    } finally {
      updateLoading(null)
    }
  }

  const buildInput = async () => {
    if (!rawMarkdown) { setError('Run Fetch Repo first'); return }

    updateLoading('build', `Building ${useAST ? 'AST' : 'raw'} LLM input...`)
    setOutput('Building...')

    try {
      const res = await fetch('/build', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ rawMarkdown, useAST })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Build failed')

      setMessages(data.chunks || data.messages)
      setMode(data.mode)
      setSessionId(data.sessionId || null)
      setAuditSummary(data.auditSummary || null)

      let summary = `✓ BUILD COMPLETE [mode: ${data.mode}]`
      if (data.auditSummary) {
        const a = data.auditSummary
        summary += `\n\nSecurity audit: ${a.filesScanned} files scanned`
        summary += a.totalRedacted > 0
          ? `\n⚠ ${a.totalRedacted} secret(s) redacted in ${a.filesAffected} file(s)`
          : '\n✓ No secrets detected'
      }
      setOutput(summary)
      setStates(s => ({ ...s, build: true }))
    } catch (err) {
      setError(err.message)
      setOutput('Build failed.')
    } finally {
      updateLoading(null)
    }
  }

  const NATURE_OPTIONS = [
    { value: 'BACKEND', label: 'Backend', icon: '⚙️', desc: 'Server-side APIs, microservices, CLI tools' },
    { value: 'FRONTEND', label: 'Frontend', icon: '🎨', desc: 'Web UI, React/Vue/Angular applications' },
    { value: 'FULLSTACK', label: 'Fullstack', icon: '🏗️', desc: 'Combined frontend + backend' },
    { value: 'MOBILE', label: 'Mobile', icon: '📱', desc: 'Mobile/React Native/Flutter apps' },
    { value: 'DEVOPS', label: 'DevOps', icon: '🐳', desc: 'Infrastructure, CI/CD, Docker/K8s' },
    { value: 'LIBRARY', label: 'Library', icon: '📦', desc: 'npm packages, SDKs, shared utilities' },
    { value: 'RESOURCE_LIST', label: 'Resource List', icon: '📋', desc: 'Config files, docs, non-code repos' },
  ]

  const generateDocs = async () => {
    if (pipelineMode === 'agentic') {
      if (!fetchedFiles) { setError('Run Fetch Repo first'); return }
    } else {
      if (!messages) { setError('Run Build Input first'); return }
    }

    updateLoading('generate', 'Calling LLM — this may take 10–20 seconds...')
    setOutput('Generating documentation...')

    try {
      let body = {}
      if (pipelineMode === 'agentic') {
        body = {
          files: fetchedFiles,
          repoName,
          projectNature
        }
      } else if (Array.isArray(messages)) {
        body = { chunks: messages, sessionId }
      } else {
        body = { messages }
      }

      const res = await fetch('/generate-docs', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(body)
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Generation failed')

      setOutput(data.documentation)
      setStates(s => ({ ...s, generate: true }))
      setTab('rendered')
    } catch (err) {
      setError(err.message)
      setOutput('Generation failed.')
    } finally {
      updateLoading(null)
    }
  }

  const publishDocs = async () => {
    const token = githubPublishToken.trim()
    const repo = targetRepo.trim()
    if (!repo || !repo.includes('/')) { setPublishError('Enter a valid target repo (owner/repo)'); return }
    if (!token) { setPublishError('Enter a GitHub token with repo scope'); return }

    setPublishStatus('publishing')
    setPublishUrl('')
    setPublishError('')

    try {
      const res = await fetch('/publish', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          documentation: output,
          repoName,
          targetRepo: repo,
          githubToken: token
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Publish failed')

      setPublishStatus('success')
      setPublishUrl(data.url)
    } catch (err) {
      setPublishStatus('error')
      setPublishUrl(err.message)
    }
  }

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(output)
      setCopyText('Copied!')
      setTimeout(() => setCopyText('Copy'), 2000)
    } catch { setCopyText('Failed') }
  }

  const downloadOutput = () => {
    const blob = new Blob([output], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${repoName || 'docs'}.md`
    a.click(); URL.revokeObjectURL(url)
  }

  const toggleAST = () => {
    setUseAST(!useAST)
    setMessages(null)
    setSessionId(null)
    setStates(s => ({ ...s, build: false, nature: false, generate: false }))
  }

  const renderMarkdown = (text) => {
    try {
      if (typeof marked !== 'undefined') return marked.parse(text)
      return text
    } catch {
      return text
    }
  }

  const stateClass = (step) => states[step] ? 'state-done' : 'state-pending'

  const getStepState = (stepId) => {
    if (loadingStep === stepId) return 'active'
    if (states[stepId]) return 'done'
    if (stepId === 'fetch') return 'available'
    if (stepId === 'build' && !states.fetch) return 'pending'
    if (stepId === 'generate' && (!states.build || !states.nature)) return 'pending'
    return 'available'
  }

  const STEPS = [
    { id: 'fetch', label: 'Fetch & Sanitize', emoji: '⬇️', desc: 'Clone, sanitize & audit secrets' },
    { id: 'build', label: 'Build LLM Input', emoji: '🔨', desc: 'Parse AST & build context' },
    { id: 'generate', label: 'Generate Docs', emoji: '📄', desc: 'Generate documentation' },
  ]

  const getKeyBadgeClass = () => {
    if (keyStatus === 'not set') return 'key-badge key-not-set'
    if (keyStatus === 'checking') return 'key-badge key-checking'
    if (keyStatus === 'valid') return 'key-badge key-valid'
    return 'key-badge key-invalid'
  }

  return (
    <>
      <section className="hero-section">
        <div className="container">
          <p className="hero-label">Automated Documentation Pipeline</p>
          <h1 className="hero-title">
            Turn your source code<br />into living documentation
          </h1>
          <p className="hero-subtitle">
            Auto-Doc parses your GitHub repository through an agentic multi-agent pipeline —
            fetching, sanitizing, and generating accurate docs powered by LLMs.
          </p>
        </div>
      </section>

      <section id="pipeline" className="section">
        <div className="container">
          <div className="section-header">
            <p className="section-label">Pipeline</p>
            <h2 className="section-title">Generate docs in 3 steps</h2>
          </div>

          <div className="pipeline-card pipeline-main">
            {/* Provider & Mode Selection */}
            <div className="mb-6 p-4 pipeline-settings">
              <div className="settings-row">
                <div className="setting-group">
                  <label className="setting-label">LLM Provider</label>
                  <select
                    value={provider}
                    onChange={e => setProvider(e.target.value)}
                    className="provider-select">
                    <option value="groq">Groq (fast, free tier)</option>
                    <option value="ollama">Ollama (local, fully free)</option>
                    <option value="gemini">Gemini (free tier)</option>
                    <option value="openrouter">OpenRouter (many models)</option>
                  </select>
                </div>
                <div className="setting-group">
                  <label className="setting-label">Pipeline Mode</label>
                  <div className="setting-options">
                    <button
                      onClick={() => setPipelineMode('agentic')}
                      className={`setting-btn ${pipelineMode === 'agentic' ? 'setting-btn-active' : ''}`}>
                      🧠 Agentic
                    </button>
                    <button
                      onClick={() => setPipelineMode('classic')}
                      className={`setting-btn ${pipelineMode === 'classic' ? 'setting-btn-active' : ''}`}>
                      📄 Classic
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Key Input */}
            <div className="mb-6 p-4 pipeline-key-input">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold font-mono">
                    {provider === 'groq' ? '🔑 Groq API Key'
                     : provider === 'gemini' ? '🔑 Gemini API Key'
                     : provider === 'openrouter' ? '🔑 OpenRouter API Key'
                     : '🦙 Ollama (Local)'}
                  </span>
                  <span className={getKeyBadgeClass()}>
                    {keyStatus}
                  </span>
                </div>
                {provider === 'groq' && (
                  <a href="https://console.groq.com/keys" target="_blank"
                    className="text-xs text-orange underline font-mono">
                    Get free key ↗
                  </a>
                )}
                {provider === 'gemini' && (
                  <a href="https://aistudio.google.com/apikey" target="_blank"
                    className="text-xs text-orange underline font-mono">
                    Get free key ↗
                  </a>
                )}
                {provider === 'openrouter' && (
                  <a href="https://openrouter.ai/keys" target="_blank"
                    className="text-xs text-orange underline font-mono">
                    Get key ↗
                  </a>
                )}
                {provider === 'ollama' && (
                  <span className="text-xs text-warm-gray font-mono">
                    Ensure ollama serve is running
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  id="apiKey"
                  type="password"
                  value={apiKey}
                  onChange={e => {
                    const val = e.target.value
                    setApiKey(val)
                    clearTimeout(keyTimer.current)
                    if (!val.trim()) {
                      setKeyStatus('not set')
                      return
                    }
                    setKeyStatus('checking')
                    keyTimer.current = setTimeout(() => validateKey(val), 800)
                  }}
                  placeholder={
                    provider === 'groq' ? 'gsk_... (pasted directly to Groq, not stored)'
                    : provider === 'gemini' ? 'AIza... (pasted directly to Google, not stored)'
                    : provider === 'openrouter' ? 'sk-or-... (pasted directly to OpenRouter, not stored)'
                    : 'Not required for Ollama'
                  }
                  disabled={provider === 'ollama'}
                  className="flex-1 px-3 py-2 rounded-lg input-field font-mono text-xs"
                />
                <button onClick={() => {
                  const input = document.getElementById('apiKey')
                  if (input) input.type = input.type === 'password' ? 'text' : 'password'
                }} className="btn-dark px-3 py-2 text-xs">👁</button>
              </div>
            </div>

            {/* URL Input */}
            <div className="mb-4">
              <label className="block text-xs text-warm-gray font-mono mb-1.5 uppercase tracking-widest">GitHub Repository URL</label>
              <input
                type="url"
                value={githubUrl}
                onChange={e => setGithubUrl(e.target.value)}
                className="w-full px-4 py-3 rounded-lg input-field font-mono text-sm"
                placeholder="https://github.com/username/repository"
              />
            </div>

            {/* AST Toggle */}
            <div className="flex items-center gap-3 mb-6 p-3 ast-toggle">
              <button
                onClick={toggleAST}
                className={`relative w-11 h-6 rounded-full transition-colors ${useAST ? 'bg-orange' : 'bg-sand'} focus:outline-none`}>
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${useAST ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
              <div>
                <div className="text-sm font-medium text-near-black">
                  AST Mode
                  <span className={`text-xs ml-1 px-2 py-0.5 rounded-full font-mono ${useAST ? 'bg-off-white text-near-black border border-sand' : 'bg-light-sand text-warm-gray border border-sand'}`}>
                    {useAST ? 'ON' : 'OFF'}
                  </span>
                </div>
                <div className="text-xs text-warm-gray mt-0.5">
                  {useAST ? 'Extracts code structure — fewer tokens, smarter docs' : 'Raw truncation mode'}
                </div>
              </div>
            </div>

            {/* Nature Selection */}
            <div className="nature-panel">
              <div className="nature-panel-header">
                <div className="nature-panel-icon">🧬</div>
                <div>
                  <div className="nature-panel-title">Project Nature</div>
                  <div className="nature-panel-subtitle">Select your project type</div>
                </div>
                {states.nature && (
                  <span className="nature-status-badge nature-status-done">✓ Configured</span>
                )}
                {!states.nature && fetchedFiles && (
                  <span className="nature-status-badge nature-status-pending">Needs confirmation</span>
                )}
              </div>

              {!fetchedFiles && !states.nature && (
                <div className="nature-panel-body nature-panel-idle">
                  Fetch a repository, then select a project type below
                </div>
              )}

              {fetchedFiles && !states.nature && (
                <div className="nature-panel-body">
                  <div className="nature-card-grid">
                    {NATURE_OPTIONS.map(opt => {
                      const selected = projectNature === opt.value
                      return (
                        <button
                          key={opt.value}
                          onClick={() => setProjectNature(opt.value)}
                          className={`nature-card ${selected ? 'nature-card-selected' : ''}`}
                        >
                          <span className="nature-card-icon">{opt.icon}</span>
                          <span className="nature-card-label">{opt.label}</span>
                          <span className="nature-card-desc">{opt.desc}</span>
                          <span className={`nature-card-radio ${selected ? 'radio-selected' : ''}`} />
                        </button>
                      )
                    })}
                  </div>
                  <div className="nature-confirm-row">
                    <span className="text-xs text-warm-gray font-mono">{projectNature}</span>
                    <button
                      onClick={() => setStates(s => ({ ...s, nature: true }))}
                      className="nature-confirm-btn">
                      Confirm
                    </button>
                  </div>
                </div>
              )}

              {states.nature && (
                <div className="nature-panel-body">
                  <div className="nature-detected-row">
                    <div className="nature-badge-group">
                      <span className="nature-badge nature-badge-done">✓ {projectNature}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Progress Bar */}
            <div className="progress-track">
              {STEPS.map(step => {
                const state = getStepState(step.id)
                return <div key={step.id} className={`progress-step progress-${state}`} />
              })}
            </div>

            {/* Steps */}
            <div className="grid grid-cols-3 gap-3 mb-6">
              {STEPS.map(step => {
                const state = getStepState(step.id)
                return (
                  <div key={step.id} className={`step-card step-${state}`}>
                    <div className="step-header">
                      <span className={`step-indicator`}>
                        {state === 'done' ? '✓' : step.emoji}
                      </span>
                      <div className="step-info">
                        <div className="step-label">{step.label}</div>
                        <div className="step-desc">{step.desc}</div>
                      </div>
                    </div>
                    <button
                      disabled={state === 'pending' || state === 'done' || (loadingStep && loadingStep !== step.id)}
                      onClick={
                        step.id === 'fetch' ? fetchRepo :
                        step.id === 'build' ? buildInput : generateDocs
                      }
                      className={`btn w-full py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                        state === 'active'
                          ? 'btn-active'
                          : state === 'done'
                            ? 'btn-done'
                            : state === 'pending'
                              ? 'btn-pending'
                              : 'btn-dark'
                      }`}>
                      {state === 'active' ? 'Working' : state === 'done' ? 'Done' : step.label}
                    </button>
                  </div>
                )
              })}
            </div>
            {error && (
              <div className="bg-orange-light border border-orange text-near-black text-sm px-4 py-3 rounded-lg mb-4 font-mono">
                ⚠ {error}
              </div>
            )}
            {mode && (
              <div className="mb-3">
                <span className={`text-xs font-mono px-3 py-1 rounded-full ${mode === 'ast' ? 'bg-off-white text-near-black border border-sand' : 'bg-light-sand text-warm-gray border border-sand'}`}>
                  {mode === 'ast' ? '⚡ AST mode' : '📄 Raw mode'}
                </span>
              </div>
            )}

            {/* Output Tabs */}
            <div className="flex gap-2 mb-2">
              <button onClick={() => setTab('raw')}
                className={`text-xs px-3 py-1.5 rounded-lg font-mono ${tab === 'raw' ? 'bg-near-black text-cream' : 'bg-light-sand text-warm-gray'}`}>
                Raw
              </button>
              <button onClick={() => setTab('rendered')}
                className={`text-xs px-3 py-1.5 rounded-lg font-mono ${tab === 'rendered' ? 'bg-near-black text-cream' : 'bg-light-sand text-warm-gray'}`}>
                Rendered
              </button>
              {states.generate && (
                <button onClick={() => setTab('interactive')}
                  className={`text-xs px-3 py-1.5 rounded-lg font-mono ${tab === 'interactive' ? 'bg-orange text-cream' : 'bg-light-sand text-warm-gray'}`}>
                  Interactive
                </button>
              )}
            </div>

            {/* Output Toolbar */}
            <div className="output-toolbar">
              <button onClick={copyToClipboard} className="output-toolbar-btn">
                {copyText === 'Copied!' ? '✓' : '📋'} {copyText}
              </button>
              <button onClick={downloadOutput} className="output-toolbar-btn">
                ⬇ Download
              </button>
              {tab === 'raw' && (
                <button onClick={() => setWordWrap(!wordWrap)} className="output-toolbar-btn">
                  {wordWrap ? '⊟ Wrap: ON' : '⊞ Wrap: OFF'}
                </button>
              )}
            </div>

            {tab === 'interactive' ? (
              <DocViewer
                markdown={output}
                repoName={repoName || targetRepo}
                onClose={() => setTab('rendered')}
              />
            ) : tab === 'raw' ? (
              <pre className={`bg-off-white border border-sand text-near-black p-4 rounded-xl overflow-auto h-96 text-xs leading-relaxed font-mono ${wordWrap ? 'whitespace-pre-wrap break-words' : ''}`}>
                {output}
              </pre>
            ) : (
              <div
                ref={renderedRef}
                className="rendered-output bg-off-white border border-sand p-6 rounded-xl overflow-auto h-96 text-sm leading-relaxed"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(output) }}
              />
            )}

            {/* State indicators */}
            <div className="flex justify-center gap-6 mt-6 text-xs font-mono text-warm-gray">
              <span className={stateClass('fetch')}>● fetch</span>
              <span className="text-sand">→</span>
              <span className={stateClass('build')}>● build</span>
              <span className="text-sand">→</span>
              <span className={stateClass('generate')}>● generate</span>
            </div>

            {/* Audit Logs */}
            {auditSummary && (
              <AuditPanel auditSummary={auditSummary} />
            )}

            {/* Publish to GitHub Pages */}
            {states.generate && (
              <div className="publish-card">
                <div className="publish-header">
                  <span>📦</span>
                  <h3>Publish to GitHub Pages</h3>
                </div>

                <div className="publish-field">
                  <label>Target Repository</label>
                  <input
                    type="text"
                    value={targetRepo}
                    onChange={e => setTargetRepo(e.target.value)}
                    placeholder="owner/repo"
                  />
                </div>

                <div className="publish-field">
                  <label>GitHub Token (repo scope)</label>
                  <input
                    type="password"
                    value={githubPublishToken}
                    onChange={e => setGithubPublishToken(e.target.value)}
                    placeholder="ghp_..."
                  />
                  <div className="text-xs text-warm-gray mt-1 font-mono">
                    Generate at{' '}
                    <a href="https://github.com/settings/tokens" target="_blank"
                      className="text-orange underline">
                      github.com/settings/tokens
                    </a>
                    {' '}— needs <code>repo</code> scope
                  </div>
                </div>

                <div className="publish-actions">
                  <button
                    onClick={() => setTab('interactive')}
                    className="publish-btn publish-btn-secondary">
                    Preview Viewer
                  </button>
                  <button
                    onClick={publishDocs}
                    disabled={publishStatus === 'publishing'}
                    className="publish-btn publish-btn-primary">
                    {publishStatus === 'publishing' ? 'Publishing...' : '🚀 Publish to Pages'}
                  </button>
                </div>

                {publishError && (
                  <div className="publish-status publish-status-error">
                    ✗ {publishError}
                  </div>
                )}
                {publishStatus === 'publishing' && (
                  <div className="publish-status publish-status-publishing">
                    Publishing to GitHub Pages...
                  </div>
                )}
                {publishStatus === 'success' && (
                  <div className="publish-status publish-status-success">
                    ✓ Published!<br />
                    <a href={publishUrl} target="_blank" className="publish-url">
                      {publishUrl}
                    </a>
                  </div>
                )}
                {publishStatus === 'error' && (
                  <div className="publish-status publish-status-error">
                    ✗ Publish failed: {publishUrl}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </section>
    </>
  )
}

function Features() {
  const features = [
    { icon: '⚡', title: 'AST Mode Parsing', desc: 'Extracts imports, classes, methods, routes, and env vars. ~95% token reduction with higher quality LLM output.' },
    { icon: '🔒', title: 'Secret Sanitization', desc: 'Double-pass sanitization catches API keys, tokens, and credentials before content reaches the LLM. Full audit logs.' },
    { icon: '🔄', title: 'CI/CD Automation', desc: 'Trigger on push to main/master/dev. Semantic diff detects structural changes — only regenerates when needed.' },
    { icon: '🧠', title: 'Multi-Agent Orchestration', desc: 'EnforcedOrchestrator coordinates fetching, sanitization, parsing, and LLM generation in a reliable pipeline.' },
  ]

  return (
    <section id="features" className="section">
      <div className="container">
        <div className="section-header">
          <p className="section-label">Features</p>
          <h2 className="section-title">Built for developer workflows</h2>
        </div>
        <div className="features-grid">
          {features.map(f => (
            <div key={f.title} className="feature-card">
              <div className="feature-icon">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-inner">
          <div className="footer-brand">
            <div className="footer-brand-name">Auto-Doc</div>
            <p>Automated documentation pipeline powered by multi-agent orchestration and LLMs.</p>
          </div>
          <div className="footer-links">
            <div className="footer-col">
              <h4>Product</h4>
              <ul>
                <li><a href="#pipeline">Pipeline</a></li>
                <li><a href="#features">Features</a></li>
              </ul>
            </div>
            <div className="footer-col">
              <h4>Resources</h4>
              <ul>
                <li><a href="https://github.com/eljaouadimazen/Auto-Doc" target="_blank">GitHub Repo</a></li>
                <li><a href="https://eljaouadimazen.github.io/Auto-Doc/" target="_blank">Live Demo</a></li>
              </ul>
            </div>
          </div>
        </div>
        <div className="footer-bottom">
        </div>
      </div>
    </footer>
  )
}

function App() {
  return (
    <>
      <Navbar />
      <Pipeline />
      <Features />
      <Footer />
    </>
  )
}

export default App
