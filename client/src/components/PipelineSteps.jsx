const steps = [
  { id: 'fetch',    label: 'Fetch content', step: 'STEP 1', color: '#60a5fa', bg: 'rgba(96,165,250,0.12)', border: 'rgba(96,165,250,0.25)', btnBg: '#2563eb', btnHover: '#3b82f6', handler: 'onFetch',    btnLabel: 'Fetch Repo',    needsRaw: false, needsMsgs: false },
  { id: 'build',    label: 'Build LLM Input & Sanitize',  step: 'STEP 2', color: '#fbbf24', bg: 'rgba(251,191,36,0.08)',  border: 'rgba(251,191,36,0.2)',  btnBg: '#d97706', btnHover: '#f59e0b', handler: 'onBuild',    btnLabel: 'Build Input',   needsRaw: true,  needsMsgs: false },
  { id: 'generate', label: 'Generate Docs',    step: 'STEP 3', color: '#22c55e', bg: 'rgba(34,197,94,0.08)',   border: 'rgba(34,197,94,0.2)',   btnBg: '#16a34a', btnHover: '#22c55e', handler: 'onGenerate', btnLabel: 'Generate Docs', needsRaw: true,  needsMsgs: true },
]

export default function PipelineSteps({ loading, raw, messages, onFetch, onBuild, onGenerate }) {
  const handlers = { onFetch, onBuild, onGenerate }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: '1.5rem' }}>
      {steps.map(s => {
        const disabled = loading || (s.needsRaw && !raw) || (s.needsMsgs && !messages)
        return (
          <div key={s.id} style={{
            background: s.bg, border: `1px solid ${s.border}`,
            borderRadius: 'var(--radius)', padding: '1rem'
          }}>
            <div style={{ fontSize: '.65rem', color: 'var(--text-muted)', letterSpacing: 2, marginBottom: 4 }}>{s.step}</div>
            <div style={{ fontSize: '.85rem', fontWeight: 600, color: s.color, marginBottom: 14, fontFamily: 'var(--font-display)' }}>{s.label}</div>
            <button
              onClick={handlers[s.handler]}
              disabled={disabled}
              style={{
                width: '100%', padding: '9px 0',
                background: disabled ? 'var(--bg-elevated)' : s.btnBg,
                border: `1px solid ${disabled ? 'var(--border)' : 'transparent'}`,
                borderRadius: 'var(--radius)', color: disabled ? 'var(--text-muted)' : '#fff',
                fontFamily: 'var(--font-mono)', fontSize: '.8rem', fontWeight: 500,
                cursor: disabled ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s',
                boxShadow: disabled ? 'none' : `0 0 16px ${s.border}`
              }}
              onMouseEnter={e => { if (!disabled) e.target.style.background = s.btnHover }}
              onMouseLeave={e => { if (!disabled) e.target.style.background = s.btnBg }}
            >
              {s.btnLabel}
            </button>
          </div>
        )
      })}
    </div>
  )
}