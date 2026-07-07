import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'

export default function AuditPanel({ auditSummary }) {
  if (!auditSummary) {
    return (
      <Card className="mt-6 border-border bg-card/60 backdrop-blur-sm">
        <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-base w-8 h-8 flex items-center justify-center bg-muted/50 border border-border rounded-lg shrink-0">🔒</span>
              <h3 className="text-sm font-semibold m-0 text-foreground">Audit Logs</h3>
            </div>
            <div className="text-center py-4 text-xs text-muted-foreground font-mono">
              No audit logs available. Run the pipeline to generate audit data.
            </div>
          </CardContent>
        </Card>
    )
  }

  const { filesScanned = 0, filesAffected = 0, totalRedacted = 0, findings = [], timestamp } = auditSummary
  const hasIssues = totalRedacted > 0

  return (
      <Card className="mt-6 border-border bg-card/60 backdrop-blur-sm">
        <CardContent className="p-6">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-base w-8 h-8 flex items-center justify-center bg-muted/50 border border-border rounded-lg shrink-0">
            {hasIssues ? '🔒' : '🛡️'}
          </span>
          <h3 className="text-sm font-semibold m-0 flex-1 text-foreground">Audit Logs</h3>
          <Badge variant={hasIssues ? 'destructive' : 'success'}>
            {hasIssues ? `${totalRedacted} secret(s) found` : 'Clean'}
          </Badge>
        </div>

        {timestamp && (
          <div className="text-xs text-muted-foreground font-mono mb-4 pl-2">
            {new Date(timestamp).toLocaleString()}
          </div>
        )}

        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="text-center bg-background/40 border border-border/50 rounded-lg p-3">
            <div className="text-xl font-bold font-mono text-foreground">{filesScanned}</div>
            <div className="text-[11px] text-muted-foreground font-mono uppercase tracking-wider mt-1">Files Scanned</div>
          </div>
          <div className="text-center bg-background/40 border border-border/50 rounded-lg p-3">
            <div className="text-xl font-bold font-mono text-foreground">{filesAffected}</div>
            <div className="text-[11px] text-muted-foreground font-mono uppercase tracking-wider mt-1">Files Affected</div>
          </div>
          <div className="text-center bg-background/40 border border-border/50 rounded-lg p-3">
            <div className={`text-xl font-bold font-mono ${hasIssues ? 'text-destructive' : 'text-emerald-400'}`}>
              {totalRedacted}
            </div>
            <div className="text-[11px] text-muted-foreground font-mono uppercase tracking-wider mt-1">Secrets Redacted</div>
          </div>
        </div>

        {findings.length > 0 && (
          <div className="border-t border-border/50 pt-3">
            <div className="text-[11px] text-muted-foreground font-mono uppercase tracking-wider mb-2">
              Per-file findings
            </div>
            <Accordion type="multiple" className="space-y-1">
              {findings.map((f, i) => (
                <AccordionItem key={i} value={`item-${i}`} className="border border-border/50 rounded-md overflow-hidden">
                  <AccordionTrigger className="px-2.5 py-2 text-xs font-mono text-foreground hover:no-underline hover:bg-muted/30 [&[data-state=open]]:bg-muted/20">
                    <span className="flex items-center gap-2">
                      <span>{f.patterns && f.patterns.length > 0 ? '🔴' : '🟢'}</span>
                      <span className="font-medium truncate">{f.file}</span>
                      {f.patterns && f.patterns.length > 0 && (
                        <span className="text-[11px] text-muted-foreground bg-muted/30 px-1.5 py-0.5 rounded-full ml-auto">
                          {f.patterns.length} pattern{f.patterns.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="px-2.5 pb-2.5">
                    <div className="flex flex-wrap gap-1">
                      {f.patterns && f.patterns.length > 0 ? (
                        f.patterns.map((p, j) => (
                          <span key={j} className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-destructive/10 text-destructive-foreground border border-destructive/30">
                            {p}
                          </span>
                        ))
                      ) : (
                        <span className="text-[11px] font-mono text-emerald-400">No secrets detected</span>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        )}

        {!hasIssues && filesScanned > 0 && (
          <div className="mt-3 p-2.5 rounded-md text-xs font-mono text-center bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            ✓ No secrets detected across all scanned files
          </div>
        )}
      </CardContent>
    </Card>
  )
}
