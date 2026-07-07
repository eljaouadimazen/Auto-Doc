import { useEffect } from "react";

let styleInjected = false;

const STYLES = `
@keyframes spin-glow {
  to { --angle: 360deg; }
}
@property --angle {
  syntax: '<angle>';
  initial-value: 0deg;
  inherits: false;
}
.glow-card-wrap {
  position: relative;
  border-radius: 14px;
  padding: 1px;
  isolation: isolate;
}
.glow-card-wrap::before {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: 14px;
  padding: 1px;
  background: conic-gradient(from var(--angle), transparent 0%, transparent 65%, #ff7a3d 85%, #ffb347 92%, transparent 100%);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  animation: spin-glow 4s linear infinite;
  opacity: 0.55;
  transition: opacity 0.25s ease;
  z-index: 0;
}
.glow-card-wrap:hover::before,
.glow-card-wrap.active::before {
  opacity: 1;
  animation-duration: 2.2s;
}
.glow-card-wrap.active::before {
  background: conic-gradient(from var(--angle), transparent 0%, #ff5a1f 0%, #ff8c42 50%, #ff5a1f 100%);
  opacity: 1;
}
.glow-card {
  position: relative;
  z-index: 1;
  border-radius: 13px;
  height: 100%;
  transition: box-shadow 0.25s ease;
}
.glow-card-wrap.active .glow-card {
  box-shadow: 0 0 24px -4px rgba(255, 122, 61, 0.25), inset 0 0 20px -10px rgba(255, 122, 61, 0.15);
}
`;

export default function NeonGlowCard({ children, active = false, className = '', onClick }) {
  useEffect(() => {
    if (!styleInjected) {
      styleInjected = true;
      const style = document.createElement('style');
      style.textContent = STYLES;
      document.head.appendChild(style);
    }
  }, []);

  return (
    <div
      className={`glow-card-wrap ${active ? 'active' : ''} ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
    >
      <div className={`glow-card ${className}`}>
        {children}
      </div>
    </div>
  );
}
