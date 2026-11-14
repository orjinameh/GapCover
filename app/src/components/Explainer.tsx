"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import "./explainer.css";

type Terms = { deductibleBps: number; capBps: number; premiumBps: number };

const STOCKS = 10_000; // example: $10,000 of stocks
const SCALE = 20; // the bar shows drops from 0 to 20%

const PRESETS = [
  { id: "nvda", label: "Nvidia, Nov 2026", drop: 5 },
  { id: "small", label: "Small drop", drop: 1 },
  { id: "up", label: "Goes up", drop: -3 },
  { id: "crash", label: "Crash", drop: 18 },
] as const;

const money = (n: number) => `$${Math.abs(Math.round(n)).toLocaleString("en-US")}`;
const signed = (n: number) => (Math.round(n) === 0 ? "$0" : `${n < 0 ? "−" : "+"}${money(n)}`);

function useTween(target: number, ms = 1100) {
  const [v, setV] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      from.current = target;
      setV(target);
      return;
    }
    const a = from.current;
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      const cur = a + (target - a) * (1 - Math.pow(1 - p, 3));
      from.current = cur;
      setV(cur);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

const Sun = () => (
  <svg className="ex-ico" viewBox="0 0 32 32" aria-hidden="true">
    <g className="ex-rays">
      {Array.from({ length: 8 }, (_, i) => {
        const a = (Math.PI / 4) * i;
        return <line key={i} x1={16 + Math.cos(a) * 10} y1={16 + Math.sin(a) * 10} x2={16 + Math.cos(a) * 14} y2={16 + Math.sin(a) * 14} />;
      })}
    </g>
    <circle cx="16" cy="16" r="6" />
  </svg>
);

const Moon = () => (
  <svg className="ex-ico" viewBox="0 0 32 32" aria-hidden="true">
    <path d="M21 5a11 11 0 1 0 6 18 9 9 0 0 1-6-18z" />
    <circle className="ex-twinkle" cx="26" cy="8" r="1.4" />
    <circle className="ex-twinkle ex-twinkle--b" cx="5" cy="9" r="1.2" />
  </svg>
);

