import { useEffect } from 'react'

let styleInjected = false

const STYLES = `
.seg-control {
  position: relative;
  display: flex;
  width: 100%;
  padding: 3px;
  border-radius: 10px;
  background: rgba(148, 163, 184, 0.12);
  border: 1px solid rgba(148, 163, 184, 0.2);
  isolation: isolate;
}
.seg-control .seg-thumb {
  position: absolute;
  top: 3px;
  bottom: 3px;
  left: 3px;
  border-radius: 7px;
  background: linear-gradient(135deg, #ff4f00, #ff8a3d);
  box-shadow: 0 0 14px -2px rgba(255, 79, 0, 0.55), 0 1px 2px rgba(0, 0, 0, 0.2);
  transition: transform 0.35s cubic-bezier(0.65, 0, 0.35, 1), width 0.35s cubic-bezier(0.65, 0, 0.35, 1);
  z-index: 0;
}
.seg-control button {
  position: relative;
  z-index: 1;
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  border: none;
  background: transparent;
  padding: 0.5rem 0.75rem;
  font-size: 0.8125rem;
  font-weight: 500;
  border-radius: 7px;
  cursor: pointer;
  color: var(--text-muted, #64748b);
  transition: color 0.25s ease;
}
.seg-control button.seg-active {
  color: #fff;
}
.seg-control button:focus-visible {
  outline: 2px solid #06b6d4;
  outline-offset: 2px;
}
.seg-control button svg {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}
`

export default function SegmentedControl({ options, value, onChange }) {
  useEffect(() => {
    if (!styleInjected) {
      styleInjected = true
      const style = document.createElement('style')
      style.textContent = STYLES
      document.head.appendChild(style)
    }
  }, [])

  const activeIndex = Math.max(0, options.findIndex(o => o.value === value))
  const widthPct = 100 / options.length

  return (
    <div className="seg-control" role="tablist">
      <span
        className="seg-thumb"
        style={{
          width: `calc(${widthPct}% - ${options.length === 1 ? 6 : 4}px)`,
          transform: `translateX(calc(${activeIndex * 100}% + ${activeIndex * 4}px))`,
        }}
      />
      {options.map(opt => {
        const Icon = opt.icon
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            className={active ? 'seg-active' : ''}
            onClick={() => onChange(opt.value)}
          >
            {Icon && <Icon />} {opt.label}
          </button>
        )
      })}
    </div>
  )
}
