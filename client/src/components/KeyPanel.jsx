import { useState, useRef } from 'react'

const GROQ_REGEX = /^gsk_[A-Za-z0-9\-_.]{16,}$/

export default function KeyPanel({ apiKey, setApiKey }) {
  const [visible, setVisible] = useState(false)
  const [badge, setBadge] = useState({ state: 'neutral', text: 'not set' })
  const [checking, setChecking] = useState(false)
  const timerRef = useRef(null)

  const validate = async (key) => {
    if (!key) {
      setBadge({ state: 'neutral', text: 'not set' })
      return
    }
    if (!GROQ_REGEX.test(key)) {
      setBadge({ state: 'neutral', text: key.length + ' chars' })
      return
    }
    setChecking(true)
    setBadge({ state: 'neutral', text: 'checking...' })
    try {
      const res = await fetch('/validate-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key },
      })
      const data = await res.json()
      if (data.valid) {
        setBadge({ state: 'valid', text: 'valid' })
      } else {
        setBadge({ state: 'invalid', text: data.reason || 'invalid' })
      }
    } catch {
      setBadge({ state: 'invalid', text: 'check failed' })
    } finally {
      setChecking(false)
    }
  }

  const handleInput = (val) => {
    setApiKey(val)
    clearTimeout(timerRef.current)
    if (!val) {
      setBadge({ state: 'neutral', text: 'not set' })
      return
    }
    setBadge({ state: 'neutral', text: 'typing...' })
    timerRef.current = setTimeout(() => validate(val), 800)
  }

  const badgeStyle = {
    valid: {
      bg: 'var(--green-dim)',
      color: 'var(--green)',
      border: 'rgba(61,220,132,0.3)',
    },
    invalid: {
      bg: 'rgba(255,95,109,0.1)',
      color: 'var(--red)',
      border: 'rgba(255,95,109,0.3)',
    },
    neutral: {
      bg: 'var(--ink3)',
      color: 'var(--muted)',
      border: 'var(--border2)',
    },
  }

  const bc = badgeStyle[badge.state]

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              fontSize: '.8rem',
              fontFamily: 'var(--font-mono)',
              color: 'var(--text)',
            }}
          >
            Groq API Key
          </span>
          <span
            style={{
              fontSize: '.65rem',
              padding: '2px 8px',
              borderRadius: 99,
              background: bc.bg,
              color: bc.color,
              border: '1px solid ' + bc.border,
              fontFamily: 'var(--font-disp)',
              transition: 'all 0.2s',
              letterSpacing: '.5px',
            }}
          >
            {checking ? 'checking...' : badge.text}
          </span>
        </div>
        <a
          href="https://console.groq.com/keys"
          target="_blank"
          rel="noreferrer"
          style={{
            fontSize: '.68rem',
            color: 'var(--amber)',
            textDecoration: 'none',
            fontFamily: 'var(--font-disp)',
            letterSpacing: '1px',
          }}
        >
          get key
        </a>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type={visible ? 'text' : 'password'}
          className="ad-input"
          value={apiKey}
          onChange={(e) => handleInput(e.target.value)}
          placeholder="gsk_ paste your Groq key"
          style={{
            flex: 1,
            borderColor:
              badge.state === 'valid'
                ? 'rgba(61,220,132,0.5)'
                : badge.state === 'invalid'
                ? 'rgba(255,95,109,0.4)'
                : undefined,
          }}
        />
        <button
          onClick={() => setVisible((v) => !v)}
          style={{
            padding: '0 13px',
            background: 'var(--ink3)',
            border: '1px solid var(--border2)',
            borderRadius: 6,
            color: 'var(--muted)',
            cursor: 'pointer',
            fontSize: '.8rem',
            transition: 'all 0.15s',
            flexShrink: 0,
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.borderColor = 'var(--amber)')
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.borderColor = 'var(--border2)')
          }
        >
          {visible ? 'hide' : 'show'}
        </button>
      </div>

      <p
        style={{
          fontSize: '.65rem',
          color: 'var(--muted)',
          marginTop: 8,
          lineHeight: 1.5,
          fontFamily: 'var(--font-mono)',
        }}
      >
        Never stored. Sent per request only. Leave empty to use the server
        default.
      </p>
    </div>
  )
}