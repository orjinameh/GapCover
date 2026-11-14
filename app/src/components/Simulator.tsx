"use client";
import { useEffect, useMemo, useState } from "react";
import { DEMO_TOKENS, DEPLOYED, IS_LOCAL, START_PRICE, TICKER } from "@/lib/config";
import { pub } from "@/lib/chain";
import { STEPS, runWeekend, uncoveredAddress, type SimResult, type StepState } from "@/lib/sim";
import { fmtPx, fmtSigned, fmtUsd, notionalOf, payoutOf, premiumOf, type Tier } from "@/lib/math";
import { useApp } from "./state";
import MagneticButton from "./MagneticButton";

const FALLBACK_TIERS: Tier[] = [
  { name: "Light", deductibleBps: 500, capBps: 1500, premiumBps: 20 },
  { name: "Standard", deductibleBps: 200, capBps: 1000, premiumBps: 60 },
  { name: "Tight", deductibleBps: 100, capBps: 500, premiumBps: 90 },
];

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const MIN_ETH = 2n * 10n ** 15n;

export default function Simulator() {
  const { snap, demo, refresh } = useApp();
  const tiers = snap?.tiers ?? FALLBACK_TIERS;
  const [tierIdx, setTierIdx] = useState(1);
  const [gap, setGap] = useState(6);
  const [states, setStates] = useState<StepState[]>(() => STEPS.map(() => "wait"));
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SimResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const tier = tiers[tierIdx];
  const notional = notionalOf(DEMO_TOKENS, START_PRICE);
  const premium = premiumOf(notional, tier.premiumBps);
  const settle = (START_PRICE * BigInt(10_000 - gap * 100)) / 10_000n;
  const expected = useMemo(() => payoutOf(notional, tier, START_PRICE, settle), [notional, tier, settle]);
  const move = ((DEMO_TOKENS * settle) / 10n ** 20n) - ((DEMO_TOKENS * START_PRICE) / 10n ** 20n);

  const [demoEth, setDemoEth] = useState<bigint | null>(null);
  useEffect(() => {
    if (!demo) return;
    let live = true;
    const read = () => pub.getBalance({ address: demo.address }).then((b) => live && setDemoEth(b)).catch(() => {});
    void read();
    const id = setInterval(read, 4000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [demo]);
  const lowGas = !!demo && demoEth !== null && demoEth < MIN_ETH && !IS_LOCAL;
  const ready = DEPLOYED && !!demo && !running && !lowGas;

  async function run() {
    if (!demo) return;
    setRunning(true);
    setErr(null);
    setResult(null);
    setNotes({});
    setStates(STEPS.map(() => "wait"));
    try {
      const r = await runWeekend({
        signer: demo,
        uncovered: uncoveredAddress(),
        tier,
        tierIdx,
        gapBps: gap * 100,
        onStep: (i, st, note) => {
          setStates((prev) => prev.map((x, j) => (j === i ? st : x)));
          if (note) setNotes((n) => ({ ...n, [i]: note }));
        },
      });
      setResult(r);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
      void refresh();
    }
  }

  const cov = result?.covered;
  const unc = result?.uncovered;
  const coveredNet = cov ? cov.net : move - premium + expected;
  const uncoveredNet = unc ? unc.net : move;

  return (
    <section id="simulator" className="sim">
      <aside className="rail">
        <p className="meta">Demo<br />One weekend, played fast</p>

        <div>
          <ol className="rail__list">
            {STEPS.map((label, i) => (
              <li key={label} className={`step step--${states[i]}`}>
                <span className="meta">{states[i] === "done" ? "✓" : states[i] === "fail" ? "×" : states[i] === "run" ? "▸" : `0${i + 1}`}</span>
                <span>
                  {label}
                  {notes[i] && <em className="step__note">{notes[i]}</em>}
                </span>
              </li>
            ))}
          </ol>

          <div className="ctl">
            <p className="meta">How far it drops</p>
            <div className="ctl__row">
              <input
                aria-label="Drop in percent"
                type="range"
                min={1}
                max={20}
                value={gap}
                disabled={running}
                onChange={(e) => setGap(Number(e.target.value))}
              />
              <span className="ctl__val">−{gap}%</span>
            </div>
            <p className="meta">Protection level</p>
            <div className="seg">
              {tiers.map((t, i) => (
                <button key={t.name} className={i === tierIdx ? "on" : ""} disabled={running} onClick={() => setTierIdx(i)}>
                  {t.name}
                </button>
              ))}
            </div>
            <p className="meta ctl__terms">
              Fee {tier.premiumBps / 100}% · you take the first {tier.deductibleBps / 100}% · we pay up to {tier.capBps / 100}%
            </p>
          </div>
        </div>

        <div className="rail__foot">
          <p className="meta">
            Practice account (temporary)<br />
            {demo ? short(demo.address) : "…"}
            {demoEth !== null ? ` · ${(Number(demoEth) / 1e18).toFixed(4)} fee money` : ""}
          </p>
          {lowGas && demo && (
            <p className="meta warn">This account needs a little network fee money. Get free test ETH from a Base Sepolia faucet and send it to {demo.address}.</p>
          )}
          {!DEPLOYED && <p className="meta warn">Not set up yet. See the README.</p>}
        </div>
      </aside>

      <div className="stage">
        <div className="stage__head">
          <p className="meta">
            {TICKER} · {DEMO_TOKENS / 10n ** 18n} stocks · ${fmtUsd(notional, 0)} · ${fmtPx(START_PRICE)} → ${fmtPx(settle)}
          </p>
          <MagneticButton label={running ? "Playing…" : result ? "Play again" : "Play the weekend"} onClick={run} disabled={!ready} />
        </div>

        <div className={`duo ${result ? "duo--done" : ""}`}>
          <article className="side side--covered">
            <p className="meta">Protected account {cov ? `· ${short(cov.address)}` : ""}</p>
            <h3 className="net">{fmtSigned(coveredNet)}</h3>
            <p className="meta">You end up {result ? "" : "· preview"}</p>
            <dl className="rows">
              <div><dt>Your stocks</dt><dd>{fmtSigned(move)}</dd></div>
              <div><dt>Fee</dt><dd>{fmtSigned(-(cov?.premium ?? premium))}</dd></div>
              <div><dt>We pay you</dt><dd>{fmtSigned(cov ? cov.payout : expected)}</dd></div>
            </dl>
          </article>

          <article className="side side--un">
            <p className="meta">Unprotected account {unc ? `· ${short(unc.address)}` : ""}</p>
            <h3 className="net net--outline">{fmtSigned(uncoveredNet)}</h3>
            <p className="meta">You end up {result ? "" : "· preview"}</p>
            <dl className="rows">
              <div><dt>Your stocks</dt><dd>{fmtSigned(move)}</dd></div>
              <div><dt>Fee</dt><dd>0.00</dd></div>
              <div><dt>We pay you</dt><dd>0.00</dd></div>
            </dl>
          </article>
        </div>

        {result && (
          <p className="meta verdict">
            Paid ${fmtUsd(result.covered.payout)} · expected ${fmtUsd(result.expectedPayout)} ·{" "}
            {result.covered.payout === result.expectedPayout ? "matches" : "DOES NOT MATCH"} · protection saved ${fmtUsd(result.covered.net - result.uncovered.net)}
          </p>
        )}
        {err && <p className="meta warn">{err}</p>}
      </div>
    </section>
  );
}
