import { useEffect } from 'react'

let styleInjected = false

const STYLES = `
.pill-toggle {
  --pt-w: 52px;
  --pt-h: 28px;
  position: relative;
  display: inline-flex;
  align-items: center;
  width: var(--pt-w);
  height: var(--pt-h);
  border-radius: 999px;
  cursor: pointer;
  flex-shrink: 0;
}
.pill-toggle input {
  position: absolute;
  opacity: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  cursor: pointer;
  z-index: 2;
}
.pill-toggle .pt-track {
  position: absolute;
  inset: 0;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.25);
  border: 1px solid rgba(148, 163, 184, 0.3);
  transition: background 0.35s ease, border-color 0.35s ease, box-shadow 0.35s ease;
}
.pill-toggle input:checked ~ .pt-track {
  background: linear-gradient(90deg, #ff4f00, #ff8a3d);
  border-color: rgba(255, 122, 61, 0.6);
  box-shadow: 0 0 12px 1px rgba(255, 79, 0, 0.45), inset 0 0 6px rgba(255, 255, 255, 0.25);
}
.pill-toggle input:focus-visible ~ .pt-track {
  outline: 2px solid #06b6d4;
  outline-offset: 2px;
}
.pill-toggle .pt-thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: calc(var(--pt-h) - 6px);
  height: calc(var(--pt-h) - 6px);
  border-radius: 50%;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.35s ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
}
.pill-toggle input:checked ~ .pt-thumb {
  transform: translateX(calc(var(--pt-w) - var(--pt-h)));
  box-shadow: 0 0 8px rgba(255, 255, 255, 0.6);
}
.pill-toggle .pt-thumb svg {
  width: 12px;
  height: 12px;
  color: rgba(148, 163, 184, 0.9);
  transition: color 0.35s ease, transform 0.35s ease;
}
.pill-toggle input:checked ~ .pt-thumb svg {
  color: #ff4f00;
  transform: rotate(180deg) scale(1.1);
}
`

export default function PillToggle({ checked, onCheckedChange, id, icon: Icon, 'aria-label': ariaLabel }) {
  useEffect(() => {
    if (!styleInjected) {
      styleInjected = true
      const style = document.createElement('style')
      style.textContent = STYLES
      document.head.appendChild(style)
    }
  }, [])

  return (
    <label className="pill-toggle" htmlFor={id}>
      <input
        type="checkbox"
        id={id}
        role="switch"
        checked={checked}
        aria-checked={checked}
        aria-label={ariaLabel}
        onChange={e => onCheckedChange(e.target.checked)}
      />
      <span className="pt-track" />
      <span className="pt-thumb">{Icon && <Icon />}</span>
    </label>
  )
}
