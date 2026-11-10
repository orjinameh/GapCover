"use client";
import { useRef } from "react";

type Props = { label: string; href?: string; onClick?: () => void; disabled?: boolean; small?: boolean };

export default function MagneticButton({ label, href, onClick, disabled, small }: Props) {
  const ref = useRef<HTMLElement>(null);
  const move = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el || disabled || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const r = el.getBoundingClientRect();
    el.style.transform = `translate(${(e.clientX - (r.left + r.width / 2)) * 0.28}px, ${(e.clientY - (r.top + r.height / 2)) * 0.28}px)`;
  };
  const leave = () => {
    if (ref.current) ref.current.style.transform = "translate(0,0)";
  };
  const inner = (
    <>
      <span className="mag__mask">
        <span className="mag__a">{label}</span>
        <span className="mag__b" aria-hidden="true">{label}</span>
      </span>
      <span className="mag__arrow" aria-hidden="true">↘</span>
    </>
  );
  const cls = `mag${small ? " mag--small" : ""}${disabled ? " mag--off" : ""}`;
  if (href) {
    return (
      <a ref={ref as React.RefObject<HTMLAnchorElement>} href={href} className={cls} onPointerMove={move} onPointerLeave={leave}>
        {inner}
      </a>
    );
  }
  return (
    <button
      ref={ref as React.RefObject<HTMLButtonElement>}
      className={cls}
      onClick={onClick}
      disabled={disabled}
      onPointerMove={move}
      onPointerLeave={leave}
    >
      {inner}
    </button>
  );
}
