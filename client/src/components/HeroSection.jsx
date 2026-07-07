import { Sparkles, Terminal, ArrowRight, PlayCircle } from 'lucide-react'

const STATS = [
  { value: '12,400+', label: 'Repos Documented' },
  { value: '847M', label: 'Lines Parsed' },
  { value: '15+', label: 'Languages' },
  { value: '8.2 hrs', label: 'Avg. Time Saved' },
]

export default function HeroSection({ onStartClick, onHowItWorksClick }) {
  return (
      <section className="relative pt-36 pb-12 ...">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(255,79,0,0.08)_0%,_transparent_60%)] animate-gradient-shift bg-[length:200%_200%]" />
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9InJnYmEoMTQ4LDE2MywxODQsMC4wMykiPjxwYXRoIGQ9Ik0zNiAxOGMwLTkuOTQgOC4wNi0xOCAxOC0xOGgtMTJjLTMuMzE0IDAtNiAyLjY4Ni02IDZ2MTJ6bTAgMGwxMiAxMmgtMTJsLTEyLTEyaDEyeiIvPjwvZz48L2c+PC9zdmc+')] opacity-40" />

      <div className="max-w-6xl mx-auto px-4 sm:px-8 relative">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 mb-8 rounded-full border border-border/50 bg-background/40 backdrop-blur-sm text-xs text-muted-foreground font-mono">
          <Sparkles className="w-3.5 h-3.5 text-cyan-accent" />
          Automated Documentation Pipeline
        </div>

        <h1 className="text-5xl sm:text-6xl lg:text-7xl font-semibold leading-[0.9] tracking-tight mb-6">
          <span className="text-foreground">Turn your source code</span>
          <br />
          <span className="bg-gradient-to-r from-accent to-cyan-accent bg-clip-text text-transparent">
            into living documentation
          </span>
        </h1>

        <p className="text-lg sm:text-xl text-muted-foreground/80 max-w-2xl mx-auto leading-relaxed mb-10">
          Auto-Doc parses your GitHub repository through an agentic multi-agent pipeline —
          fetching, sanitizing, and generating accurate docs powered by LLMs.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-14">
          <button
            onClick={onStartClick}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-accent text-accent-foreground text-sm font-semibold hover:bg-accent/90 transition-colors"
          >
            Start Documenting <ArrowRight className="w-4 h-4" />
          </button>
          <button
            onClick={onHowItWorksClick}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-border/50 bg-background/40 text-sm font-medium text-foreground hover:bg-muted/30 transition-colors"
          >
            <PlayCircle className="w-4 h-4" /> See How It Works
          </button>
        </div>

        {/* Terminal preview */}
        <div className="max-w-3xl mx-auto text-left rounded-xl border border-border/50 bg-background/60 backdrop-blur-xl overflow-hidden shadow-2xl shadow-black/20 mb-14">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/50 bg-muted/20">
              <span className="w-2.5 h-2.5 rounded-full bg-destructive/60" />
              <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/60" />
              <span className="ml-2 flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
                <Terminal className="w-3 h-3" /> autodoc generate --repo github.com/acme/api
              </span>
            </div>
            <pre className="p-5 text-xs sm:text-[13px] font-mono leading-relaxed overflow-x-auto">
              <span className="text-cyan-accent">$</span> autodoc generate --repo github.com/acme/platform-api{'\n'}
              <span className="text-muted-foreground">[INFO]</span> Cloning repository... done{'\n'}
              <span className="text-muted-foreground">[INFO]</span> Parsing 1,247 files across 23 packages...{'\n'}
              <span className="text-muted-foreground">[INFO]</span> AST analysis complete — 412 functions, 89 interfaces, 156 types{'\n'}
              <span className="text-muted-foreground">[INFO]</span> Multi-agent pipeline executing...{'\n'}
              <span className="text-muted-foreground">[INFO]</span> Generating API reference, architecture guide, quick start{'\n'}
              <span className="text-emerald-400">[SUCCESS]</span> Documentation published to <span className="text-accent underline">docs.acme.dev</span>{'\n'}
              <span className="text-muted-foreground/60">Completed in 14.3s · 6 agents · 847 LLM calls</span>
          </pre>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 sm:gap-8 max-w-3xl mx-auto">
          {STATS.map(s => (
            <div key={s.label}>
              <div className="text-2xl sm:text-3xl font-semibold text-foreground">{s.value}</div>
              <div className="text-[11px] uppercase tracking-widest text-muted-foreground font-mono mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}