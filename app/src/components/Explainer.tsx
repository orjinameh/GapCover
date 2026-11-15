"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import "./explainer.css";

type Terms = { deductibleBps: number; capBps: number; premiumBps: number };

const STOCKS = 10_000;

const PRESETS = [
  { id: "nvda", label: "Nvidia, Nov 2026", drop: 9.1 },
  { id: "small", label: "Small drop", drop: 1 },
  { id: "up", label: "Goes up", drop: -3 },
  { id: "crash", label: "Crash", drop: 18 },
] as const;

const clamp = (n: number, a = 0, b = 1) => Math.max(a, Math.min(b, n));
const ease = (t: number) => 1 - Math.pow(1 - t, 3);
const money = (n: number) => `$${Math.abs(Math.round(n)).toLocaleString("en-US")}`;
const signed = (n: number) => (Math.round(n) === 0 ? "$0" : `${n < 0 ? "−" : "+"}${money(n)}`);

/** 1 = bright day, 0 = black night, driven by scroll progress */
function dayAmount(p: number) {
  if (p < 0.26) return 1;
  if (p < 0.34) return 1 - (p - 0.26) / 0.08;
  if (p < 0.58) return 0;
  if (p < 0.66) return (p - 0.58) / 0.08;
  return 1;
}
const skyVars = (d: number) =>
  ({
    ["--sbg" as string]: `color-mix(in srgb, #eeeef1 ${(d * 100).toFixed(1)}%, #0b0b0c)`,
    ["--sfg" as string]: `color-mix(in srgb, #0b0b0c ${(d * 100).toFixed(1)}%, #f5f5f7)`,
  }) as CSSProperties;

const STARS: [number, number, number][] = [
  [0.12, 0.1, 0], [0.3, 0.2, 0.6], [0.55, 0.08, 1.2], [0.78, 0.22, 0.3], [0.9, 0.12, 0.9], [0.2, 0.42, 1.5],
  [0.66, 0.4, 0.2], [0.44, 0.3, 1.1], [0.84, 0.5, 0.7], [0.1, 0.6, 0.4], [0.5, 0.6, 1.4], [0.74, 0.7, 0.1],
];

