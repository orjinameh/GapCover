"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { DEPLOYED, DEMO_TOKENS, TICKER, need } from "@/lib/config";
import { friendlyError } from "@/lib/friendly";
import { POOL_ABI, STOCK_ABI, USDC_ABI } from "@/lib/abis";
import { phaseOf, secondsLeft, send } from "@/lib/chain";
import { fmtPx, fmtTokens, fmtUsd, notionalOf, parseTokens, premiumOf } from "@/lib/math";
import { readMyCovers, STATE_TEXT, type MyCover } from "@/lib/covers";
import { useApp } from "./state";
import MagneticButton from "./MagneticButton";
import FeeMoneyNote from "./FeeMoneyNote";
import Explainer from "./Explainer";
import Subscribe from "./Subscribe";

const when = (ts: bigint) => new Date(Number(ts) * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export default function Market() {
  const { snap, signer, setWalletOpen, wrongNetwork, switchNetwork, refresh } = useApp();
  const [tokens, setTokens] = useState("100");
  const [tierIdx, setTierIdx] = useState(1);
  const [err, setErr] = useState<string | null>(null);
  const [covers, setCovers] = useState<MyCover[] | null>(null);
  const [busy, setBusy] = useState(false);

  const addr = signer?.address;
  const snapRef = useRef(snap);
  snapRef.current = snap;
  const [reload, setReload] = useState(0);
  const ready = !!snap;
  useEffect(() => {
    if (!ready || !addr) {
      setCovers(null);
      return;
    }
    let live = true;
    const load = () => {
      const sn = snapRef.current;
      if (!sn) return;
      readMyCovers(addr, sn.tiers, sn.now + BigInt(Math.floor((Date.now() - sn.fetchedAt) / 1000)))
        .then((c) => live && setCovers(c))
        .catch(() => {});
    };
    load();
    const id = setInterval(load, 4000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [addr, ready, reload]);

  const view = useMemo(() => {
    if (!snap) return null;
    const tier = snap.tiers[tierIdx];
    const raw = parseTokens(tokens);
    const notional = notionalOf(raw, snap.feedPrice);
    const premium = premiumOf(notional, tier.premiumBps);
    const maxPayout = (notional * BigInt(tier.capBps)) / 10_000n;
    const phase = phaseOf(snap);
    return { tier, raw, notional, premium, maxPayout, phase };
  }, [snap, tokens, tierIdx]);

  if (!DEPLOYED) {
    return (
      <section className="market">
        <aside className="rail"><p className="meta">Gap Cover</p></aside>
        <div className="stage"><p className="meta warn">Contracts are not configured for this site yet.</p></div>
      </section>
    );
  }

  const me = snap?.me;
  const left = snap && view ? secondsLeft(snap, view.phase.target) : null;

  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setErr(friendlyError(m));
    } finally {
      setBusy(false);
      setReload((n) => n + 1);
      void refresh();
    }
  }

  const faucet = () =>
    act(async () => {
      if (!signer) return;
      await send(signer, need("usdc"), USDC_ABI, "faucet", [signer.address, 1_000n * 10n ** 6n]);
      await send(signer, need("stock"), STOCK_ABI, "mint", [signer.address, DEMO_TOKENS]);
    });

  const lowFunds = !!me && (me.usdc < 100n * 10n ** 6n || me.tokens < DEMO_TOKENS);

  return (
    <section className="market">
      <aside className="rail">
        <p className="meta">{TICKER} · practice stock</p>
        <div>
          <p className="big">{snap ? fmtPx(snap.feedPrice) : "…"}</p>
          <p className="meta">Price now, in $</p>
          <dl className="rows">
            <div><dt>Market</dt><dd>{view?.phase.label ?? "…"}</dd></div>
            {left !== null && <div><dt>{view?.phase.phase === "sale" ? "Closes in" : "Opens in"}</dt><dd>{left}s</dd></div>}
            <div><dt>Money ready to pay</dt><dd>{snap ? `$${fmtUsd(snap.totalAssets, 0)}` : "…"}</dd></div>
          </dl>
        </div>
      </aside>

      <div className="stage">
        <p className="meta">Weekend protection</p>
        <h1 className="display display--md">
          <span className="display__row">Protect your stocks</span>
          <span className="display__row display__row--outline">every weekend.</span>
        </h1>
        <p className="lede lede--wide">
          Pay a small fee each weekend. If your stock opens much lower on Monday, we pay you part of the loss. You subscribe once and it renews by itself.
        </p>
        <Explainer tier={view?.tier} tierName={view?.tier.name} />
        <details className="lede lede--wide">
          <summary className="meta">Questions</summary>
          <p className="meta"><b>When does it start?</b> On the second weekend after you subscribe, so nobody can join just before bad news. News that comes out after the market closes is not covered.</p>
          <p className="meta"><b>Is it for me?</b> Only if a surprise drop overnight would really hurt, like holding through earnings. It is not a way to make money.</p>
          <p className="meta"><b>What if the stock goes up?</b> You lose only the fee and keep the gain.</p>
          <p className="meta"><b>How long does it last?</b> Each weekend is covered separately and renews by itself. Cancel any time: up to two more weekends are still covered, then it stops. If you cannot pay one week, that weekend is not covered and you owe nothing.</p>
          <p className="meta"><b>What is not covered?</b> Drops during the day, and the first part of a drop (you take that). If something unusual happens, like a stock split, we cancel and refund your fee.</p>
          <p className="meta"><b>Is this real?</b> No. Practice stocks, play money, and a made-up price anyone can change. A real version would use a trusted market price.</p>
        </details>

        <div className="flow">
          <div className="flow__step">
            <p className="meta">1 · How much stock?</p>
            <label className="field-in">
              <input
                aria-label="Stocks to protect"
                value={tokens}
                inputMode="decimal"
                onChange={(e) => setTokens(e.target.value.replace(/[^0-9.]/g, ""))}
              />
            </label>
            <p className="meta">
              Stocks to protect{me ? ` · you have ${fmtTokens(me.tokens)}` : ""}
              {me && me.tokens > 0n && (
                <button className="linkbtn" onClick={() => setTokens(fmtTokens(me.tokens).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, ""))}>Max</button>
              )}
            </p>
          </div>

          <div className="flow__step">
            <p className="meta">2 · How safe?</p>
            <ul className="tierlist">
              {snap?.tiers.map((t, i) => (
                <li key={t.name}>
                  <button className={i === tierIdx ? "on" : ""} onClick={() => setTierIdx(i)} aria-pressed={i === tierIdx}>
                    <span>{t.name}</span>
                    <span className="meta">fee {t.premiumBps / 100}% · you take the first {t.deductibleBps / 100}% · we pay up to {t.capBps / 100}%</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="flow__step">
            <p className="meta">3 · The price</p>
            {view && (
              <dl className="rows">
                <div><dt>Stocks</dt><dd>{fmtTokens(view.raw)} × ${fmtPx(snap!.feedPrice)}</dd></div>
                <div><dt>Worth</dt><dd>${fmtUsd(view.notional)}</dd></div>
                <div><dt>Fee each weekend</dt><dd>${fmtUsd(view.premium)}</dd></div>
                <div><dt>Most we pay</dt><dd>${fmtUsd(view.maxPayout)}</dd></div>
              </dl>
            )}
          </div>
        </div>

        <div className="cta">
          <FeeMoneyNote />
          {lowFunds && signer && !wrongNetwork && (
            <p className="meta">
              Need practice money? <button className="linkbtn" disabled={busy} onClick={() => void faucet()}>Get it free</button>
            </p>
          )}
          {!snap?.session && snap && (
            <p className="meta">Protection is bought for each weekend. In this practice version you start a night on the <a className="linkbtn" href="/demo">Demo page</a>.</p>
          )}
          {err && <p className="meta warn">{err}</p>}
        </div>

        <Subscribe raw={view?.raw ?? 0n} tierIdx={tierIdx} tierName={view?.tier.name ?? ""} premium={view?.premium ?? 0n} />

        <div className="mine" id="covers">
          <h2 className="h2">My protection</h2>
          {!signer && <p className="meta">Connect to see your protection.</p>}
          {signer && covers && covers.length === 0 && <p className="meta">Nothing yet.</p>}
          {signer && !covers && <p className="meta">Loading…</p>}
          <ul className="covers">
            {covers?.map((c) => (
              <li key={`${c.sessionId}-${c.coverId}`}>
                <div>
                  <p className="covers__t">{snap?.tiers[c.tier]?.name} protection</p>
                  <p className="meta">{STATE_TEXT[c.state]}</p>
                  {(() => {
                    const px = c.session.refPrice > 0n ? c.session.refPrice : snap?.feedPrice ?? 0n;
                    return px > 0n ? <p className="meta">{fmtTokens((c.notional * 10n ** 20n) / px)} stocks at ${fmtPx(px)} each</p> : null;
                  })()}
                </div>
                <dl className="covers__n">
                  <div><dt className="meta">Protected</dt><dd>${fmtUsd(c.notional)}</dd></div>
                  <div><dt className="meta">Fee</dt><dd>${fmtUsd(c.premium)}</dd></div>
                  <div><dt className="meta">{c.state === "paid" || c.state === "nopayout" ? "Paid" : c.state === "refunded" ? "Refund" : "Most we pay"}</dt>
                    <dd>${c.state === "paid" || c.state === "nopayout" ? fmtUsd(c.payout) : c.state === "refunded" ? fmtUsd(c.premium) : fmtUsd(c.maxPayout)}</dd></div>
                </dl>
              </li>
            ))}
          </ul>
          {me && me.claimable > 0n && (
            <MagneticButton
              small
              label={`Collect $${fmtUsd(me.claimable)}`}
              disabled={busy}
              onClick={() => void act(async () => { if (signer) await send(signer, need("pool"), POOL_ABI, "claim"); })}
            />
          )}
        </div>
      </div>
    </section>
  );
}
