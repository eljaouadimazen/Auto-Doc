import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Settings, Key, Dna, Download, Hammer, FileText, BrainCircuit,
  Zap, Shield, ShieldCheck, ShieldAlert, Package, Rocket, Eye,
  Copy, CheckCircle2, ArrowRight, AlertCircle,
} from 'lucide-react'
import DocViewer from './components/DocViewer'
import AuditPanel from './components/AuditPanel'
import './App.css'

function Navbar() {
  return (
    <nav className="sticky top-0 z-50 border-b border-border/50 bg-background/70 backdrop-blur-xl">
      <div className="max-w-6xl mx-auto px-4 sm:px-8 flex items-center justify-between h-16">
        <a href="#" className="text-xl font-semibold tracking-tight text-foreground">Auto-Doc</a>
        <ul className="hidden sm:flex items-center gap-8 list-none m-0 p-0">
          <li><a href="#pipeline" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Pipeline</a></li>
          <li><a href="#features" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Features</a></li>
          <li><a href="https://github.com/eljaouadimazen/Auto-Doc" target="_blank" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">GitHub</a></li>
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

  const handleProviderChange = (newProvider) => {
    setProvider(newProvider)
    if (newProvider === 'ollama') {
      setKeyStatus('not set')
      clearTimeout(keyTimer.current)
    } else if (apiKey.trim()) {
      validateKey(apiKey.trim())
    }
  }

  useEffect(() => {
    if (tab !== 'rendered' || !renderedRef.current) return

    const timer = setTimeout(async () => {
      if (typeof mermaid === 'undefined') return

      const codeBlocks = renderedRef.current.querySelectorAll('pre code.language-mermaid, code.language-mermaid')

      codeBlocks.forEach(codeEl => {
        const pre = codeEl.closest('pre') || codeEl
        const diagram = codeEl.textContent || codeEl.innerText

        const mermaidDiv = document.createElement('div')
        mermaidDiv.className = 'mermaid'
        mermaidDiv.textContent = diagram
        pre.replaceWith(mermaidDiv)
      })

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
    { value: 'BACKEND', label: 'Backend', icon: Settings, desc: 'Server-side APIs, microservices, CLI tools' },
    { value: 'FRONTEND', label: 'Frontend', icon: Eye, desc: 'Web UI, React/Vue/Angular applications' },
    { value: 'FULLSTACK', label: 'Fullstack', icon: Dna, desc: 'Combined frontend + backend' },
    { value: 'MOBILE', label: 'Mobile', icon: Download, desc: 'Mobile/React Native/Flutter apps' },
    { value: 'DEVOPS', label: 'DevOps', icon: Settings, desc: 'Infrastructure, CI/CD, Docker/K8s' },
    { value: 'LIBRARY', label: 'Library', icon: Package, desc: 'npm packages, SDKs, shared utilities' },
    { value: 'RESOURCE_LIST', label: 'Resource List', icon: FileText, desc: 'Config files, docs, non-code repos' },
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

  const stateClass = (step) => states[step] ? 'text-foreground font-semibold' : 'text-muted-foreground'

  const getStepState = (stepId) => {
    if (loadingStep === stepId) return 'active'
    if (states[stepId]) return 'done'
    if (stepId === 'fetch') return 'available'
    if (stepId === 'build' && !states.fetch) return 'pending'
    if (stepId === 'generate' && (!states.build || !states.nature)) return 'pending'
    return 'available'
  }

  const STEPS = [
    { id: 'fetch', label: 'Fetch & Sanitize', icon: Download, desc: 'Clone, sanitize & audit secrets' },
    { id: 'build', label: 'Build LLM Input', icon: Hammer, desc: 'Parse AST & build context' },
    { id: 'generate', label: 'Generate Docs', icon: FileText, desc: 'Generate documentation' },
  ]

  const getKeyBadgeVariant = () => {
    if (keyStatus === 'valid') return 'success'
    if (keyStatus === 'invalid') return 'destructive'
    if (keyStatus === 'checking') return 'secondary'
    return 'outline'
  }

  const progressValue = () => {
    const done = Object.entries(states).filter(([k, v]) => k !== 'nature' && v).length
    return (done / 3) * 100
  }

  const modeLabel = provider === 'groq' ? 'Groq API Key'
    : provider === 'gemini' ? 'Gemini API Key'
    : provider === 'openrouter' ? 'OpenRouter API Key'
    : 'Ollama (Local)'

  const getKeyUrl = () => {
    if (provider === 'groq') return 'https://console.groq.com/keys'
    if (provider === 'gemini') return 'https://aistudio.google.com/apikey'
    if (provider === 'openrouter') return 'https://openrouter.ai/keys'
    return null
  }

  return (
    <>
      {/* Hero */}
      <section className="relative pt-28 pb-24 text-center border-b border-border/50 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(255,79,0,0.08)_0%,_transparent_60%)] animate-gradient-shift bg-[length:200%_200%]" />
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9InJnYmEoMTQ4LDE2MywxODQsMC4wMykiPjxwYXRoIGQ9Ik0zNiAxOGMwLTkuOTQgOC4wNi0xOCAxOC0xOGgtMTJjLTMuMzE0IDAtNiAyLjY4Ni02IDZ2MTJ6bTAgMGwxMiAxMmgtMTJsLTEyLTEyaDEyeiIvPjwvZz48L2c+PC9zdmc+')] opacity-40" />
        <div className="max-w-6xl mx-auto px-4 sm:px-8 relative">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 mb-8 rounded-full border border-border/50 bg-background/40 backdrop-blur-sm text-xs text-muted-foreground font-mono">
            <Zap className="w-3.5 h-3.5 text-cyan-accent" />
            Automated Documentation Pipeline
          </div>
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-semibold leading-[0.9] tracking-tight text-foreground mb-6">
            Turn your source code<br />into living documentation
          </h1>
          <p className="text-lg sm:text-xl text-muted-foreground/80 max-w-2xl mx-auto leading-relaxed">
            Auto-Doc parses your GitHub repository through an agentic multi-agent pipeline —
            fetching, sanitizing, and generating accurate docs powered by LLMs.
          </p>
        </div>
      </section>

      {/* Pipeline */}
      <section id="pipeline" className="py-20 border-b border-border/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-8">
          <div className="text-center mb-12">
            <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-3">Pipeline</p>
            <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-foreground">
              Generate docs in 3 steps
            </h2>
          </div>

          <Card className="border-border/50 bg-gradient-to-br from-card/90 to-background/80 backdrop-blur-xl shadow-2xl shadow-black/20 p-6 sm:p-8">
            {/* Provider & Mode */}
            <CardContent className="p-0 mb-6">
              <div className="bg-muted/30 rounded-xl p-4 border border-border/50">
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="flex-1 min-w-[200px]">
                    <label className="block text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1.5">
                      <Settings className="w-3 h-3" /> LLM Provider
                    </label>
                    <Select value={provider} onValueChange={handleProviderChange}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="groq">Groq (fast, free tier)</SelectItem>
                        <SelectItem value="ollama">Ollama (local, fully free)</SelectItem>
                        <SelectItem value="gemini">Gemini (free tier)</SelectItem>
                        <SelectItem value="openrouter">OpenRouter (many models)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex-1 min-w-[200px]">
                    <label className="block text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1.5">
                      <BrainCircuit className="w-3 h-3" /> Pipeline Mode
                    </label>
                    <div className="flex gap-2">
                      <Button
                        variant={pipelineMode === 'agentic' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setPipelineMode('agentic')}
                        className="flex-1 gap-1.5">
                        <BrainCircuit className="w-3.5 h-3.5" /> Agentic
                      </Button>
                      <Button
                        variant={pipelineMode === 'classic' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setPipelineMode('classic')}
                        className="flex-1 gap-1.5">
                        <FileText className="w-3.5 h-3.5" /> Classic
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>

            {/* API Key */}
            <CardContent className="p-0 mb-6">
              <div className="bg-muted/30 rounded-xl p-4 border border-border/50">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Key className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-sm font-semibold font-mono">{modeLabel}</span>
                    <Badge variant={getKeyBadgeVariant()}>{keyStatus}</Badge>
                  </div>
                  {getKeyUrl() && (
                    <a href={getKeyUrl()} target="_blank" className="text-xs text-orange underline font-mono">
                      Get free key ↗
                    </a>
                  )}
                  {provider === 'ollama' && (
                    <span className="text-xs text-muted-foreground font-mono">Ensure ollama serve is running</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Input
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
                    className="flex-1 font-mono text-xs"
                  />
                  <Button variant="outline" size="sm" onClick={() => {
                    const input = document.getElementById('apiKey')
                    if (input) input.type = input.type === 'password' ? 'text' : 'password'
                  }}>
                    <Eye className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </CardContent>

            {/* URL Input */}
            <CardContent className="p-0 mb-4">
              <label className="block text-xs text-muted-foreground font-mono mb-1.5 uppercase tracking-widest">
                GitHub Repository URL
              </label>
              <Input
                type="url"
                value={githubUrl}
                onChange={e => setGithubUrl(e.target.value)}
                className="w-full font-mono text-sm"
                placeholder="https://github.com/username/repository"
              />
            </CardContent>

            {/* AST Toggle */}
            <CardContent className="p-0 mb-6">
              <div className="flex items-center gap-3 p-3 bg-muted/20 rounded-xl border border-border/50">
                <Switch
                  checked={useAST}
                  onCheckedChange={toggleAST}
                  id="ast-mode"
                />
                <div>
                  <div className="text-sm font-medium text-foreground flex items-center gap-1.5">
                    <Zap className={`w-3.5 h-3.5 ${useAST ? 'text-accent' : 'text-muted-foreground'}`} />
                    AST Mode
                    <Badge variant="outline" className="text-xs font-mono">{useAST ? 'ON' : 'OFF'}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {useAST ? 'Extracts code structure — fewer tokens, smarter docs' : 'Raw truncation mode'}
                  </div>
                </div>
              </div>
            </CardContent>

            {/* Nature Panel */}
            <CardContent className="p-0 mb-6">
              <div className="bg-muted/20 rounded-xl p-4 sm:p-5 border border-border/50">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 flex items-center justify-center bg-muted/50 border border-border/50 rounded-lg shrink-0">
                    <Dna className="w-4 h-4 text-cyan-accent" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-foreground">Project Nature</div>
                    <div className="text-xs text-muted-foreground font-mono">Select your project type</div>
                  </div>
                  {states.nature && (
                    <Badge variant="success" className="ml-auto">✓ Configured</Badge>
                  )}
                  {!states.nature && fetchedFiles && (
                    <Badge variant="secondary" className="ml-auto">Needs confirmation</Badge>
                  )}
                </div>

                {!fetchedFiles && !states.nature && (
                  <div className="text-center py-4 text-xs text-muted-foreground font-mono bg-background/20 rounded-lg">
                    Fetch a repository, then select a project type below
                  </div>
                )}

                {fetchedFiles && !states.nature && (
                  <div className="bg-background/20 rounded-lg p-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                      {NATURE_OPTIONS.map(opt => {
                        const selected = projectNature === opt.value
                        const Icon = opt.icon
                        return (
                          <button
                            key={opt.value}
                            onClick={() => setProjectNature(opt.value)}
                            className={`flex flex-col items-start gap-1 p-2.5 rounded-lg border text-left cursor-pointer transition-all ${
                              selected
                                ? 'bg-accent/10 border-accent shadow-[0_0_0_1px_hsl(24.9_100%_50%)]'
                                : 'bg-muted/30 border-border/50 hover:bg-muted/50 hover:border-strong'
                            }`}>
                            <Icon className={`w-4 h-4 ${selected ? 'text-accent' : 'text-muted-foreground'}`} />
                            <span className="text-sm font-semibold text-foreground">{opt.label}</span>
                            <span className="text-[11px] text-muted-foreground font-mono leading-tight">{opt.desc}</span>
                          </button>
                        )
                      })}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground font-mono">{projectNature}</span>
                      <Button size="sm" onClick={() => setStates(s => ({ ...s, nature: true }))}>
                        Confirm
                      </Button>
                    </div>
                  </div>
                )}

                {states.nature && (
                  <div className="bg-background/20 rounded-lg p-3">
                    <Badge variant="success">✓ {projectNature}</Badge>
                  </div>
                )}
              </div>
            </CardContent>

            {/* Progress */}
            <CardContent className="p-0 mb-5">
              <Progress value={progressValue()} className="h-1.5" />
            </CardContent>

            {/* Steps */}
            <CardContent className="p-0 mb-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {STEPS.map(step => {
                  const state = getStepState(step.id)
                  const Icon = step.icon
                  const isDisabled = state === 'pending' || state === 'done' || (loadingStep && loadingStep !== step.id)
                  return (
                    <div key={step.id} className={`rounded-xl border p-4 transition-all duration-300 ${
                      state === 'active' ? 'border-accent/50 bg-accent/[0.03] shadow-[0_0_30px_-10px_hsl(24.9_100%_50%)]' :
                      state === 'done' ? 'border-emerald-500/30 bg-emerald-500/[0.03]' :
                      state === 'pending' ? 'opacity-40 border-border/50' :
                      'border-border/50 bg-card/40 hover:border-strong/50 hover:shadow-lg hover:-translate-y-0.5'
                    }`}>
                      <div className="flex items-start gap-2.5 mb-3">
                        <span className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-all duration-300 ${
                          state === 'done' ? 'bg-emerald-500/20 text-emerald-400 scale-110' :
                          state === 'active' ? 'bg-accent text-accent-foreground animate-pulse' :
                          state === 'pending' ? 'bg-muted/30 text-muted-foreground' :
                          'bg-accent/10 text-accent'
                        }`}>
                          {state === 'done' ? (
                            <CheckCircle2 className="w-4 h-4" />
                          ) : (
                            <Icon className="w-4 h-4" />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className={`text-sm font-semibold leading-tight ${
                            state === 'done' ? 'text-emerald-400' : 'text-foreground'
                          }`}>
                            {step.label}
                          </div>
                          <div className="text-[11px] text-muted-foreground font-mono mt-px leading-tight">{step.desc}</div>
                        </div>
                      </div>
                      <Button
                        disabled={isDisabled}
                        onClick={
                          step.id === 'fetch' ? fetchRepo :
                          step.id === 'build' ? buildInput : generateDocs
                        }
                        variant={
                          state === 'active' ? 'default' :
                          state === 'done' ? 'outline' :
                          state === 'pending' ? 'ghost' :
                          'secondary'
                        }
                        className="w-full text-sm gap-1.5">
                        {state === 'active' ? (
                          <>Working</>
                        ) : state === 'done' ? (
                          <><CheckCircle2 className="w-3.5 h-3.5" /> Done</>
                        ) : (
                          <><ArrowRight className="w-3.5 h-3.5" /> {step.label}</>
                        )}
                      </Button>
                    </div>
                  )
                })}
              </div>
            </CardContent>

            {/* Error */}
            {error && (
              <CardContent className="p-0 mb-4">
                <div className="flex items-center gap-2 bg-destructive/10 border border-destructive/30 text-foreground text-sm px-4 py-3 rounded-lg font-mono">
                  <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
                  {error}
                </div>
              </CardContent>
            )}

            {/* Mode badge */}
            {mode && (
              <CardContent className="p-0 mb-3">
                <Badge variant={mode === 'ast' ? 'default' : 'secondary'} className="gap-1">
                  <Zap className="w-3 h-3" />
                  {mode === 'ast' ? 'AST mode' : 'Raw mode'}
                </Badge>
              </CardContent>
            )}

            {/* Output Area with Audit integrated */}
            <CardContent className="p-0">
              <Tabs value={tab} onValueChange={setTab} className="w-full">
                <div className="flex items-center gap-2 mb-2">
                  <TabsList>
                    <TabsTrigger value="raw" className="text-xs font-mono gap-1">
                      <FileText className="w-3 h-3" /> Raw
                    </TabsTrigger>
                    <TabsTrigger value="rendered" className="text-xs font-mono gap-1">
                      <Eye className="w-3 h-3" /> Rendered
                    </TabsTrigger>
                    {states.generate && (
                      <TabsTrigger value="interactive" className="text-xs font-mono gap-1">
                        <Settings className="w-3 h-3" /> Interactive
                      </TabsTrigger>
                    )}
                    {auditSummary && (
                      <TabsTrigger value="audit" className="text-xs font-mono gap-1">
                        {auditSummary.totalRedacted > 0 ? (
                          <ShieldAlert className="w-3 h-3 text-destructive" />
                        ) : (
                          <ShieldCheck className="w-3 h-3 text-emerald-400" />
                        )}
                        Audit
                      </TabsTrigger>
                    )}
                  </TabsList>
                  <div className="flex gap-1 ml-auto">
                    <Button variant="ghost" size="sm" className="h-7 text-xs font-mono gap-1" onClick={copyToClipboard}>
                      <Copy className="w-3 h-3" /> {copyText}
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs font-mono gap-1" onClick={downloadOutput}>
                      <Download className="w-3 h-3" /> Download
                    </Button>
                    {tab === 'raw' && (
                      <Button variant="ghost" size="sm" className="h-7 text-xs font-mono" onClick={() => setWordWrap(!wordWrap)}>
                        {wordWrap ? '⊟ Wrap: ON' : '⊞ Wrap: OFF'}
                      </Button>
                    )}
                  </div>
                </div>

                <TabsContent value="interactive">
                  <DocViewer
                    markdown={output}
                    repoName={repoName || targetRepo}
                    onClose={() => setTab('rendered')}
                  />
                </TabsContent>

                <TabsContent value="raw">
                  <pre className={`bg-background/60 border border-border/50 text-foreground p-4 rounded-xl overflow-auto h-96 text-xs leading-relaxed font-mono ${wordWrap ? 'whitespace-pre-wrap break-words' : ''}`}>
                    {output}
                  </pre>
                </TabsContent>

                <TabsContent value="rendered">
                  <div
                    ref={renderedRef}
                    className="rendered-output bg-background/60 border border-border/50 p-6 rounded-xl overflow-auto h-96 text-sm leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(output) }}
                  />
                </TabsContent>

                <TabsContent value="audit">
                  <div className="bg-background/60 border border-border/50 rounded-xl overflow-auto h-96">
                    <AuditPanel auditSummary={auditSummary} />
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>

            {/* State indicators */}
            <CardContent className="p-0 mt-6">
              <div className="flex justify-center gap-6 text-xs font-mono text-muted-foreground">
                <span className={stateClass('fetch')}>● fetch</span>
                <span className="text-border">→</span>
                <span className={stateClass('build')}>● build</span>
                <span className="text-border">→</span>
                <span className={stateClass('generate')}>● generate</span>
              </div>
            </CardContent>

            {/* Publish */}
            {states.generate && (
              <CardContent className="p-0 mt-6">
                <div className="bg-muted/20 border border-border/50 rounded-xl p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <Package className="w-4 h-4 text-cyan-accent" />
                    <h3 className="text-sm font-semibold m-0 text-foreground">Publish to GitHub Pages</h3>
                  </div>

                  <div className="mb-3">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Target Repository</label>
                    <Input type="text" value={targetRepo} onChange={e => setTargetRepo(e.target.value)} placeholder="owner/repo" className="font-mono" />
                  </div>

                  <div className="mb-3">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">GitHub Token (repo scope)</label>
                    <Input type="password" value={githubPublishToken} onChange={e => setGithubPublishToken(e.target.value)} placeholder="ghp_..." className="font-mono" />
                    <div className="text-xs text-muted-foreground mt-1 font-mono">
                      Generate at{' '}
                      <a href="https://github.com/settings/tokens" target="_blank" className="text-accent underline">
                        github.com/settings/tokens
                      </a>
                      {' '}— needs <code className="text-xs">repo</code> scope
                    </div>
                  </div>

                  <div className="flex gap-2 mt-4">
                    <Button variant="secondary" size="sm" onClick={() => setTab('interactive')} className="flex-1 gap-1.5">
                      <Eye className="w-3.5 h-3.5" /> Preview Viewer
                    </Button>
                    <Button onClick={publishDocs} disabled={publishStatus === 'publishing'} className="flex-1 gap-1.5">
                      {publishStatus === 'publishing' ? 'Publishing...' : <><Rocket className="w-3.5 h-3.5" /> Publish to Pages</>}
                    </Button>
                  </div>

                  {publishStatus === 'publishing' && (
                    <div className="mt-3 p-2.5 rounded-md text-xs font-mono bg-yellow-500/10 text-yellow-400 border border-yellow-500/30">Publishing to GitHub Pages...</div>
                  )}
                  {publishStatus === 'success' && (
                    <div className="mt-3 p-2.5 rounded-md text-xs font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                      ✓ Published!<br />
                      <a href={publishUrl} target="_blank" className="text-emerald-400 underline break-all">{publishUrl}</a>
                    </div>
                  )}
                  {(publishStatus === 'error' || publishError) && (
                    <div className="mt-3 p-2.5 rounded-md text-xs font-mono bg-destructive/10 text-destructive-foreground border border-destructive/30">
                      ✗ {publishError || (publishStatus === 'error' ? `Publish failed: ${publishUrl}` : '')}
                    </div>
                  )}
                </div>
              </CardContent>
            )}
          </Card>
        </div>
      </section>
    </>
  )
}

function Features() {
  const features = [
    { icon: Zap, title: 'AST Mode Parsing', desc: 'Extracts imports, classes, methods, routes, and env vars. ~95% token reduction with higher quality LLM output.' },
    { icon: Shield, title: 'Secret Sanitization', desc: 'Double-pass sanitization catches API keys, tokens, and credentials before content reaches the LLM. Full audit logs.' },
    { icon: Settings, title: 'CI/CD Automation', desc: 'Trigger on push to main/master/dev. Semantic diff detects structural changes — only regenerates when needed.' },
    { icon: BrainCircuit, title: 'Multi-Agent Orchestration', desc: 'EnforcedOrchestrator coordinates fetching, sanitization, parsing, and LLM generation in a reliable pipeline.' },
  ]

  return (
    <section id="features" className="py-20 border-b border-border/50">
      <div className="max-w-6xl mx-auto px-4 sm:px-8">
        <div className="text-center mb-12">
          <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-3">Features</p>
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-foreground">Built for developer workflows</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map(f => {
            const Icon = f.icon
            return (
              <Card key={f.title} className="border-border/50 bg-card/60 backdrop-blur-sm hover:border-strong/50 hover:-translate-y-1 hover:shadow-xl transition-all duration-300 group">
                <CardContent className="p-6">
                  <div className="w-10 h-10 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center mb-5 group-hover:bg-accent/20 group-hover:scale-110 transition-all duration-300">
                    <Icon className="w-5 h-5 text-accent" />
                  </div>
                  <h3 className="text-base font-semibold mb-2.5 text-foreground">{f.title}</h3>
                  <p className="text-sm text-muted-foreground/80 leading-relaxed">{f.desc}</p>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="bg-background/50 backdrop-blur-xl border-t border-border/50 py-12">
      <div className="max-w-6xl mx-auto px-4 sm:px-8">
        <div className="flex flex-wrap justify-between items-start gap-12">
          <div>
            <div className="text-lg font-semibold text-foreground mb-2">Auto-Doc</div>
            <p className="text-sm text-muted-foreground/70 max-w-xs leading-relaxed">
              Automated documentation pipeline powered by multi-agent orchestration and LLMs.
            </p>
          </div>
          <div className="flex gap-16 flex-wrap">
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">Product</h4>
              <ul className="list-none p-0 m-0 space-y-2.5">
                <li><a href="#pipeline" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Pipeline</a></li>
                <li><a href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Features</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">Resources</h4>
              <ul className="list-none p-0 m-0 space-y-2.5">
                <li><a href="https://github.com/eljaouadimazen/Auto-Doc" target="_blank" className="text-sm text-muted-foreground hover:text-foreground transition-colors">GitHub Repo</a></li>
                <li><a href="https://eljaouadimazen.github.io/Auto-Doc/" target="_blank" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Live Demo</a></li>
              </ul>
            </div>
          </div>
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
