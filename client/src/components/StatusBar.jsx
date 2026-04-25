export default function StatusBar({ loading, message, error, mode, auditSummary }) {
  return (
    <div style={{ marginBottom: '1rem' }}>

      {/* Loading */}
      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, padding: '8px 12px', background: 'rgba(34,197,94,0.05)', borderRadius: 8 }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {[0, 1, 2].map(i => (
              <span key={i} style={{
                width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)',
                display: 'inline-block',
                animation: `pulse-dot 1.2s ease-in-out ${i * 0.2}s infinite`
              }} />
            ))}
          </div>
          <span style={{ fontSize: '.78rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{message}</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{
          padding: '10px 14px', marginBottom: 10,
          background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.25)',
          borderRadius: 8, color: '#f87171', fontSize: '.8rem', fontFamily: 'var(--font-mono)'
        }}>
          ⚠ {error}
        </div>
      )}

      {/* Mode badge + audit */}
      {mode && !loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
          <span style={{
            fontSize: '.7rem', padding: '3px 12px', borderRadius: 999,
            background: mode === 'ast' ? 'rgba(34,197,94,0.1)' : 'var(--bg-elevated)',
            color: mode === 'ast' ? 'var(--accent)' : 'var(--text-muted)',
            border: `1px solid ${mode === 'ast' ? 'rgba(34,197,94,0.3)' : 'var(--border)'}`,
            fontFamily: 'var(--font-mono)'
          }}>
            {mode === 'ast' ? '⚡ AST mode' : '📄 Raw mode'}
          </span>

          {auditSummary && (
            <span style={{
              fontSize: '.7rem', padding: '3px 12px', borderRadius: 999,
              background: auditSummary.totalRedacted > 0 ? 'rgba(251,191,36,0.1)' : 'rgba(34,197,94,0.06)',
              color: auditSummary.totalRedacted > 0 ? '#fbbf24' : 'var(--accent)',
              border: `1px solid ${auditSummary.totalRedacted > 0 ? 'rgba(251,191,36,0.3)' : 'rgba(34,197,94,0.2)'}`,
              fontFamily: 'var(--font-mono)'
            }}>
              {auditSummary.totalRedacted > 0
                ? `⚠ ${auditSummary.totalRedacted} secret(s) redacted`
                : `✓ ${auditSummary.filesScanned} files clean`}
            </span>
          )}
        </div>
      )}
    </div>
  )
}