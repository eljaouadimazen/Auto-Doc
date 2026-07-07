import { useState, useRef } from 'react'

export const PIPELINE_STAGES = [
  { id: '1', label: 'Filtering files' },
  { id: '2', label: 'Security audit' },
  { id: 'graphify', label: 'Building dependency graph' },
  { id: '3', label: 'Analyzing project nature' },
  { id: '4', label: 'Selecting template' },
  { id: '7', label: 'Generating diagrams' },
  { id: '5', label: 'Analyzing code structure' },
  { id: '6', label: 'Writing documentation' },
]

export function useOutput() {
  const [output, setOutput] = useState('Ready. Paste a GitHub URL and click Fetch Repo.')
  const [messages, setMessages] = useState(null)
  const [sessionId, setSessionId] = useState(null)
  const [mode, setMode] = useState('')
  const [tab, setTab] = useState('raw')
  const [wordWrap, setWordWrap] = useState(false)
  const [copyText, setCopyText] = useState('Copy')
  const [pdfBase64, setPdfBase64] = useState(null)
  const [pipelineStages, setPipelineStages] = useState(
    Object.fromEntries(PIPELINE_STAGES.map(s => [s.id, { status: 'pending', message: '' }]))
  )
  const abortRef = useRef(null)
  const renderedRef = useRef(null)

  const resetOutput = () => {
    setOutput('Ready. Paste a GitHub URL and click Fetch Repo.')
    setMessages(null)
    setSessionId(null)
    setMode('')
    setPdfBase64(null)
    setTab('raw')
    setPipelineStages(
      Object.fromEntries(PIPELINE_STAGES.map(s => [s.id, { status: 'pending', message: '' }]))
    )
  }

  return {
    output, setOutput,
    messages, setMessages,
    sessionId, setSessionId,
    mode, setMode,
    tab, setTab,
    wordWrap, setWordWrap,
    copyText, setCopyText,
    pdfBase64, setPdfBase64,
    pipelineStages, setPipelineStages,
    abortRef,
    renderedRef,
    resetOutput,
  }
}
