import { useState, useRef, useCallback } from 'react'

export function useApiKey() {
  const [apiKey, setApiKeyState] = useState('')
  const [keyStatus, setKeyStatus] = useState('not set')
  const [provider, setProviderState] = useState('groq')
  const [pipelineMode, setPipelineMode] = useState('agentic')
  const keyTimer = useRef(null)

  const authHeaders = useCallback(() => {
    const headers = { 'Content-Type': 'application/json', 'x-provider': provider, 'x-mode': pipelineMode }
    if (apiKey.trim()) headers['x-api-key'] = apiKey.trim()
    return headers
  }, [apiKey, provider, pipelineMode])

  const validateKey = useCallback(async (keyToValidate) => {
    const key = (keyToValidate ?? '').trim()
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
  }, [provider])

  const handleApiKeyChange = useCallback((val) => {
    setApiKeyState(val)
    clearTimeout(keyTimer.current)
    if (!val.trim()) {
      setKeyStatus('not set')
      return
    }
    setKeyStatus('checking')
    keyTimer.current = setTimeout(() => validateKey(val), 800)
  }, [validateKey])

  const handleProviderChange = useCallback((newProvider) => {
    setProviderState(newProvider)
    if (newProvider === 'ollama') {
      setKeyStatus('not set')
      clearTimeout(keyTimer.current)
    } else if (apiKey.trim()) {
      validateKey(apiKey.trim())
    }
  }, [apiKey, validateKey])

  return {
    apiKey,
    setApiKey: handleApiKeyChange,
    keyStatus,
    provider,
    setProvider: handleProviderChange,
    pipelineMode,
    setPipelineMode,
    authHeaders,
  }
}