/** The picture itself: Friday's price line, the shut night, Monday's drop and the lime net that catches it. */
function GapChart({ p, drop, ded, cap, fee }: { p: number; drop: number; ded: number; cap: number; fee: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const narrow = box.w < 560;
  const W = narrow ? 360 : 1000;
  const H = narrow ? 520 : 470;
  const ratio = W / H;
  const fit = box.w && box.h ? (box.w / box.h < ratio ? { w: box.w, h: box.w / ratio } : { w: box.h * ratio, h: box.h }) : { w: 0, h: 0 };

  const closeX = narrow ? 92 : 290;
  const openX = narrow ? 262 : 690;
  const baseY = H * 0.33;
  const k = (H * 0.5) / 20; // pixels per 1%

  const fr = 0.4 + 0.6 * clamp(p / 0.2);
  const nt = clamp((p - 0.3) / 0.28);
  const dt = ease(clamp((p - 0.6) / 0.26));
  const s = drop * dt;
  const s1 = Math.min(Math.max(s, 0), ded);
  const s2 = s > ded ? Math.min(s - ded, cap) : 0;
  const s3 = Math.max(0, s - ded - cap);
  const y0 = baseY;
  const y1 = y0 + s1 * k;
  const y2 = y1 + s2 * k;
  const y3 = y2 + s3 * k;
  const yDot = baseY + s * k;

  const fx = (n: number) => (n / W) * 100;
  const fy = (n: number) => (n / H) * 100;

  const friday = [[0, 60], [0.14, 36], [0.27, 50], [0.42, 16], [0.56, 30], [0.72, 4], [0.86, 14], [1, 0]]
    .map(([a, b], i) => `${i ? "L" : "M"}${(a * closeX).toFixed(1)} ${(baseY + b).toFixed(1)}`)
    .join(" ");
  const tailT = clamp((dt - 0.55) / 0.45);
  const tail = [[0, 0], [0.12, -9], [0.3, 7], [0.5, -5], [0.75, 6], [1, -3]]
    .map(([a, b], i) => `${i ? "L" : "M"}${(openX + a * (W - openX - 8)).toFixed(1)} ${(yDot + b).toFixed(1)}`)
    .join(" ");

  const youLoss = (s1 / 100) * STOCKS;
  const wePay = (s2 / 100) * STOCKS;
  const midNight = (closeX + openX) / 2;

  return (
    <div ref={ref} className="gc">
      <div className="gc__fit" style={{ width: fit.w, height: fit.h }}>
        <svg viewBox={`0 0 ${W} ${H}`} className="gc__svg" aria-hidden="true">
          <defs>
            <pattern id="gc-hatch" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
              <line x1="0" y1="0" x2="0" y2="9" stroke="var(--sfg)" strokeOpacity="0.16" strokeWidth="1" />
            </pattern>
          </defs>

          {/* the shut market */}
          <rect x={closeX} y="0" width={openX - closeX} height={H} fill="url(#gc-hatch)" opacity={nt} />
          <line x1={closeX} y1="0" x2={closeX} y2={H} stroke="var(--sfg)" strokeOpacity={0.35 * nt} strokeWidth="1" />
          <line x1={openX} y1="0" x2={openX} y2={H} stroke="var(--sfg)" strokeOpacity={0.35 * nt} strokeWidth="1" />
          <g opacity={nt}>
            {STARS.map(([a, b, d], i) => (
              <circle
                key={i}
                className="gc-star"
                cx={closeX + a * (openX - closeX)}
                cy={b * H}
                r={i % 3 === 0 ? 2.2 : 1.5}
                fill="var(--sfg)"
                style={{ animationDelay: `${d}s` }}
              />
            ))}
          </g>
          <line className="gc-flat" x1={closeX} y1={baseY} x2={openX} y2={baseY} stroke="var(--sfg)" strokeOpacity={0.7 * nt} strokeWidth="2" strokeDasharray="2 9" strokeLinecap="round" />

          {/* Friday */}
          <path d={friday} pathLength="1" fill="none" stroke="var(--sfg)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="1" strokeDashoffset={1 - fr} />
          <circle cx={closeX} cy={baseY} r={fr > 0.97 ? 7 : 0} fill="var(--sfg)" className="gc-pop" />

          {/* the news */}
          <g transform={`translate(${midNight} ${baseY - (narrow ? 86 : 110)}) scale(${ease(clamp((nt - 0.45) / 0.3))})`}>
            <polygon points="6,-30 -14,4 -2,4 -8,30 16,-8 3,-8 12,-30" fill="var(--acc)" stroke="var(--sfg)" strokeWidth="1.6" strokeLinejoin="round" />
          </g>

          {/* the net that catches part of the fall */}
          {s2 > 0 && <rect x={openX} y={y1} width={W - openX} height={y2 - y1} fill="var(--acc)" opacity="0.28" />}
          {s2 > 0 && <line x1={openX} y1={y1} x2={W} y2={y1} stroke="var(--sfg)" strokeWidth="1" strokeDasharray="3 4" opacity="0.6" />}
          {s2 > 0 && <line x1={openX} y1={y2} x2={W} y2={y2} stroke="var(--sfg)" strokeWidth="1" strokeDasharray="3 4" opacity="0.6" />}

          {/* Monday: the gap */}
          {s > 0 && (
            <g strokeLinecap="butt">
              <line x1={openX} y1={y0} x2={openX} y2={y1} stroke="var(--sfg)" strokeOpacity="0.55" strokeWidth="3" />
              {s2 > 0 && <line x1={openX} y1={y1} x2={openX} y2={y2} stroke="var(--sfg)" strokeWidth="10" />}
              {s2 > 0 && <line x1={openX} y1={y1} x2={openX} y2={y2} stroke="var(--acc)" strokeWidth="6" />}
              {s3 > 0 && <line x1={openX} y1={y2} x2={openX} y2={y3} stroke="var(--sfg)" strokeOpacity="0.55" strokeWidth="3" />}
            </g>
          )}
          {s < 0 && <line x1={openX} y1={baseY} x2={openX} y2={yDot} stroke="var(--sfg)" strokeWidth="3" />}
          {dt > 0 && <circle cx={openX} cy={yDot} r="8" fill="var(--sfg)" />}
          {tailT > 0 && <path d={tail} pathLength="1" fill="none" stroke="var(--sfg)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="1" strokeDashoffset={1 - tailT} />}
        </svg>

        {/* labels are real text, so they stay sharp and readable on a phone */}
        <p className="gc-axis" style={{ left: `${fx(closeX)}%`, opacity: 1 }}>Fri</p>
        <p className="gc-axis" style={{ left: `${fx(midNight)}%`, opacity: nt }}>Sun</p>
        <p className="gc-axis" style={{ left: `${fx(openX)}%`, opacity: dt }}>Mon</p>
        <p className="gc-val" style={{ left: `${fx(closeX)}%`, top: `${fy(baseY - 44)}%`, opacity: fr > 0.4 ? 1 : 0, transform: "translateX(-82%)" }}>
          {money(STOCKS)}
        </p>
        {dt > 0.05 && (
          <p className="gc-val" style={{ left: `${fx(openX - 16)}%`, top: `${fy(yDot)}%`, transform: "translate(-100%, -50%)", opacity: clamp(dt * 2) }}>
            {money(STOCKS * (1 - s / 100))}
          </p>
        )}
        {s1 > 0.4 && (
          <p className="gc-tag gc-tag--you" style={{ left: `${fx(openX - 12)}%`, top: `${fy((y0 + y1) / 2)}%` }}>
            You take {signed(-youLoss)}
          </p>
        )}
        {s2 > 0.2 && (
          <p className="gc-tag gc-tag--we" style={{ left: `${fx(openX + 12)}%`, top: `${fy(Math.max(y1, (y1 + y2) / 2 - 18))}%` }}>
            <span>We pay</span>
            <b>{signed(wePay)}</b>
          </p>
        )}
        {dt > 0.9 && (
          <p className="gc-tag gc-tag--fee">
            <span>You paid a fee {signed(-fee)}</span>
            <b>You end at {signed(-(s / 100) * STOCKS + wePay - fee)}</b>
          </p>
        )}
        {nt > 0.2 && (
          <p className="gc-shut" style={{ left: `${fx(midNight)}%`, top: `${fy(baseY - 30)}%`, opacity: nt }}>
            Market shut
          </p>
        )}
      </div>
    </div>
  );
}

/** The pinned scroll story: day, night, day again. */
function PinnedStory({ drop, ded, cap, fee, nvda }: { drop: number; ded: number; cap: number; fee: number; nvda: boolean }) {
  const outer = useRef<HTMLDivElement>(null);
  const [p, setP] = useState(0);
  const [bar, setBar] = useState(48);

  useEffect(() => {
    const el = outer.current;
    if (!el) return;
    let raf = 0;
    const calc = () => {
      raf = 0;
      const b = document.querySelector(".bar")?.getBoundingClientRect().height ?? 48;
      setBar(b);
      const r = el.getBoundingClientRect();
      const panel = window.innerHeight - b - 16;
      setP(clamp((b + 8 - r.top) / (r.height - panel)));
    };
    const on = () => {
      if (!raf) raf = requestAnimationFrame(calc);
    };
    calc();
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    return () => {
      window.removeEventListener("scroll", on);
      window.removeEventListener("resize", on);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const frac = drop > ded ? Math.min(drop - ded, cap) : 0;
  const pay = (frac / 100) * STOCKS;
  const loss = (drop / 100) * STOCKS;
  const net = -loss + pay - fee;
  const i = p < 0.3 ? 0 : p < 0.6 ? 1 : p < 0.88 ? 2 : 3;
  const d = dayAmount(p);

  return (
    <div ref={outer} className="gs" style={{ ["--bar" as string]: `${bar}px` } as CSSProperties}>
      <div className="gs__panel" style={skyVars(d)}>
        <i className="gs__prog" style={{ transform: `scaleX(${p})` }} />
        <div className="gs__head">
          <p className="gs__kick">{nvda ? "Real case · Nvidia · 9 Nov 2026" : `Example · ${money(STOCKS)} of stocks`}</p>
          <div className="gs__caps">
            <h2 className={`gs__h ${i === 0 ? "on" : ""}`}>
              <small>Friday · last chance to buy</small>
              You buy protection before the close.
            </h2>
            <h2 className={`gs__h ${i === 1 ? "on" : ""}`}>
              <small>Sunday · too late to buy</small>
              {nvda ? "Bad news about the CEO." : "Bad news."} You can&apos;t sell.
            </h2>
            <h2 className={`gs__h ${i === 2 ? "on" : ""}`}>
              <small>Monday · market opens</small>
              {drop > 0 ? `They open ${Math.abs(drop)}% lower.` : drop < 0 ? `They open ${Math.abs(drop)}% higher.` : "They open unchanged."}
            </h2>
            <h2 className={`gs__h ${i === 3 ? "on" : ""}`}>
              <small>{signed(net)} with protection · {signed(-loss)} without</small>
              {pay > 0 ? `We pay you ${money(pay)}. Fee ${money(fee)}. You end at ${signed(net)}.` : "Nothing to pay. You lose only the fee."}
            </h2>
          </div>
        </div>
        <div className="gs__chart">
          <GapChart p={p} drop={drop} ded={ded} cap={cap} fee={fee} />
        </div>
        <p className={`gs__hint ${p < 0.03 ? "on" : ""}`} aria-hidden="true">
          Scroll <i />
        </p>
      </div>
    </div>
  );
}

export default function Explainer({ tier, tierName }: { tier?: Terms; tierName?: string }) {
  const t = tier ?? { deductibleBps: 200, capBps: 1000, premiumBps: 60 };
  const ded = t.deductibleBps / 100;
  const cap = t.capBps / 100;
  const fee = (STOCKS * t.premiumBps) / 10_000;

  const [drop, setDrop] = useState(9.1);
  const [preset, setPreset] = useState<string | null>("nvda");
  const [still, setStill] = useState(false);
  useEffect(() => {
    setStill(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  const frac = drop > ded ? Math.min(drop - ded, cap) : 0;
  const loss = (drop / 100) * STOCKS;
  const pay = (frac / 100) * STOCKS;
  const net = -loss + pay - fee;
  const saved = pay - fee;
  const verdict =
    drop <= 0 || frac === 0
      ? "No payout. You only lose the fee."
      : saved > 0
        ? `Protection saved you ${money(saved)}.`
        : `Protection cost you ${money(-saved)}.`;

  return (
    <section className="ex" aria-label="How it works, with an example">
      {!still && <PinnedStory drop={drop} ded={ded} cap={cap} fee={fee} nvda={preset === "nvda"} />}

      <div className="ex-try">
        <p className="meta">Try another night · {tierName ?? "Standard"} · fee {money(fee)} on {money(STOCKS)}</p>
        <div className="ex-try__chart" style={skyVars(1)}>
          <GapChart p={1} drop={drop} ded={ded} cap={cap} fee={fee} />
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
            Real case: Nvidia&apos;s stock token on Base (NVDAc), with prices from its Chainlink feed. Friday 6 Nov, last price before the weekend: $187.97.
            Monday 9 Nov at 9:30 ET: $170.81, 9.1% lower, after news that Nvidia was looking into its CEO. Rounded, for illustration. News:
            <a className="linkbtn" href="https://ny1.com/nyc/all-boroughs/ap-top-news/2026/11/09/nvidia-shares-drop-after-co-investigates-whether-ceo-was-target-of-a-foreign-intelligence-effort" target="_blank" rel="noreferrer">AP</a>
            <a className="linkbtn" href="https://www.ctvnews.ca/business/article/internal-probe-into-ceo-jensen-huang-and-foreign-intelligence-weighs-on-high-flying-nvidia-shares/" target="_blank" rel="noreferrer">CTV</a>
            <a className="linkbtn" href="https://www.thestar.com.my/tech/tech-news/2026/11/09/nvidia-falls-about-3-in-after-hours-and-perpetual-futures-trade" target="_blank" rel="noreferrer">Reuters</a>
          </p>
        )}
      </div>
    </section>
  );
}
