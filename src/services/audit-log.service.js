/**
 * audit-log.service.js
 *
 * Records every sanitization event without storing sensitive values.
 * Audit entries are kept in memory and can be retrieved via /audit endpoint.
 *
 * Each entry records:
 *  - timestamp
 *  - repository name
 *  - which files had secrets
 *  - which pattern types matched
 *  - total redaction count
 *  - mode used (ast/raw)
 */

class AuditLogService {
  constructor() {
    this.logs    = [];       // in-memory store
    this.MAX_LOGS = 500;     // rolling cap to prevent memory leak
  }

  /**
   * Log a full pipeline run
   * @param {Object} entry
   * @param {string}   entry.repository
   * @param {string}   entry.ip
   * @param {string}   entry.mode          - 'ast' | 'raw'
   * @param {Array}    entry.fileAudits     - [{path, detectedPatterns[]}]
   * @param {number}   entry.totalRedacted
   */
  log(entry) {
    const record = {
      id:            this.logs.length + 1,
      timestamp:     new Date().toISOString(),
      repository:    entry.repository   || 'unknown',
      ip:            this.maskIP(entry.ip || 'unknown'),
      mode:          entry.mode         || 'unknown',
      totalRedacted: entry.totalRedacted || 0,
      filesAffected: (entry.fileAudits || []).filter(f => f.detectedPatterns.length > 0).length,
      findings:      (entry.fileAudits || [])
        .filter(f => f.detectedPatterns.length > 0)
        .map(f => ({
          file:     f.path,
          patterns: f.detectedPatterns   // e.g. ['api_key', 'github_pat']
        }))
    };

    this.logs.unshift(record);  // newest first

    // Rolling cap
    if (this.logs.length > this.MAX_LOGS) {
      this.logs = this.logs.slice(0, this.MAX_LOGS);
    }

    // Console output for development
    if (record.totalRedacted > 0) {
      console.warn(
        `[audit] ⚠ ${record.totalRedacted} secret(s) redacted in ${record.repository}`,
        record.findings.map(f => `${f.file}: ${f.patterns.join(', ')}`).join(' | ')
      );
    } else {
      console.info(`[audit] ✓ Clean scan — ${record.repository}`);
    }

    return record;
  }

  /**
   * Get all logs (optionally filtered)
   */
  getLogs({ limit = 50, onlyWithFindings = false } = {}) {
    let results = this.logs;
    if (onlyWithFindings) {
      results = results.filter(l => l.totalRedacted > 0);
    }
    return results.slice(0, limit);
  }

  /**
   * Get summary stats
   */
  getStats() {
    const total      = this.logs.length;
    const withIssues = this.logs.filter(l => l.totalRedacted > 0).length;
    const patternCounts = {};

    this.logs.forEach(log => {
      log.findings.forEach(f => {
        f.patterns.forEach(p => {
          patternCounts[p] = (patternCounts[p] || 0) + 1;
        });
      });
    });

    return {
      totalScans:      total,
      cleanScans:      total - withIssues,
      scansWithIssues: withIssues,
      topPatterns:     Object.entries(patternCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([pattern, count]) => ({ pattern, count }))
    };
  }

  /**
   * Mask IP for privacy — keep first two octets only
   * 192.168.1.100 → 192.168.x.x
   */
  maskIP(ip) {
    if (ip === 'unknown') return ip;
    const parts = ip.split('.');
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.x.x`;
    }
    return ip.substring(0, 8) + '...'; // IPv6 truncation
  }
}

module.exports = new AuditLogService();