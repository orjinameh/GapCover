"use client";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import "./explainer.css";

type TierTerms = { deductibleBps: number; capBps: number; premiumBps: number };

const NOTIONAL = 10_000; // example position, USD
const S = 7; // pixels per 1% of price
const Y0 = 210; // price level at the close
const X_CLOSE = 130;
const X_NEWS = 400;
const X_OPEN = 700;
const BAR_X = 744;
const WALLET_Y = 398;

const PRESETS = [
  { id: "nvda", label: "Nvidia, 9 Nov 2026", drop: 5 },
  { id: "small", label: "Small drop", drop: 1 },
  { id: "up", label: "Stock rises", drop: -3 },
  { id: "crash", label: "Crash", drop: 18 },
] as const;

const usd = (n: number) => `${n < 0 ? "−" : n > 0 ? "+" : ""}$${Math.abs(Math.round(n)).toLocaleString("en-US")}`;

function star(cx: number, cy: number, r1: number, r2: number, n: number) {
  const pts: string[] = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? r1 : r2;
    const a = (Math.PI * i) / n - Math.PI / 2;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(" ");
}

function Sun({ cx, cy }: { cx: number; cy: number }) {
  return (
    <g>
      <g className="ex-rays">
        {Array.from({ length: 8 }, (_, i) => {
          const a = (Math.PI / 4) * i;
          return (
            <line
              key={i}
              x1={cx + Math.cos(a) * 15}
              y1={cy + Math.sin(a) * 15}
              x2={cx + Math.cos(a) * 21}
              y2={cy + Math.sin(a) * 21}
              className="ex-ray"
            />
          );
        })}
      </g>
      <circle cx={cx} cy={cy} r="9" className="ex-solid" />
    </g>
  );
}

function Moon({ cx, cy }: { cx: number; cy: number }) {
  const stars: [number, number, number][] = [
    [cx + 30, cy - 16, 0],
    [cx - 30, cy + 6, 0.7],
    [cx + 34, cy + 12, 1.4],
  ];
  return (
    <g>
      <circle cx={cx} cy={cy} r="13" className="ex-solid" />
      <circle cx={cx + 6} cy={cy - 4} r="11" className="ex-bgfill" />
      {stars.map(([x, y, d], i) => (
        <circle key={i} cx={x} cy={y} r="1.8" className="ex-solid ex-star" style={{ animationDelay: `${d}s` }} />
      ))}
    </g>
  );
}

