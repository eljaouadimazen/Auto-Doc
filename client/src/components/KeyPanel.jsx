import { useState, useEffect, useRef } from 'react'

const GROQ_REGEX = /^gsk_[A-Za-z0-9]{20,}$/

export default function KeyPanel({ apiKey, setApiKey }) {
  const [visible,  setVisible]  = useState(false)
  const [badge,    setBadge]    = useState({ state: 'neutral', text: 'not set' })
  const [checking, setChecking] = useState(false)
  const timerRef = useRef(null)

  const validate = async (key) => {
    if (!key) { setBadge({ state: 'neutral', text: 'not set' }); return }
    if (!GROQ_REGEX.test(key)) {
      setBadge({ state: 'neutral', text: `${key.length} chars` }); return
    }
    setChecking(true)
    setBadge({ state: 'neutral', text: 'checking...' })
    try {
      const res  = await fetch('/validate-key', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': key } })
      const data = await res.json()
      setBadge(data.valid
        ? { state: 'valid',   text: '✓ valid' }
        : { state: 'invalid', text: '✗ ' + (data.reason || 'invalid') }
      )
    } catch {
      setBadge({ state: 'invalid', text: '✗ check failed' })
    } finally {
      setChecking(false)
    }
  }

  const handleInput = (val) => {
    setApiKey(val)
    clearTimeout(timerRef.current)
    if (!val) { setBadge({ state: 'neutral', text: 'not set' }); return }
    setBadge({ state: 'neutral', text: 'typing...' })
    timerRef.current = setTimeout(() => validate(val), 800)
  }

  const badgeColors = {
    valid:   { bg: 'rgba(34,197,94,0.1)',  color: '#22c55e', border: 'rgba(34,197,94,0.3)' },
    invalid: { bg: 'rgba(248,113,113,0.1)',color: '#f87171', border: 'rgba(248,113,113,0.3)' },
    neutral: { bg: 'var(--bg-elevated)',   color: 'var(--text-muted)', border: 'var(--border)' },
  }
  const bc = badgeColors[badge.state]

  return (
    <div style={{
      marginBottom: '1.5rem', padding: '1rem 1.2rem',
      background: 'var(--bg-surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: '.85rem', fontWeight: 500 }}>🔑 Groq API Key</span>
          <span style={{
            fontSize: '.7rem', padding: '2px 10px', borderRadius: 999,
            background: bc.bg, color: bc.color, border: `1px solid ${bc.border}`,
            fontFamily: 'var(--font-mono)', transition: 'all 0.2s'
          }}>
            {checking ? <span style={{ animation: 'pulse-dot 1s infinite' }}>checking...</span> : badge.text}
          </span>
        </div>
        <a
          href="https://console.groq.com/keys"
          target="_blank"
          rel="noreferrer"
          style={{ fontSize: '.72rem', color: 'var(--accent)', textDecoration: 'none', fontFamily: 'var(--font-mono)' }}
        >
          Get a free key ↗
        </a>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <input
            type={visible ? 'text' : 'password'}
            value={apiKey}
            onChange={e => handleInput(e.target.value)}
            placeholder="gsk_... (paste your Groq key)"
            style={{
              width: '100%', padding: '10px 14px',
              background: 'var(--bg-elevated)',
              border: `1px solid ${badge.state === 'valid' ? 'rgba(34,197,94,0.5)' : badge.state === 'invalid' ? 'rgba(248,113,113,0.4)' : 'var(--border)'}`,
              borderRadius: 'var(--radius)', color: 'var(--text-primary)',
              fontFamily: 'var(--font-mono)', fontSize: '.78rem', outline: 'none',
              transition: 'border-color 0.2s'
            }}
          />
        </div>
        <button
          onClick={() => setVisible(v => !v)}
          style={{
            padding: '10px 14px', background: 'var(--bg-elevated)',
            border: '1px solid var(--border)', borderRadius: 'var(--radius)',
            color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '.85rem',
            transition: 'all 0.15s'
          }}
          onMouseEnter={e => e.target.style.borderColor = 'var(--border-bright)'}
          onMouseLeave={e => e.target.style.borderColor = 'var(--border)'}
        >
          {visible ? '🙈' : '👁'}
        </button>
      </div>

      <p style={{ fontSize: '.7rem', color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.5 }}>
        Your key is never stored on the server — sent per request only.
        Leave empty to use the server default key.
      </p>
    </div>
  )
}