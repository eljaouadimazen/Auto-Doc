import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import HeroSection from './HeroSection'
import SearchBar from './SearchBar'
import NeonGlowCard from './Neonglowcards'
import SegmentedControl from './SegmentedControl'
import PillToggle from '@/components/ui/pill-toggle'
import ShineButton from '@/components/ui/shine-button'
import Input from './Input'
import Checkbox from './Checkbox'
import LoadingButton from './Loadingbutton'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Server, Monitor, Layers, Smartphone, Container,
  Key, GitMerge, Cpu, Route, Compass,
  Zap, Download, FileText, Package, Rocket, Eye, GitBranch, Cog, ScrollText,
  Copy, CheckCircle2, ArrowRight, AlertCircle,
  UserCheck, Building2, TrendingUp,
  ShieldCheck, ShieldAlert,
} from 'lucide-react'
import { Suspense } from 'react'
const DocViewer = React.lazy(() => import('./DocViewer'))
import AuditPanel from './AuditPanel'
import { marked } from 'marked'
import mermaid from 'mermaid'
import { usePipelineState } from '@/hooks/usePipelineState'
import { useApiKey } from '@/hooks/useApiKey'
import { useOutput, PIPELINE_STAGES } from '@/hooks/useOutput'
import { useFetchRepo } from '@/hooks/useFetchRepo'
import { usePublish } from '@/hooks/usePublish'
import '@/App.css'

mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'loose' })

const ALL_SECTION_OPTIONS = [
  { id: 'overview', label: 'Overview', desc: 'Project overview and purpose', category: 'Core' },
  { id: 'architecture', label: 'Architecture', desc: 'Component hierarchy and layering', category: 'Core' },
  { id: 'setup', label: 'Setup & Usage', desc: 'Installation and getting started', category: 'Core' },
  { id: 'technical', label: 'Technical Specs', desc: 'Detailed module documentation', category: 'Core' },
  { id: 'api', label: 'API Reference', desc: 'Endpoints and usage', category: 'Technical' },
  { id: 'data_flow', label: 'Data Flow', desc: 'Request lifecycle and state flow', category: 'Technical' },
  { id: 'entities', label: 'Entity Model', desc: 'Database schema and entities', category: 'Technical' },
  { id: 'dependencies', label: 'Dependencies', desc: 'External packages and libraries', category: 'Technical' },
  { id: 'security', label: 'Security', desc: 'Auth, validation, sanitization', category: 'Operations' },
  { id: 'error_handling', label: 'Error Handling', desc: 'Error patterns and middleware', category: 'Operations' },
  { id: 'configuration', label: 'Configuration', desc: 'Environment variables and config', category: 'Operations' },
  { id: 'deployment', label: 'Deployment', desc: 'CI/CD, hosting, containers', category: 'Operations' },
  { id: 'business_model', label: 'Business Context', desc: 'Business value and problem', category: 'Business' },
  { id: 'progress', label: 'Progress', desc: 'Project status and milestones', category: 'Business' },
]

const SECTION_CATEGORIES = ['Core', 'Technical', 'Operations', 'Business']

const allSectionIds = ALL_SECTION_OPTIONS.map(s => s.id)

const SECTION_PRESETS = [
  { id: 'full', label: 'Full Suite', sections: allSectionIds },
  { id: 'dev-core', label: 'Developer Core', sections: ['overview', 'architecture', 'api', 'security', 'setup', 'data_flow', 'error_handling', 'configuration', 'deployment', 'dependencies'] },
  { id: 'minimal', label: 'Minimal', sections: ['overview', 'setup'] },
  { id: 'pm-brief', label: 'PM Brief', sections: ['overview', 'architecture', 'api', 'security', 'business_model', 'progress', 'deployment'] },
  { id: 'po-brief', label: 'PO Brief', sections: ['overview', 'business_model', 'progress'] },
]

