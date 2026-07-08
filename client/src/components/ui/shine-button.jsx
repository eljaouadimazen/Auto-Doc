import { useEffect } from 'react'

let styleInjected = false

const STYLES = `
.shine-btn {
  position: relative;
  overflow: hidden;
  width: 100%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  border-radius: 8px;
  padding: 0.55rem 1rem;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid rgba(148, 163, 184, 0.25);
  background: rgba(148, 163, 184, 0.08);
  color: var(--text-secondary, #cbd5e1);
  transition: background 0.25s ease, border-color 0.25s ease, color 0.25s ease, transform 0.15s ease;
  isolation: isolate;
}
.shine-btn:active:not(:disabled) { transform: scale(0.98); }
.shine-btn:disabled { cursor: not-allowed; opacity: 0.45; }
.shine-btn svg { width: 14px; height: 14px; flex-shrink: 0; }

.shine-btn::before {
  content: "";
  position: absolute;
  top: 0;
  left: -60%;
  width: 40%;
  height: 100%;
  background: linear-gradient(115deg, transparent, rgba(255, 255, 255, 0.35), transparent);
  transform: skewX(-20deg);
  z-index: 1;
  pointer-events: none;
  transition: left 0.65s ease;
}
.shine-btn:hover:not(:disabled)::before { left: 130%; }

.shine-btn.tone-idle:hover:not(:disabled) {
  background: rgba(148, 163, 184, 0.14);
  border-color: rgba(148, 163, 184, 0.4);
}

.shine-btn.tone-active {
  background: linear-gradient(135deg, #ff4f00, #ff7a3d);
  border-color: rgba(255, 122, 61, 0.7);
  color: #fff;
  box-shadow: 0 0 18px -3px rgba(255, 79, 0, 0.55);
  animation: shine-pulse 2.2s ease-in-out infinite;
}
.shine-btn.tone-active::before { animation: shine-sweep 2.2s ease-in-out infinite; }

.shine-btn.tone-done {
  background: rgba(16, 185, 129, 0.08);
  border-color: rgba(16, 185, 129, 0.4);
  color: #6ee7b7;
}

.shine-btn.tone-pending {
  background: transparent;
  border-color: rgba(148, 163, 184, 0.15);
  color: var(--text-muted, #64748b);
}

@keyframes shine-sweep {
  0%, 15% { left: -60%; }
  60%, 100% { left: 130%; }
}
@keyframes shine-pulse {
  0%, 100% { box-shadow: 0 0 18px -3px rgba(255, 79, 0, 0.55); }
  50% { box-shadow: 0 0 26px 0px rgba(255, 79, 0, 0.8); }
}
`

export default function ShineButton({ tone = 'idle', disabled, onClick, className = '', children }) {
  useEffect(() => {
    if (!styleInjected) {
      styleInjected = true
      const style = document.createElement('style')
      style.textContent = STYLES
      document.head.appendChild(style)
    }
  }, [])

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`shine-btn tone-${tone} ${className}`}
    >
      {children}
    </button>
  )
}