export default function Explainer({ tier, tierName }: { tier?: Terms; tierName?: string }) {
  const t = tier ?? { deductibleBps: 200, capBps: 1000, premiumBps: 60 };
  const ded = t.deductibleBps / 100;
  const cap = t.capBps / 100;
  const fee = (STOCKS * t.premiumBps) / 10_000;

  const [drop, setDrop] = useState(5);
  const [preset, setPreset] = useState<string | null>("nvda");
  const [run, setRun] = useState(0);
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    setArmed(false);
    const id = setTimeout(() => setArmed(true), 700);
    return () => clearTimeout(id);
  }, [run]);

  const frac = drop > ded ? Math.min(drop - ded, cap) : 0;
  const loss = (drop / 100) * STOCKS;
  const pay = (frac / 100) * STOCKS;
  const net = -loss + pay - fee;
  const saved = pay - fee;

  const shown = useTween(armed ? drop : 0);
  const shownFrac = shown > ded ? Math.min(shown - ded, cap) : 0;
  const mondayValue = STOCKS * (1 - shown / 100);
  const youPct = Math.max(0, Math.min(shown, ded, SCALE)) * (100 / SCALE);
  const gapPct = Math.max(0, Math.min(shown, SCALE)) * (100 / SCALE);
  const weStart = ded * (100 / SCALE);
  const wePct = shownFrac * (100 / SCALE);

  const verdict =
    drop <= 0 || frac === 0
      ? "No payout. You only lose the fee."
      : saved > 0
        ? `Protection saved you ${money(saved)}.`
        : `Protection cost you ${money(-saved)}.`;

  return (
    <section className="ex" aria-label="How it works, with an example">
      <div className="ex__top">
        <p className="meta">Example · {money(STOCKS)} of stocks · {tierName ?? "Standard"} · fee {money(fee)}</p>
        <button className="ex-chip" onClick={() => setRun((r) => r + 1)}>Replay</button>
      </div>

      <ol className="ex-steps">
        <li className="ex-step">
          <Sun />
          <p className="ex-day">Friday</p>
          <p className="ex-what">Market closes</p>
          <p className="ex-num">{money(STOCKS)}</p>
          <p className="ex-sub">your stocks</p>
        </li>
        <li className="ex-step ex-step--night">
          <Moon />
          <p className="ex-day">Sunday</p>
          <p className="ex-what">Bad news</p>
          <p className="ex-num ex-num--bolt" aria-hidden="true">⚡</p>
          <p className="ex-sub">Market shut. You can&apos;t sell.</p>
        </li>
        <li className="ex-step">
          <Sun />
          <p className="ex-day">Monday</p>
          <p className="ex-what">Market opens</p>
          <p className="ex-num">{money(mondayValue)}</p>
          <p className="ex-sub">{drop === 0 ? "no change" : `${Math.abs(drop)}% ${drop > 0 ? "lower" : "higher"}`}</p>
        </li>
      </ol>

      <div className="ex-bar-wrap">
        <div
          className="ex-bar"
          role="img"
          aria-label={`The stock opens ${Math.abs(drop)}% ${drop >= 0 ? "lower" : "higher"}. You take the first ${ded}%. We pay ${money(pay)}.`}
        >
          <i className="ex-bar__drop" style={{ width: `${gapPct}%` }} />
          <i className="ex-bar__you" style={{ width: `${youPct}%` }} />
          <i className="ex-bar__we" style={{ left: `${weStart}%`, width: `${wePct}%` }}>
            {pay > 0 && armed && (
              <>
                <b className="ex-spark" />
                <b className="ex-spark ex-spark--b" />
                <b className="ex-spark ex-spark--c" />
              </>
            )}
          </i>
        </div>
        <p className="ex-legend">
          <span><i className="ex-sw ex-sw--you" />You take the first {ded}%</span>
          <span><i className="ex-sw ex-sw--we" />We pay the rest, up to {cap}%</span>
        </p>
      </div>

      <div className="ex-result">
        <div className="ex-card">
          <p className="ex-sub">Without protection</p>
          <p className="ex-big">{signed(-loss)}</p>
        </div>
        <div className="ex-card ex-card--on">
          <p className="ex-sub">With protection</p>
          <p className="ex-big">{signed(net)}</p>
          <p className="ex-sub">We pay {money(pay)} · fee {money(fee)}</p>
        </div>
      </div>
      <p className="ex-verdict">{verdict}</p>

      <label className="ex__range meta" htmlFor="ex-drop">
        {drop === 0 ? "Opens unchanged" : `Opens ${Math.abs(drop)}% ${drop > 0 ? "lower" : "higher"}`} · slide to try
      </label>
      <input
        id="ex-drop"
        className="ex-range"
        type="range"
        min={-10}
        max={20}
        step={0.5}
        value={drop}
        onChange={(e) => {
          setDrop(Number(e.target.value));
          setPreset(null);
        }}
      />
      <div className="ex__chips">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            className="ex-chip"
            aria-pressed={preset === p.id}
            onClick={() => {
              setDrop(p.drop);
              setPreset(p.id);
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {preset === "nvda" && (
        <p className="meta ex__src">
          Real case: Nvidia closed Friday 6 Nov at $186.64. On Sunday it announced a review after news about its CEO. It opened about 5% lower on Monday.
          Rounded, for illustration. Sources:
          <a className="linkbtn" href="https://ny1.com/nyc/all-boroughs/ap-top-news/2026/11/09/nvidia-shares-drop-after-co-investigates-whether-ceo-was-target-of-a-foreign-intelligence-effort" target="_blank" rel="noreferrer">AP</a>
          <a className="linkbtn" href="https://www.ctvnews.ca/business/article/internal-probe-into-ceo-jensen-huang-and-foreign-intelligence-weighs-on-high-flying-nvidia-shares/" target="_blank" rel="noreferrer">CTV</a>
          <a className="linkbtn" href="https://www.thestar.com.my/tech/tech-news/2026/11/09/nvidia-falls-about-3-in-after-hours-and-perpetual-futures-trade" target="_blank" rel="noreferrer">Reuters</a>
        </p>
      )}
    </section>
  );
}
