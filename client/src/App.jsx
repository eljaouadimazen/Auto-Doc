import { useState } from 'react'
import { useTheme } from '@/hooks/useTheme'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  FileSearch, Lock, RefreshCw, GitMerge, Sun, Moon, Menu, X,
} from 'lucide-react'
import Pipeline from './components/Pipeline'
import ErrorBoundary from './components/ErrorBoundary'
import RainBackground from './components/RainBackground'
import './App.css'

function Navbar({ theme, onToggleTheme }) {
  const [menuOpen, setMenuOpen] = useState(false)

  const closeMenu = () => setMenuOpen(false)

  return (
    <nav className="sticky top-0 z-50 border-b border-border/50 bg-background/70 backdrop-blur-xl">
      <div className="max-w-6xl mx-auto px-4 sm:px-8 flex items-center justify-between h-16">
        <a href="#" className="text-xl font-semibold tracking-tight text-foreground">Auto-Doc</a>
        <div className="flex items-center gap-2 sm:gap-4">
          <ul className="hidden sm:flex items-center gap-8 list-none m-0 p-0">
            <li><a href="#pipeline" onClick={closeMenu} className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Pipeline</a></li>
            <li><a href="#features" onClick={closeMenu} className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">Features</a></li>
            <li><a href="https://github.com/eljaouadimazen/Auto-Doc" target="_blank" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">GitHub</a></li>
          </ul>
          <Button
            variant="ghost"
            size="sm"
            onClick={onToggleTheme}
            className="w-9 h-9 p-0"
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setMenuOpen(!menuOpen)}
            className="sm:hidden w-9 h-9 p-0"
            aria-label="Toggle menu"
          >
            {menuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </Button>
        </div>
      </div>
      {menuOpen && (
        <div className="sm:hidden border-t border-border/50 bg-background/95 backdrop-blur-xl">
          <ul className="list-none m-0 p-4 space-y-2">
            <li><a href="#pipeline" onClick={closeMenu} className="block px-4 py-3 rounded-lg text-sm font-medium text-foreground hover:bg-muted/30 transition-colors">Pipeline</a></li>
            <li><a href="#features" onClick={closeMenu} className="block px-4 py-3 rounded-lg text-sm font-medium text-foreground hover:bg-muted/30 transition-colors">Features</a></li>
            <li><a href="https://github.com/eljaouadimazen/Auto-Doc" target="_blank" className="block px-4 py-3 rounded-lg text-sm font-medium text-foreground hover:bg-muted/30 transition-colors">GitHub</a></li>
          </ul>
        </div>
      )}
    </nav>
  )
}

function Features() {
  const features = [
    { icon: FileSearch, title: 'AST Mode Parsing', desc: 'Extracts imports, classes, methods, routes, and env vars. ~95% token reduction with higher quality LLM output.' },
    { icon: Lock, title: 'Secret Sanitization', desc: 'Double-pass sanitization catches API keys, tokens, and credentials before content reaches the LLM. Full audit logs.' },
    { icon: RefreshCw, title: 'CI/CD Automation', desc: 'Trigger on push to main/master/dev. Semantic diff detects structural changes — only regenerates when needed.' },
    { icon: GitMerge, title: 'Multi-Agent Orchestration', desc: 'EnforcedOrchestrator coordinates fetching, sanitization, parsing, and LLM generation in a reliable pipeline.' },
  ]

  return (
      <section id="features" className="py-28 border-b border-border/50">
      <div className="max-w-6xl mx-auto px-4 sm:px-8">
        <div className="text-center mb-12">
          <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground mb-3">Features</p>
          <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight text-foreground">Built for developer workflows</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map(f => {
            const Icon = f.icon
            return (
              <Card key={f.title} className="border-border/50 bg-card/60 backdrop-blur-sm hover:border-strong/50 hover:-translate-y-1 hover:shadow-xl transition-all duration-300 group">
                <CardContent className="p-8">
                      <div className="w-10 h-10 rounded-lg bg-accent/10 border border-accent/20 flex items-center justify-center mb-5 group-hover:bg-accent/20 group-hover:scale-110 transition-all duration-300">
                        <Icon className="w-5 h-5 text-accent" />
                      </div>
                      <h3 className="text-base font-semibold mb-2.5 text-foreground">{f.title}</h3>
                      <p className="text-sm text-muted-foreground/80 leading-relaxed">{f.desc}</p>
                  </CardContent>
                </Card>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="bg-background/50 backdrop-blur-xl border-t border-border/50 py-12">
      <div className="max-w-6xl mx-auto px-4 sm:px-8">
        <div className="flex flex-wrap justify-between items-start gap-12">
          <div>
            <div className="text-lg font-semibold text-foreground mb-2">Auto-Doc</div>
            <p className="text-sm text-muted-foreground/70 max-w-xs leading-relaxed">
              Automated documentation pipeline powered by multi-agent orchestration and LLMs.
            </p>
          </div>
          <div className="flex gap-16 flex-wrap">
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">Product</h4>
              <ul className="list-none p-0 m-0 space-y-2.5">
                <li><a href="#pipeline" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Pipeline</a></li>
                <li><a href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Features</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">Resources</h4>
              <ul className="list-none p-0 m-0 space-y-2.5">
                <li><a href="https://github.com/eljaouadimazen/Auto-Doc" target="_blank" className="text-sm text-muted-foreground hover:text-foreground transition-colors">GitHub Repo</a></li>
                <li><a href="https://eljaouadimazen.github.io/Auto-Doc/" target="_blank" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Live Demo</a></li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}

function App() {
  const { theme, toggleTheme } = useTheme()

  return (
    <ErrorBoundary>
      <RainBackground />
      <Navbar theme={theme} onToggleTheme={toggleTheme} />
      <Pipeline />
      <Features />
      <Footer />
    </ErrorBoundary>
  )
}

export default App
