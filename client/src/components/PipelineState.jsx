export default function PipelineState({ state }) {
  const steps = [
    { key: 'fetch',    label: 'fetch',    color: '#60a5fa' },
    { key: 'build',    label: 'build',    color: '#fbbf24' },
    { key: 'generate', label: 'generate', color: '#22c55e' },
  ]

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 24 }}>
      {steps.map((s, i) => (
        <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{
            fontSize: '.72rem', fontFamily: 'var(--font-mono)',
            color: state[s.key] ? s.color : 'var(--text-muted)',
            fontWeight: state[s.key] ? 600 : 400,
            transition: 'all 0.3s'
          }}>
            {state[s.key] ? '●' : '○'} {s.label}
          </span>
          {i < steps.length - 1 && (
            <span style={{ color: 'var(--border-bright)', fontSize: '.8rem' }}>→</span>
          )}
        </div>
      ))}
    </div>
  )
}