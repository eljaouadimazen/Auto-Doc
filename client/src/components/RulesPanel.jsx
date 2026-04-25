import { useState, useEffect } from 'react'

export default function RulesPanel({ apiKey }) {
  const [rules,       setRules]       = useState([])
  const [name,        setName]        = useState('')
  const [pattern,     setPattern]     = useState('')
  const [flags,       setFlags]       = useState('gi')
  const [testSample,  setTestSample]  = useState('')
  const [testResult,  setTestResult]  = useState(null)
  const [error,       setError]       = useState(null)
  const [adding,      setAdding]      = useState(false)
  const [testing,     setTesting]     = useState(false)

  const headers = {
    'Content-Type': 'application/json',
    ...(apiKey ? { 'x-api-key': apiKey } : {})
  }

  const fetchRules = async () => {
    try {
      const res  = await fetch('/rules', { headers })
      const data = await res.json()
      setRules(data.rules || [])
    } catch (err) {
      console.error('Failed to fetch rules', err)
    }
  }

  useEffect(() => { fetchRules() }, [])

  const addRule = async () => {
    if (!name.trim() || !pattern.trim()) {
      setError('Name and pattern are required')
      return
    }
    setError(null)
    setAdding(true)
    try {
      const res  = await fetch('/rules', {
        method: 'POST', headers,
        body: JSON.stringify({ name: name.trim(), pattern: pattern.trim(), flags })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to add rule')
      setName(''); setPattern(''); setFlags('gi'); setTestResult(null)
      await fetchRules()
    } catch (err) {
      setError(err.message)
    } finally {
      setAdding(false)
    }
  }

  const removeRule = async (id) => {
    try {
      await fetch(`/rules/${id}`, { method: 'DELETE', headers })
      await fetchRules()
    } catch (err) {
      console.error('Failed to remove rule', err)
    }
  }

  const testRule = async () => {
    if (!pattern.trim() || !testSample.trim()) return
    setTesting(true); setTestResult(null)
    try {
      const res  = await fetch('/rules/test', {
        method: 'POST', headers,
        body: JSON.stringify({ pattern: pattern.trim(), flags, sample: testSample })
      })
      const data = await res.json()
      setTestResult(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setTesting(false)
    }
  }

  return (
    <div style={{
      marginTop: '1.5rem', padding: '1.5rem',
      background: 'var(--bg-surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)'
    }}>
      {/* Header */}
      <div style={{ marginBottom: '1.2rem' }}>
        <span style={{ fontSize: '.9rem', fontWeight: 600, fontFamily: 'var(--font-display)' }}>
          🛡 Custom Sanitization Rules
        </span>
        <p style={{ fontSize: '.72rem', color: 'var(--text-muted)', marginTop: 4 }}>
          Add your own secret detection patterns. These run alongside the 21 built-in patterns.
        </p>
      </div>

      {/* Add rule form */}
      <div style={{
        padding: '1rem', marginBottom: '1rem',
        background: 'var(--bg-elevated)', border: '1px solid var(--border)',
        borderRadius: 8
      }}>
        <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', letterSpacing: 2, marginBottom: 10, textTransform: 'uppercase' }}>
          Add New Rule
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr auto', gap: 8, marginBottom: 8 }}>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Rule name"
            style={inputStyle}
          />
          <input
            value={pattern}
            onChange={e => { setPattern(e.target.value); setTestResult(null) }}
            placeholder="Regex pattern (e.g. MY_TOKEN_[A-Z0-9]{32})"
            style={inputStyle}
          />
          <input
            value={flags}
            onChange={e => setFlags(e.target.value)}
            placeholder="flags"
            style={{ ...inputStyle, width: 60 }}
          />
        </div>

        {/* Test area */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <input
            value={testSample}
            onChange={e => setTestSample(e.target.value)}
            placeholder="Paste sample text to test your pattern..."
            style={{ ...inputStyle, flex: 1 }}
          />
          <button
            onClick={testRule}
            disabled={!pattern || !testSample || testing}
            style={{
              ...btnStyle,
              background: 'var(--bg-surface)',
              color: 'var(--text-secondary)',
              borderColor: 'var(--border-bright)',
              opacity: (!pattern || !testSample) ? 0.4 : 1
            }}
          >
            {testing ? '...' : 'Test'}
          </button>
        </div>

        {/* Test result */}
        {testResult && (
          <div style={{
            padding: '8px 12px', marginBottom: 8, borderRadius: 6,
            background: testResult.matched ? 'rgba(34,197,94,0.08)' : 'rgba(248,113,113,0.08)',
            border: `1px solid ${testResult.matched ? 'rgba(34,197,94,0.2)' : 'rgba(248,113,113,0.2)'}`,
            fontSize: '.72rem', fontFamily: 'var(--font-mono)'
          }}>
            {testResult.matched ? (
              <>
                <span style={{ color: 'var(--accent)' }}>✓ {testResult.count} match{testResult.count > 1 ? 'es' : ''} found</span>
                <div style={{ marginTop: 6, color: 'var(--text-muted)' }}>
                  Preview: <span style={{ color: '#fbbf24' }}>{testResult.preview}</span>
                </div>
              </>
            ) : (
              <span style={{ color: '#f87171' }}>✗ No matches — check your pattern</span>
            )}
          </div>
        )}

        {error && (
          <div style={{
            padding: '6px 10px', marginBottom: 8, borderRadius: 6,
            background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)',
            color: '#f87171', fontSize: '.72rem', fontFamily: 'var(--font-mono)'
          }}>
            {error}
          </div>
        )}

        <button
          onClick={addRule}
          disabled={adding || !name || !pattern}
          style={{
            ...btnStyle,
            background: (!name || !pattern) ? 'var(--bg-elevated)' : 'var(--accent-dim)',
            color: (!name || !pattern) ? 'var(--text-muted)' : '#fff',
            opacity: adding ? 0.7 : 1
          }}
        >
          {adding ? 'Adding...' : '+ Add Rule'}
        </button>
      </div>

      {/* Existing rules */}
      {rules.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '.78rem', padding: '1rem' }}>
          No custom rules yet — add one above
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {rules.map(rule => (
            <div key={rule.id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 14px',
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              borderRadius: 8
            }}>
              <div>
                <span style={{ fontSize: '.8rem', color: 'var(--accent)', fontWeight: 500 }}>
                  {rule.name}
                </span>
                <span style={{
                  marginLeft: 10, fontSize: '.72rem', color: 'var(--text-muted)',
                  fontFamily: 'var(--font-mono)'
                }}>
                  /{rule.pattern}/{rule.flags}
                </span>
              </div>
              <button
                onClick={() => removeRule(rule.id)}
                style={{
                  padding: '3px 10px', borderRadius: 6,
                  border: '1px solid rgba(248,113,113,0.3)',
                  background: 'rgba(248,113,113,0.08)', color: '#f87171',
                  fontFamily: 'var(--font-mono)', fontSize: '.7rem', cursor: 'pointer'
                }}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const inputStyle = {
  padding: '8px 12px',
  background: 'var(--bg-surface)', border: '1px solid var(--border)',
  borderRadius: 6, color: 'var(--text-primary)',
  fontFamily: 'var(--font-mono)', fontSize: '.75rem', outline: 'none',
  width: '100%'
}

const btnStyle = {
  padding: '8px 16px', borderRadius: 6,
  border: '1px solid transparent',
  fontFamily: 'var(--font-mono)', fontSize: '.75rem',
  cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap'
}