const NATURE_OPTIONS = [
  { value: 'BACKEND', label: 'Backend', icon: Server, desc: 'Server-side APIs, microservices, CLI tools' },
  { value: 'FRONTEND', label: 'Frontend', icon: Monitor, desc: 'Web UI, React/Vue/Angular applications' },
  { value: 'FULLSTACK', label: 'Fullstack', icon: Layers, desc: 'Combined frontend + backend' },
  { value: 'MOBILE', label: 'Mobile', icon: Smartphone, desc: 'Mobile/React Native/Flutter apps' },
  { value: 'DEVOPS', label: 'DevOps', icon: Container, desc: 'Infrastructure, CI/CD, Docker/K8s' },
  { value: 'LIBRARY', label: 'Library', icon: Package, desc: 'npm packages, SDKs, shared utilities' },
  { value: 'RESOURCE_LIST', label: 'Resource List', icon: FileText, desc: 'Config files, docs, non-code repos' },
]

async function pollJob(jobId, signal, setPipelineStages) {
  const POLL_INTERVAL = 2000
  const MAX_POLL_TIME = 600000

  const startTime = Date.now()

  while (true) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')

    const res = await fetch(`/job/${jobId}`, { signal })
    if (!res.ok) throw new Error('Failed to poll job status')

    const status = await res.json()

    if (status.progress && setPipelineStages) {
      const { stage, message } = status.progress
      setPipelineStages(prev => {
        const next = { ...prev }
        const currentStageId = String(stage)
        const currentIndex = PIPELINE_STAGES.findIndex(s => s.id === currentStageId)
        for (let i = 0; i < PIPELINE_STAGES.length; i++) {
          const sid = PIPELINE_STAGES[i].id
          if (i < currentIndex) {
            if (next[sid]?.status !== 'completed') next[sid] = { ...next[sid], status: 'completed' }
          } else if (i === currentIndex) {
            next[sid] = { status: 'active', message: message || '' }
          } else {
            if (next[sid]?.status !== 'completed' && next[sid]?.status !== 'active')
              next[sid] = { ...next[sid], status: 'pending' }
          }
        }
        return next
      })
    }

    if (status.status === 'done') return status.result
    if (status.status === 'failed') throw new Error(status.error || 'Documentation generation failed')
    if (Date.now() - startTime > MAX_POLL_TIME) throw new Error('Documentation generation timed out')

    await new Promise(r => setTimeout(r, POLL_INTERVAL))
  }
}

