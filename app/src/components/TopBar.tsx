"use client";
import { useEffect, useState } from "react";
import { CHAIN, DEPLOYED, TICKER } from "@/lib/config";
import { phaseOf, secondsLeft } from "@/lib/chain";
import { useApp } from "./state";

export default function TopBar() {
  const { snap, error } = useApp();
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  let label = DEPLOYED ? "Reading chain" : "Not deployed";
  let left: number | null = null;
  let clock = "--:--:--";
  if (snap) {
    const p = phaseOf(snap);
    label = p.label;
    left = secondsLeft(snap, p.target);
    const t = Number(snap.now) + Math.floor((Date.now() - snap.fetchedAt) / 1000);
    clock = new Date(t * 1000).toISOString().slice(11, 19);
  }
  if (error) label = "RPC trouble";

  return (
    <header className="bar">
      <span>Gap Cover / 001</span>
      <span>{CHAIN.name} / testnet only / {TICKER}</span>
      <span className="bar__live">
        <i className="dot" />
        {label}
        {left !== null && <b className="bar__count">{left}s</b>}
      </span>
      <span suppressHydrationWarning>{clock} chain</span>
    </header>
  );
}
