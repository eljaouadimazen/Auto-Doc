import { useState } from 'react'

function FindingRow({ finding }) {
  const [open, setOpen] = useState(false)

  return (
    <div className={`audit-finding ${open ? 'audit-finding-open' : ''}`}>
      <button className="audit-finding-header" onClick={() => setOpen(!open)}>
        <span className="audit-finding-chevron">{open ? '▾' : '▸'}</span>
        <span className="audit-finding-icon">
          {finding.patterns && finding.patterns.length > 0 ? '🔴' : '🟢'}
        </span>
        <span className="audit-finding-file">{finding.file}</span>
        {finding.patterns && finding.patterns.length > 0 && (
          <span className="audit-finding-count">{finding.patterns.length} pattern{finding.patterns.length !== 1 ? 's' : ''}</span>
        )}
      </button>
      {open && finding.patterns && finding.patterns.length > 0 && (
        <div className="audit-finding-body">
          {finding.patterns.map((p, i) => (
            <span key={i} className="audit-pattern-badge">{p}</span>
          ))}
        </div>
      )}
      {open && (!finding.patterns || finding.patterns.length === 0) && (
        <div className="audit-finding-body">
          <span className="audit-pattern-clean">No secrets detected</span>
        </div>
      )}
    </div>
  )
}

export default function AuditPanel({ auditSummary }) {
  if (!auditSummary) {
    return (
      <div className="audit-panel">
        <div className="audit-panel-header">
          <span className="audit-panel-icon">🔒</span>
          <h3 className="audit-panel-title">Audit Logs</h3>
        </div>
        <div className="audit-empty">No audit logs available. Run the pipeline to generate audit data.</div>
      </div>
    )
  }

  const { filesScanned = 0, filesAffected = 0, totalRedacted = 0, findings = [], timestamp } = auditSummary
  const hasIssues = totalRedacted > 0

  return (
    <div className="audit-panel">
      <div className="audit-panel-header">
        <span className="audit-panel-icon">{hasIssues ? '🔒' : '🛡️'}</span>
        <h3 className="audit-panel-title">Audit Logs</h3>
        <span className={`audit-status-badge ${hasIssues ? 'audit-status-issues' : 'audit-status-clean'}`}>
          {hasIssues ? `${totalRedacted} secret(s) found` : 'Clean'}
        </span>
      </div>

      {timestamp && (
        <div className="audit-timestamp">{new Date(timestamp).toLocaleString()}</div>
      )}

      <div className="audit-stats">
        <div className="audit-stat">
          <div className="audit-stat-value">{filesScanned}</div>
          <div className="audit-stat-label">Files Scanned</div>
        </div>
        <div className="audit-stat">
          <div className="audit-stat-value">{filesAffected}</div>
          <div className="audit-stat-label">Files Affected</div>
        </div>
        <div className="audit-stat">
          <div className={`audit-stat-value ${hasIssues ? 'audit-stat-danger' : 'audit-stat-safe'}`}>
            {totalRedacted}
          </div>
          <div className="audit-stat-label">Secrets Redacted</div>
        </div>
      </div>

      {findings.length > 0 && (
        <div className="audit-findings">
          <div className="audit-findings-label">Per-file findings</div>
          {findings.map((f, i) => (
            <FindingRow key={i} finding={f} />
          ))}
        </div>
      )}

      {!hasIssues && filesScanned > 0 && (
        <div className="audit-clean-msg">✓ No secrets detected across all scanned files</div>
      )}
    </div>
  )
}