export default function Pipeline() {
  const { states, loadingStep, error, startLoading, stopLoading, completeStep, setError, invalidateSteps } = usePipelineState()
  const { apiKey, setApiKey, keyStatus, provider, setProvider, pipelineMode, setPipelineMode, authHeaders } = useApiKey()
  const { output, setOutput, messages, setMessages, sessionId, setSessionId, mode, setMode, tab, setTab, wordWrap, setWordWrap, copyText, setCopyText, pdfBase64, setPdfBase64, pipelineStages, setPipelineStages, abortRef, renderedRef } = useOutput()
  const { githubUrl, setGithubUrl, fetchedFiles, setFetchedFiles, repoName, setRepoName, rawMarkdown, setRawMarkdown, auditSummary, setAuditSummary, targetRepo, setTargetRepo, resetRepo } = useFetchRepo()
  const { githubPublishToken, setGithubPublishToken, publishStatus, setPublishStatus, publishUrl, setPublishUrl, publishError, setPublishError, resetPublish } = usePublish()

  const [projectNature, setProjectNature] = useState(null)
  const [selectedSections, setSelectedSections] = useState(allSectionIds)
  const [targetAudience, setTargetAudience] = useState('DEVELOPER')
  const [businessModel, setBusinessModel] = useState('')
  const [projectProgress, setProjectProgress] = useState('')
  const [useAST, setUseAST] = useState(true)
  const [showApiKey, setShowApiKey] = useState(false)

  useEffect(() => {
    if (tab !== 'rendered' || !renderedRef.current) return

    const timer = setTimeout(async () => {
      const codeBlocks = renderedRef.current.querySelectorAll('pre code.language-mermaid, code.language-mermaid')

      codeBlocks.forEach(codeEl => {
        const pre = codeEl.closest('pre') || codeEl
        const diagram = codeEl.textContent || codeEl.innerText

        const mermaidContainer = document.createElement('div')
        mermaidContainer.className = 'mermaid-container'
        const mermaidDiv = document.createElement('div')
        mermaidDiv.className = 'mermaid'
        mermaidDiv.textContent = diagram
        mermaidContainer.appendChild(mermaidDiv)
        pre.replaceWith(mermaidContainer)
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

  const fetchRepo = async () => {
    const url = githubUrl.trim()
    if (!url) { setError('Enter a GitHub URL'); return }
    if (!url.includes('github.com')) { setError('Must be a github.com URL'); return }

    startLoading('fetch')
    setOutput('Fetching...')
    resetPublish()
    setPdfBase64(null)
    setMessages(null)
    setSessionId(null)
    // Don't wipe the Project Nature selection here — it's laid out above the
    // pipeline buttons, so users naturally pick it before ever clicking Fetch.
    // Only invalidate the steps that actually need to re-run.
    invalidateSteps(['fetch', 'build', 'generate'])
    resetRepo()

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
      completeStep('fetch')
      setMode('')
    } catch (err) {
      setError(err.message)
      setOutput('Fetch failed.')
    } finally {
      stopLoading()
    }
  }

  const buildInput = async () => {
    if (!rawMarkdown) { setError('Run Fetch Repo first'); return }

    startLoading('build')
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
      completeStep('build')
    } catch (err) {
      setError(err.message)
      setOutput('Build failed.')
    } finally {
      stopLoading()
    }
  }

  const generateDocs = async () => {
    if (pipelineMode === 'agentic') {
      if (!fetchedFiles) { setError('Run Fetch Repo first'); return }
    } else {
      if (!messages) { setError('Run Build Input first'); return }
    }

    startLoading('generate')
    setOutput('Generating documentation...')

    setPipelineStages(
      Object.fromEntries(PIPELINE_STAGES.map(s => [s.id, { status: 'pending', message: '' }]))
    )

    try {
      let body = {}
      if (pipelineMode === 'agentic') {
        body = {
          files: fetchedFiles,
          repoName,
          projectNature,
          githubUrl: githubUrl.trim() || undefined,
          forbiddenSections: allSectionIds.filter(id => !selectedSections.includes(id)),
          targetAudience,
          businessModel: businessModel.trim() || undefined,
          projectProgress: projectProgress.trim() || undefined
        }
      } else if (Array.isArray(messages)) {
        body = { chunks: messages, sessionId }
      } else {
        body = { messages }
      }

      const url = pipelineMode === 'agentic' ? '/generate-docs?progress=1' : '/generate-docs'
      abortRef.current = new AbortController()

      const res = await fetch(url, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(body),
        signal: abortRef.current.signal
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Generation failed')
      }

      if (res.status === 202) {
        const { jobId } = await res.json()
        if (!jobId) throw new Error('Backend returned 202 but no jobId')

        const result = await pollJob(jobId, abortRef.current.signal, setPipelineStages)
        setOutput(result.documentation)
        if (result.stats?.pdfBase64) setPdfBase64(result.stats.pdfBase64)
        completeStep('generate')
        setTab('rendered')
        setPipelineStages(prev => {
          const next = { ...prev }
          PIPELINE_STAGES.forEach(s => {
            next[s.id] = { ...next[s.id], status: 'completed' }
          })
          return next
        })
        return
      }

      if (pipelineMode === 'agentic') {
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (!line.trim()) continue
            try {
              const event = JSON.parse(line)
              if (event.type === 'progress') {
                setPipelineStages(prev => {
                  const next = { ...prev }
                  const currentStageId = String(event.stage)
                  const currentIndex = PIPELINE_STAGES.findIndex(s => s.id === currentStageId)
                  if (currentIndex === -1) return prev

                  for (let i = 0; i < PIPELINE_STAGES.length; i++) {
                    const sid = PIPELINE_STAGES[i].id
                    if (i < currentIndex) {
                      if (next[sid].status !== 'completed') {
                        next[sid] = { ...next[sid], status: 'completed' }
                      }
                    } else if (i === currentIndex) {
                      next[sid] = { status: 'active', message: event.message || '' }
                    }
                  }
                  return next
                })
              } else if (event.type === 'done') {
                setOutput(event.documentation)
                if (event.stats?.pdfBase64) setPdfBase64(event.stats.pdfBase64)
                completeStep('generate')
                setTab('rendered')
                setPipelineStages(prev => {
                  const next = { ...prev }
                  PIPELINE_STAGES.forEach(s => {
                    next[s.id] = { ...next[s.id], status: 'completed' }
                  })
                  return next
                })
              }
            } catch (e) {
              console.warn('Failed to parse progress line:', line, e)
            }
          }
        }
      } else {
        const data = await res.json()
        setOutput(data.documentation)
        if (data.pdfBase64) setPdfBase64(data.pdfBase64)
        completeStep('generate')
        setTab('rendered')
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        setError('Generation cancelled')
        setOutput('Generation was cancelled.')
      } else {
        setError(err.message)
        setOutput('Generation failed.')
      }
    } finally {
      stopLoading()
      abortRef.current = null
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
    if (pdfBase64) {
      const byteChars = atob(pdfBase64)
      const byteNums = new Array(byteChars.length)
      for (let i = 0; i < byteChars.length; i++) byteNums[i] = byteChars.charCodeAt(i)
      const byteArray = new Uint8Array(byteNums)
      const blob = new Blob([byteArray], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `${repoName || 'docs'}.pdf`
      a.click(); URL.revokeObjectURL(url)
      return
    }
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
    invalidateSteps(['build', 'nature', 'generate'])
  }

  const renderMarkdown = (text) => {
    try {
      return marked.parse(text)
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
    { id: 'fetch', label: 'Fetch & Sanitize', icon: GitBranch, desc: 'Clone, sanitize & audit secrets' },
    { id: 'build', label: 'Build LLM Input', icon: Cog, desc: 'Parse AST & build context' },
    { id: 'generate', label: 'Generate Docs', icon: ScrollText, desc: 'Generate documentation' },
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
      <HeroSection
     onStartClick={() => document.getElementById('pipeline')?.scrollIntoView({ behavior: 'smooth' })}
     onHowItWorksClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
      />
 
      {/* Pipeline */}
      <section id="pipeline" className="py-28 border-b border-border/50">
        <div className="w-full px-4 sm:px-6 lg:px-12">
          <div className="text-center mb-12">
            <div className="mb-8 flex justify-center">
              <SearchBar
                wide
                value={githubUrl}
                onChange={e => setGithubUrl(e.target.value)}
                placeholder="https://github.com/username/repository"
              />
            </div>
            <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-3">Pipeline</p>
            <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-foreground">
              Generate docs in 3 steps
            </h2>
          </div>

          <Card className="border-border/50 bg-gradient-to-br from-card/90 to-background/80 backdrop-blur-xl shadow-2xl shadow-black/20 p-10 sm:p-14 lg:p-16">
            {/* Provider & Mode */}
            <CardContent className="p-0 mb-10">
              <div className="bg-muted/30 p-5 rounded-lg">
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="flex-1 min-w-[200px]">
                    <label className="block text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1.5">
                      <Cpu className="w-3 h-3" /> LLM Provider
                    </label>
                    <Select value={provider} onValueChange={setProvider}>
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
                      <Route className="w-3 h-3" /> Pipeline Mode
                    </label>
                    <SegmentedControl
                      value={pipelineMode}
                      onChange={setPipelineMode}
                      options={[
                        { value: 'agentic', label: 'Agentic', icon: GitMerge },
                        { value: 'classic', label: 'Classic', icon: FileText },
                      ]}
                    />
                  </div>
                </div>
              </div>
            </CardContent>

            {/* API Key */}
            <CardContent className="p-0 mb-10">
              <div className="bg-muted/30 p-5 rounded-lg">
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
                <Input
                  id="apiKey"
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder={
                    provider === 'groq' ? 'gsk_... (pasted directly to Groq, not stored)'
                    : provider === 'gemini' ? 'AIza... (pasted directly to Google, not stored)'
                    : provider === 'openrouter' ? 'sk-or-... (pasted directly to OpenRouter, not stored)'
                    : 'Not required for Ollama'
                  }
                  disabled={provider === 'ollama'}
                  className="font-mono"
                  rightSlot={
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setShowApiKey(v => !v)}>
                      <Eye className="w-3.5 h-3.5" />
                    </Button>
                  }
                />
              </div>
            </CardContent>

            {/* Divider */}
            <hr className="border-border/20 my-6" />

            {/* Project Nature */}
            <CardContent className="p-0 mb-10">
              <div className="bg-muted/20 p-5 sm:p-6 rounded-lg">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-9 h-9 flex items-center justify-center bg-muted/50 border border-border/50 rounded-lg shrink-0">
                    <Compass className="w-4 h-4 text-cyan-accent" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-foreground">Project Nature</div>
                    <div className="text-xs text-muted-foreground font-mono">Tell us what you're building</div>
                  </div>
                  {projectNature && (
                    <Badge variant="success" className="ml-auto">✓ {projectNature}</Badge>
                  )}
                </div>
                <div className="bg-background/20 rounded-lg p-3">
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                    {NATURE_OPTIONS.map(opt => {
                      const selected = projectNature === opt.value
                      const Icon = opt.icon
                      return (
                        <NeonGlowCard
                          key={opt.value}
                          active={selected}
                          className="bg-muted/30 p-4"
                          onClick={() => {
                            setProjectNature(opt.value)
                            completeStep('nature')
                          }}
                        >
                          <div className="flex flex-col items-start gap-1.5">
                            <Icon className={`w-5 h-5 ${selected ? 'text-accent' : 'text-muted-foreground'}`} />
                            <span className="text-sm font-semibold text-foreground">{opt.label}</span>
                            <span className="text-xs text-muted-foreground font-mono leading-tight">{opt.desc}</span>
                          </div>
                        </NeonGlowCard>
                      )
                    })}
                  </div>
                </div>
              </div>
            </CardContent>

            {/* Documentation Sections */}
            <CardContent className="p-0 mb-10">
              <div className="bg-muted/20 p-5 rounded-lg">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-9 h-9 flex items-center justify-center bg-muted/50 border border-border/50 rounded-lg shrink-0">
                    <FileText className="w-4 h-4 text-cyan-accent" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-foreground">Documentation Sections</div>
                    <div className="text-xs text-muted-foreground font-mono">Choose which sections to include</div>
                  </div>
                  <Badge variant="outline" className="ml-auto text-xs font-mono">{selectedSections.length}/{ALL_SECTION_OPTIONS.length}</Badge>
                </div>
                <div className="flex flex-wrap gap-2 mb-5">
                  {SECTION_PRESETS.map(p => (
                    <button
                      key={p.id}
                      onClick={() => setSelectedSections(p.sections)}
                      className={`px-3 py-1.5 rounded-md border text-xs font-mono transition-all ${
                        selectedSections.length === p.sections.length && p.sections.every(s => selectedSections.includes(s))
                          ? 'bg-accent/10 border-accent/50 text-accent'
                          : 'bg-muted/30 border-border/50 text-muted-foreground hover:bg-muted/50 hover:border-strong'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {SECTION_CATEGORIES.map(cat => (
                    <div key={cat} className="bg-background/25 border border-border/40 rounded-lg p-4">
                      <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70 mb-2.5">
                        {cat}
                      </div>
                      <div className="space-y-1">
                        {ALL_SECTION_OPTIONS.filter(o => o.category === cat).map(opt => {
                          const checked = selectedSections.includes(opt.id)
                          return (
                            <Checkbox
                              key={opt.id}
                              id={`section-${opt.id}`}
                              checked={checked}
                              className="rounded-md px-1.5 py-1.5 hover:bg-muted/20 transition-colors"
                              onChange={() => {
                                setSelectedSections(prev =>
                                  prev.includes(opt.id)
                                    ? prev.filter(id => id !== opt.id)
                                    : [...prev, opt.id]
                                )
                              }}
                            >
                              <div className="text-xs font-semibold text-foreground leading-tight">{opt.label}</div>
                              <div className="text-[10px] text-muted-foreground font-mono leading-tight mt-0.5">{opt.desc}</div>
                            </Checkbox>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>

            {/* Target Audience */}
            <CardContent className="p-0 mb-10">
              <div className="bg-muted/20 p-5 rounded-lg">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-9 h-9 flex items-center justify-center bg-muted/50 border border-border/50 rounded-lg shrink-0">
                    <UserCheck className="w-4 h-4 text-cyan-accent" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-foreground">Target Audience</div>
                    <div className="text-xs text-muted-foreground font-mono">Tailor content depth and focus</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {[
                    { value: 'USER', label: 'User', desc: 'Walkthrough, no technical details' },
                    { value: 'DEVELOPER', label: 'Developer', desc: 'Full technical + business context' },
                    { value: 'PROJECT_MANAGER', label: 'Project Manager', desc: 'High-level + progress' },
                    { value: 'PRODUCT_OWNER', label: 'Product Owner', desc: 'Business value + progress' },
                  ].map(opt => {
                    const selected = targetAudience === opt.value
                    return (
                      <NeonGlowCard
                        key={opt.value}
                        active={selected}
                        className="bg-muted/30 p-4"
                        onClick={() => setTargetAudience(opt.value)}
                      >
                        <div className="flex flex-col items-start gap-1.5">
                          <span className="text-sm font-semibold text-foreground">{opt.label}</span>
                          <span className="text-xs text-muted-foreground font-mono leading-tight">{opt.desc}</span>
                        </div>
                      </NeonGlowCard>
                    )
                  })}
                </div>
              </div>
            </CardContent>

            {/* Business Model */}
            {targetAudience !== 'USER' && (
              <CardContent className="p-0 mb-10">
                <div className="bg-muted/20 p-5 rounded-lg">
                  <div className="flex items-center gap-3 mb-2">
                    <Building2 className="w-4 h-4 text-cyan-accent" />
                    <span className="text-sm font-semibold text-foreground">Business Model</span>
                    <span className="text-[10px] text-muted-foreground font-mono">(optional)</span>
                  </div>
                  <textarea
                    value={businessModel}
                    onChange={e => setBusinessModel(e.target.value)}
                    placeholder="Describe the business context: problem statement, target users, value proposition, revenue model, key differentiators..."
                    rows={3}
                    className="w-full bg-background/40 border border-border/50 rounded-lg p-3 text-sm font-mono text-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:border-accent/50 transition-colors"
                  />
                </div>
              </CardContent>
            )}

            {/* Project Progress */}
            {(targetAudience === 'PROJECT_MANAGER' || targetAudience === 'PRODUCT_OWNER') && (
              <CardContent className="p-0 mb-10">
                <div className="bg-muted/20 p-5 rounded-lg">
                  <div className="flex items-center gap-3 mb-2">
                    <TrendingUp className="w-4 h-4 text-cyan-accent" />
                    <span className="text-sm font-semibold text-foreground">Project Progress</span>
                    <span className="text-[10px] text-muted-foreground font-mono">(optional)</span>
                  </div>
                  <textarea
                    value={projectProgress}
                    onChange={e => setProjectProgress(e.target.value)}
                    placeholder="Describe current status: current phase, completed milestones, next steps, timeline, blockers..."
                    rows={3}
                    className="w-full bg-background/40 border border-border/50 rounded-lg p-3 text-sm font-mono text-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:border-accent/50 transition-colors"
                  />
                </div>
              </CardContent>
            )}

            {/* AST Toggle */}
            <CardContent className="p-0 mb-10">
              <div className="bg-muted/20 rounded-lg">
                <div className="flex items-center gap-3 p-3">
                  <PillToggle
                    checked={useAST}
                    onCheckedChange={toggleAST}
                    id="ast-mode"
                    icon={Zap}
                    aria-label="Toggle AST mode"
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
              </div>
            </CardContent>

            {/* Progress */}
            <CardContent className="p-0 mb-10">
              <Progress value={progressValue()} className="h-1.5" />
            </CardContent>

            {/* Steps */}
            <CardContent className="p-0 mb-10">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {STEPS.map(step => {
                  const state = getStepState(step.id)
                  const Icon = step.icon
                  const isDisabled = state === 'pending' || state === 'done' || (loadingStep && loadingStep !== step.id)
                  return (
                    <div
                      key={step.id}
                      className={`p-5 transition-all duration-300 rounded-lg ${
                        state === 'done' ? 'bg-emerald-500/[0.03]' :
                        state === 'pending' ? 'opacity-40' :
                        'bg-card/40'
                      }`}
                    >
                      <div>
                        <div className="flex items-start gap-3 mb-4">
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
                        {state === 'active' ? (
                          <LoadingButton
                            label={
                              step.id === 'fetch' ? 'Cloning & sanitizing…' :
                              step.id === 'build' ? 'Parsing & building context…' :
                              pipelineMode === 'agentic'
                                ? (PIPELINE_STAGES.find(s => pipelineStages[s.id]?.status === 'active')?.label || 'Generating documentation…')
                                : 'Generating documentation…'
                            }
                          />
                        ) : (
                          <ShineButton
                            disabled={isDisabled}
                            onClick={
                              step.id === 'fetch' ? fetchRepo :
                              step.id === 'build' ? buildInput : generateDocs
                            }
                            tone={
                              state === 'active' ? 'active' :
                              state === 'done' ? 'done' :
                              state === 'pending' ? 'pending' :
                              'idle'
                            }>
                            {state === 'active' ? (
                              'Working'
                            ) : state === 'done' ? (
                              <><CheckCircle2 className="w-3.5 h-3.5" /> Done</>
                            ) : (
                              <><ArrowRight className="w-3.5 h-3.5" /> {step.label}</>
                            )}
                          </ShineButton>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>

            {/* Stage Timeline */}
            {loadingStep === 'generate' && pipelineMode === 'agentic' && (
              <CardContent className="p-0 mb-10">
                <div className="bg-muted/20 p-5 rounded-lg">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-cyan-accent" />
                      <span className="text-sm font-semibold text-foreground">Pipeline Progress</span>
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => { if (abortRef.current) abortRef.current.abort() }}
                      className="h-7 text-xs gap-1"
                    >
                      <AlertCircle className="w-3 h-3" /> Cancel
                    </Button>
                  </div>
                  <div className="space-y-1.5">
                    {PIPELINE_STAGES.map(stage => {
                      const s = pipelineStages[stage.id] || { status: 'pending', message: '' }
                      return (
                        <div key={stage.id} className="flex items-center gap-3 min-h-[24px]">
                          <div className={`w-2 h-2 rounded-full shrink-0 ${
                            s.status === 'completed' ? 'bg-emerald-400' :
                            s.status === 'active' ? 'bg-accent animate-pulse' :
                            'bg-muted-foreground/30'
                          }`} />
                          <span className={`text-xs font-mono ${
                            s.status === 'completed' ? 'text-emerald-400' :
                            s.status === 'active' ? 'text-foreground font-semibold' :
                            'text-muted-foreground'
                          }`}>
                            {stage.label}
                          </span>
                          {s.message && (
                            <span className={`text-[10px] font-mono ml-auto truncate ${
                              s.status === 'active' ? 'text-muted-foreground' : 'text-muted-foreground/50'
                            }`}>
                              {s.message}
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </CardContent>
            )}

            {/* Error */}
            {error && (
              <CardContent className="p-0 mb-10">
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

            {/* Output Area */}
            <CardContent className="p-0">
              <Tabs value={tab} onValueChange={setTab} className="w-full">
                <div className="flex items-center gap-2 mb-2">
                  <TabsList className="overflow-x-auto">
                    <TabsTrigger value="raw" className="text-xs font-mono gap-1">
                      <FileText className="w-3 h-3" /> Raw
                    </TabsTrigger>
                    <TabsTrigger value="rendered" className="text-xs font-mono gap-1">
                      <Eye className="w-3 h-3" /> Rendered
                    </TabsTrigger>
                    {states.generate && (
                      <TabsTrigger value="interactive" className="text-xs font-mono gap-1">
                        <Cog className="w-3 h-3" /> Interactive
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
                  <Suspense fallback={<div className="flex items-center justify-center min-h-[24rem] text-sm text-muted-foreground font-mono">Loading viewer...</div>}>
                    <DocViewer
                      markdown={output}
                      repoName={repoName || targetRepo}
                      onClose={() => setTab('rendered')}
                    />
                  </Suspense>
                </TabsContent>

                <TabsContent value="raw">
                  <pre className={`bg-background/60 border border-border/50 text-foreground p-4 rounded-xl overflow-auto min-h-[32rem] max-h-[56rem] text-xs leading-relaxed font-mono ${wordWrap ? 'whitespace-pre-wrap break-words' : ''}`}>
                    {output}
                  </pre>
                </TabsContent>

                <TabsContent value="rendered">
                  <div
                    ref={renderedRef}
                    className="rendered-output bg-background/60 border border-border/50 p-6 rounded-xl overflow-auto min-h-[32rem] max-h-[56rem] text-sm leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(output) }}
                  />
                </TabsContent>

                <TabsContent value="audit">
                  <div className="bg-background/60 border border-border/50 rounded-xl overflow-auto min-h-[32rem] max-h-[56rem]">
                    <AuditPanel auditSummary={auditSummary} />
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>

            {/* State indicators */}
            <CardContent className="p-0 mt-10">
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
              <CardContent className="p-0 mt-10">
                <div className="bg-muted/20 p-5 rounded-lg">
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