export default function Explainer({ tier, tierName }: { tier?: TierTerms; tierName?: string }) {
  const t = tier ?? { deductibleBps: 200, capBps: 1000, premiumBps: 60 };
  const ded = t.deductibleBps / 100;
  const cap = t.capBps / 100;
  const fee = (NOTIONAL * t.premiumBps) / 10_000;

  const [drop, setDrop] = useState(5);
  const [preset, setPreset] = useState<string | null>("nvda");
  const [run, setRun] = useState(0);
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    setArmed(false);
    const id = setTimeout(() => setArmed(true), 1100);
    return () => clearTimeout(id);
  }, [run]);

  const m = useMemo(() => {
    const frac = drop > ded ? Math.min(drop - ded, cap) : 0;
    const loss = (drop / 100) * NOTIONAL;
    const pay = (frac / 100) * NOTIONAL;
    return { frac, loss, pay, net: -loss + pay - fee };
  }, [drop, ded, cap, fee]);

  const d = armed ? drop : 0;
  const dFrac = d > ded ? Math.min(d - ded, cap) : 0;
  const dedY = Y0 + ded * S;
  const capY = Y0 + (ded + cap) * S;
  const bandMid = Y0 + (ded + m.frac / 2) * S;

  const caption =
    drop <= 0
      ? "The stock rose, so nothing is paid. You keep the gain, minus the fee."
      : m.frac === 0
        ? "The drop was smaller than the part you absorb, so nothing is paid. You lose only the fee."
        : m.frac >= cap
          ? `The drop was big, so the payout hit its limit: the most we pay is ${usd((cap / 100) * NOTIONAL).replace("+", "")}.`
          : `We pay for the part of the drop beyond the first ${ded}%.`;

  const openLabel =
    drop === 0 ? "UNCHANGED" : `${preset === "nvda" ? "ABOUT " : ""}${Math.abs(drop)}% ${drop > 0 ? "LOWER" : "HIGHER"}`;

  const coinVars = (i: number): CSSProperties =>
    ({ ["--fall" as string]: `${WALLET_Y - bandMid - 6}px`, animationDelay: `${i * 0.5}s` }) as CSSProperties;

  return (
    <section className="ex" aria-label="How GapCover works, with an example">
      <div className="ex__top">
        <p className="meta">
          Example: $10,000 of stock · {tierName ?? "Standard"} protection · fee ${fee.toLocaleString("en-US")}
        </p>
        <button className="ex-chip" onClick={() => setRun((r) => r + 1)}>Replay</button>
      </div>

      <svg
        key={run}
        viewBox="0 0 900 440"
        role="img"
        aria-label={`The market closes on Friday, news arrives on Sunday while trading is shut, and the stock opens ${Math.abs(drop)}% ${drop >= 0 ? "lower" : "higher"} on Monday. ${caption}`}
      >
        {/* time strip */}
        <line x1="30" y1="100" x2="870" y2="100" className="ex-wire" />
        <Sun cx={X_CLOSE} cy={52} />
        <Moon cx={X_NEWS} cy={52} />
        <Sun cx={X_OPEN} cy={52} />
        <text x={X_CLOSE} y="124" textAnchor="middle" className="ex-lab">FRI · MARKET CLOSES</text>
        <text x={X_NEWS} y="124" textAnchor="middle" className="ex-lab">SUN · NEWS BREAKS</text>
        <text x={X_OPEN} y="124" textAnchor="middle" className="ex-lab">MON · MARKET OPENS</text>

        {/* price before the close */}
        <path
          className="ex-line ex-draw"
          d={`M30 ${Y0 + 26} L62 ${Y0 + 12} L94 ${Y0 + 20} L112 ${Y0 - 2} L${X_CLOSE} ${Y0}`}
        />
        <circle cx={X_CLOSE} cy={Y0} r="5.5" className="ex-solid" />
        {preset === "nvda" && (
          <text x={X_CLOSE} y={Y0 - 18} textAnchor="middle" className="ex-lab">$186.64</text>
        )}

        {/* market closed: nothing can trade */}
        <line x1={X_CLOSE} y1={Y0} x2={X_OPEN} y2={Y0} className="ex-dash" />
        <g>
          <rect x="226" y={Y0 + 12} width="16" height="12" rx="2" className="ex-solid" />
          <path d={`M229 ${Y0 + 12} v-4 a5 5 0 0 1 10 0 v4`} className="ex-lock" />
        </g>
        <text x="250" y={Y0 + 22} className="ex-lab">NO TRADING · YOU CANNOT SELL</text>

        {/* the news */}
        <g className="ex-news" style={{ transformOrigin: `${X_NEWS}px ${Y0}px` }}>
          <polygon points={star(X_NEWS, Y0, 27, 17, 10)} className="ex-solid" />
          <path
            d={`M${X_NEWS + 6} ${Y0 - 16} L${X_NEWS - 8} ${Y0 + 2} L${X_NEWS + 1} ${Y0 + 2} L${X_NEWS - 5} ${Y0 + 18} L${X_NEWS + 11} ${Y0 - 3} L${X_NEWS + 2} ${Y0 - 3} Z`}
            className="ex-bgfill"
          />
        </g>

        {/* Monday gap */}
        <line
          x1={X_OPEN} y1={Y0} x2={X_OPEN} y2={Y0 + 20 * S}
          className="ex-gap ex-move"
          style={{ transformOrigin: `${X_OPEN}px ${Y0}px`, transform: `scaleY(${d / 20})` }}
        />
        <g className="ex-move" style={{ transform: `translateY(${d * S}px)` }}>
          <line x1={X_OPEN} y1={Y0} x2={X_OPEN + 36} y2={Y0} className="ex-dots" />
          <circle cx={X_OPEN} cy={Y0} r="6.5" className="ex-solid" />
          <text x={X_OPEN - 16} y={Y0 + 4} textAnchor="end" className="ex-lab ex-lab--strong">{openLabel}</text>
        </g>

        {/* who absorbs what */}
        <line x1={X_OPEN + 22} y1={dedY} x2={BAR_X + 34} y2={dedY} className="ex-thresh" />
        <line x1={X_OPEN + 22} y1={capY} x2={BAR_X + 34} y2={capY} className="ex-thresh" />
        <text x={BAR_X + 40} y={dedY + 3} className="ex-lab">YOU ABSORB UP TO HERE</text>
        <text x={BAR_X + 40} y={capY + 3} className="ex-lab">PAYOUT STOPS HERE</text>

        <rect
          x={BAR_X} y={Y0} width="22" height={20 * S}
          className="ex-loss ex-move"
          style={{ transformOrigin: `${BAR_X}px ${Y0}px`, transform: `scaleY(${d / 20})` }}
        />
        <rect
          x={BAR_X} y={dedY} width="22" height={cap * S}
          className="ex-paid ex-move"
          style={{ transformOrigin: `${BAR_X}px ${dedY}px`, transform: `scaleY(${dFrac / cap})` }}
        />

        {/* payout reaches the wallet */}
        {armed && m.pay > 0 &&
          [0, 1, 2].map((i) => (
            <circle key={i} cx={BAR_X + 11} cy={bandMid} r="5" className="ex-coin" style={coinVars(i)} />
          ))}
        <rect x={BAR_X - 14} y={WALLET_Y} width="50" height="26" rx="5" className="ex-wallet" />
        <circle cx={BAR_X + 28} cy={WALLET_Y + 13} r="2.6" className="ex-solid" />
        <text x={BAR_X + 11} y={WALLET_Y + 44} textAnchor="middle" className="ex-lab">YOUR WALLET</text>
      </svg>

      <p className="lede ex__cap">{caption}</p>

      <dl className="ex-sum">
        <div><dt>Your shares</dt><dd>{usd(-m.loss)}</dd></div>
        <div><dt>GapCover pays</dt><dd>{usd(m.pay)}</dd></div>
        <div><dt>Fee</dt><dd>{usd(-fee)}</dd></div>
        <div className="ex-sum__end"><dt>You end up</dt><dd>{usd(m.net)}</dd></div>
        <div><dt>Without protection</dt><dd>{usd(-m.loss)}</dd></div>
      </dl>

      <label className="ex__range meta" htmlFor="ex-drop">
        {drop === 0 ? "Stock opens unchanged" : `Stock opens ${Math.abs(drop)}% ${drop > 0 ? "lower" : "higher"}`} · drag to try
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
          Nvidia closed Friday 6 Nov at $186.64. On Sunday it announced an investigation into whether its CEO had been targeted in a foreign
          intelligence effort. Shares fell about 5% at Monday&apos;s open. Rounded numbers, illustration only: no real protection was sold.{" "}
          Sources:{" "}
          <a className="linkbtn" href="https://ny1.com/nyc/all-boroughs/ap-top-news/2026/11/09/nvidia-shares-drop-after-co-investigates-whether-ceo-was-target-of-a-foreign-intelligence-effort" target="_blank" rel="noreferrer">AP</a>
          <a className="linkbtn" href="https://www.ctvnews.ca/business/article/internal-probe-into-ceo-jensen-huang-and-foreign-intelligence-weighs-on-high-flying-nvidia-shares/" target="_blank" rel="noreferrer">CTV News</a>
          <a className="linkbtn" href="https://www.thestar.com.my/tech/tech-news/2026/11/09/nvidia-falls-about-3-in-after-hours-and-perpetual-futures-trade" target="_blank" rel="noreferrer">Reuters via The Star</a>
        </p>
      )}
    </section>
  );
}
