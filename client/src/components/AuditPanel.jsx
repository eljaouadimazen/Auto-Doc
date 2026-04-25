import { useState, useEffect } from 'react'

export default function AuditPanel({ apiKey }) {
  const [logs,    setLogs]    = useState([])
  const [stats,   setStats]   = useState(null)
  const [loading, setLoading] = useState(false)
  const [filter,  setFilter]  = useState('all') // 'all' | 'issues'

  const fetchLogs = async () => {
    setLoading(true)
    try {
      const onlyIssues = filter === 'issues' ? 'true' : 'false'
      const res  = await fetch(`/audit?limit=20&onlyIssues=${onlyIssues}`, {
        headers: { 'Content-Type': 'application/json', ...(apiKey ? { 'x-api-key': apiKey } : {}) }
      })
      const data = await res.json()
      setLogs(data.logs || [])
      setStats(data.stats || null)
    } catch (err) {
      console.error('Failed to fetch audit logs', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchLogs() }, [filter])

  return (
    <div style={{
      marginTop: '2rem', padding: '1.5rem',
      background: 'var(--bg-surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius)'
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: '.9rem', fontWeight: 600, fontFamily: 'var(--font-display)' }}>
            🔍 Audit Log
          </span>
          {stats && (
            <div style={{ display: 'flex', gap: 6 }}>
              <Badge color="accent" text={`${stats.totalScans} scans`} />
              {stats.scansWithIssues > 0 && (
                <Badge color="yellow" text={`${stats.scansWithIssues} with secrets`} />
              )}
              <Badge color="green" text={`${stats.cleanScans} clean`} />
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {['all', 'issues'].map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: '4px 12px', borderRadius: 999, border: '1px solid',
              borderColor: filter === f ? 'var(--accent)' : 'var(--border)',
              background:  filter === f ? 'rgba(34,197,94,0.1)' : 'transparent',
              color:       filter === f ? 'var(--accent)' : 'var(--text-muted)',
              fontFamily: 'var(--font-mono)', fontSize: '.7rem', cursor: 'pointer'
            }}>
              {f === 'all' ? 'All scans' : 'Issues only'}
            </button>
          ))}
          <button onClick={fetchLogs} style={{
            padding: '4px 12px', borderRadius: 999,
            border: '1px solid var(--border)', background: 'transparent',
            color: 'var(--text-muted)', fontFamily: 'var(--font-mono)',
            fontSize: '.7rem', cursor: 'pointer'
          }}>
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Top patterns */}
      {stats?.topPatterns?.length > 0 && (
        <div style={{
          marginBottom: '1rem', padding: '10px 14px',
          background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.2)',
          borderRadius: 8
        }}>
          <div style={{ fontSize: '.7rem', color: '#fbbf24', marginBottom: 6, fontFamily: 'var(--font-mono)' }}>
            TOP DETECTED PATTERNS
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {stats.topPatterns.map(p => (
              <span key={p.pattern} style={{
                fontSize: '.7rem', padding: '2px 10px', borderRadius: 999,
                background: 'rgba(251,191,36,0.1)', color: '#fbbf24',
                border: '1px solid rgba(251,191,36,0.25)', fontFamily: 'var(--font-mono)'
              }}>
                {p.pattern} × {p.count}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Log entries */}
      {loading ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '.8rem', padding: '1rem' }}>
          Loading...
        </div>
      ) : logs.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '.8rem', padding: '1rem' }}>
          No scans yet — run the pipeline to see results here
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {logs.map(log => (
            <LogEntry key={log.id} log={log} />
          ))}
        </div>
      )}
    </div>
  )
}

function LogEntry({ log }) {
  const [expanded, setExpanded] = useState(false)
  const hasIssues = log.totalRedacted > 0

  return (
    <div style={{
      padding: '10px 14px',
      background: hasIssues ? 'rgba(251,191,36,0.04)' : 'rgba(34,197,94,0.03)',
      border: `1px solid ${hasIssues ? 'rgba(251,191,36,0.2)' : 'var(--border)'}`,
      borderRadius: 8, cursor: log.findings?.length > 0 ? 'pointer' : 'default'
    }} onClick={() => log.findings?.length > 0 && setExpanded(e => !e)}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: '.85rem' }}>{hasIssues ? '⚠' : '✓'}</span>
          <span style={{
            fontSize: '.78rem', color: 'var(--text-primary)',
            fontFamily: 'var(--font-mono)'
          }}>
            {log.repository}
          </span>
          {hasIssues && (
            <span style={{
              fontSize: '.68rem', padding: '1px 8px', borderRadius: 999,
              background: 'rgba(251,191,36,0.1)', color: '#fbbf24',
              border: '1px solid rgba(251,191,36,0.25)', fontFamily: 'var(--font-mono)'
            }}>
              {log.totalRedacted} secret{log.totalRedacted > 1 ? 's' : ''} redacted
            </span>
          )}
          <span style={{
            fontSize: '.68rem', padding: '1px 8px', borderRadius: 999,
            background: 'var(--bg-elevated)', color: 'var(--text-muted)',
            border: '1px solid var(--border)', fontFamily: 'var(--font-mono)'
          }}>
            {log.mode}
          </span>
        </div>
        <span style={{ fontSize: '.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          {new Date(log.timestamp).toLocaleTimeString()}
        </span>
      </div>

      {expanded && log.findings?.length > 0 && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
          {log.findings.map((f, i) => (
            <div key={i} style={{ fontSize: '.72rem', color: 'var(--text-muted)', marginBottom: 4 }}>
              <span style={{ color: '#fbbf24' }}>{f.file}</span>
              {' → '}
              {f.patterns.map(p => (
                <span key={p} style={{
                  marginLeft: 4, padding: '1px 6px', borderRadius: 4,
                  background: 'rgba(251,191,36,0.1)', color: '#fbbf24',
                  fontFamily: 'var(--font-mono)', fontSize: '.68rem'
                }}>{p}</span>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Badge({ color, text }) {
  const colors = {
    accent: { bg: 'rgba(34,197,94,0.1)',  color: 'var(--accent)', border: 'rgba(34,197,94,0.2)' },
    yellow: { bg: 'rgba(251,191,36,0.1)', color: '#fbbf24',       border: 'rgba(251,191,36,0.2)' },
    green:  { bg: 'rgba(34,197,94,0.06)', color: '#4ade80',       border: 'rgba(34,197,94,0.15)' },
  }
  const c = colors[color]
  return (
    <span style={{
      fontSize: '.68rem', padding: '2px 8px', borderRadius: 999,
      background: c.bg, color: c.color, border: `1px solid ${c.border}`,
      fontFamily: 'var(--font-mono)'
    }}>
      {text}
    </span>
  )
}