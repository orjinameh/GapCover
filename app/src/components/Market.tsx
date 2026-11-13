"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { CHAIN, DEPLOYED, DEMO_TOKENS, TICKER, need } from "@/lib/config";
import { POOL_ABI, STOCK_ABI, USDC_ABI } from "@/lib/abis";
import { ensureAllowance, phaseOf, secondsLeft, send } from "@/lib/chain";
import { fmtPx, fmtSigned, fmtTokens, fmtUsd, notionalOf, parseTokens, payoutOf, premiumOf } from "@/lib/math";
import { readMyCovers, STATE_TEXT, type MyCover } from "@/lib/covers";
import { useApp } from "./state";
import MagneticButton from "./MagneticButton";

const when = (ts: bigint) => new Date(Number(ts) * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const GAPS = [3, 6, 10, 20];

export default function Market() {
  const { snap, signer, setWalletOpen, wrongNetwork, switchNetwork, refresh } = useApp();
  const [tokens, setTokens] = useState("100");
  const [tierIdx, setTierIdx] = useState(1);
  const [step, setStep] = useState<null | "approve" | "buy">(null);
  const [done, setDone] = useState<string | null>(null);
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
  const sale = view?.phase.phase === "sale";

  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setErr(null);
    setDone(null);
    try {
      await fn();
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setErr(/User rejected|denied/i.test(m) ? "Cancelled in your wallet." : m.split("\n")[0]);
    } finally {
      setBusy(false);
      setStep(null);
      setReload((n) => n + 1);
      void refresh();
    }
  }

  const buy = () =>
    act(async () => {
      if (!signer || !snap || !view) return;
      setStep("approve");
      await ensureAllowance(signer, view.premium);
      setStep("buy");
      const r = await send(signer, need("pool"), POOL_ABI, "buyCover", [snap.activeId, view.raw, tierIdx]);
      setDone(r.transactionHash);
    });

  const faucet = () =>
    act(async () => {
      if (!signer) return;
      await send(signer, need("usdc"), USDC_ABI, "faucet", [signer.address, 1_000n * 10n ** 6n]);
      await send(signer, need("stock"), STOCK_ABI, "mint", [signer.address, DEMO_TOKENS]);
    });

  // primary action state
  let cta: { label: string; onClick?: () => void; disabled?: boolean; note?: string } = { label: "…", disabled: true };
  if (!signer) cta = { label: "Connect wallet", onClick: () => setWalletOpen(true) };
  else if (wrongNetwork) cta = { label: `Switch to ${CHAIN.name}`, onClick: () => void switchNetwork() };
  else if (!snap || !view || !me) cta = { label: "Loading", disabled: true };
  else if (!sale) cta = { label: "No cover on sale", disabled: true, note: "Cover is sold while the market is open, before each close. Next session will show here." };
  else if (view.raw === 0n) cta = { label: "Enter an amount", disabled: true };
  else if (view.raw > me.tokens) cta = { label: `Not enough ${TICKER}`, disabled: true, note: `You hold ${fmtTokens(me.tokens)} ${TICKER}.` };
  else if (view.premium > me.usdc) cta = { label: "Not enough mUSDC", disabled: true, note: `The premium is ${fmtUsd(view.premium)} mUSDC.` };
  else if (view.notional < 10_000_000n) cta = { label: "Minimum cover is 10 USDC", disabled: true };
  else if (busy) cta = { label: step === "approve" ? "Approve in wallet…" : "Confirm in wallet…", disabled: true };
  else cta = { label: `Buy cover · ${fmtUsd(view.premium)} USDC`, onClick: () => void buy() };

  const lowFunds = !!me && (me.usdc < 100n * 10n ** 6n || me.tokens < DEMO_TOKENS);
  const txUrl = done && CHAIN.blockExplorers ? `${CHAIN.blockExplorers.default.url}/tx/${done}` : null;

  return (
    <section className="market">
      <aside className="rail">
        <p className="meta">{TICKER} · mock stock token</p>
        <div>
          <p className="big">{snap ? fmtPx(snap.feedPrice) : "…"}</p>
          <p className="meta">Last feed price, USD{snap ? ` · updated ${when(snap.feedUpdatedAt)}` : ""}</p>
          <dl className="rows">
            <div><dt>Market</dt><dd>{view?.phase.label ?? "…"}</dd></div>
            {left !== null && <div><dt>{view?.phase.phase === "sale" ? "Closes in" : "Opens in"}</dt><dd>{left}s</dd></div>}
            {snap?.session && <div><dt>Close / open</dt><dd>{when(snap.session.closeTime)} / {when(snap.session.openTime)}</dd></div>}
            <div><dt>Pool capacity</dt><dd>{snap ? fmtUsd(snap.totalAssets, 0) : "…"}</dd></div>
          </dl>
        </div>
        <div className="rail__foot">
          <p className="meta">Cover terms</p>
          <ol className="terms">
            {snap?.tiers.map((t) => (
              <li key={t.name}>
                <span>{t.name}</span>
                <span className="meta">{t.deductibleBps / 100}% deductible · {t.capBps / 100}% cap · {t.premiumBps / 100}% premium</span>
              </li>
            ))}
          </ol>
        </div>
      </aside>

      <div className="stage">
        <p className="meta">Programmable stock markets · parametric cover</p>
        <h1 className="display display--md">
          <span className="display__row">Protect your stocks against</span>
          <span className="display__row display__row--outline">overnight drops.</span>
        </h1>
        <p className="lede lede--wide">
          GapCover helps protect tokenized stock positions against big price drops between market close and the next market opening.
          Choose a stock, pick your protection level and pay a premium. If the stock opens below the agreed threshold, you can receive a payout.
          If no reliable opening price is available, nothing settles and your premium is refunded.
        </p>
        <details className="lede lede--wide">
          <summary className="meta">What is covered, what is not, and where the price comes from</summary>
          <p className="meta"><b>Covered:</b> a fall in the stock&apos;s price between the last price before the close and the first fresh price after the open, beyond your deductible, up to your cap.</p>
          <p className="meta"><b>Not covered:</b> price moves during trading hours, drops that recover before the open, losses from a stock split or other corporate action (the session is cancelled and premiums refunded), hacks, and anything below your deductible.</p>
          <p className="meta"><b>How a payout is calculated:</b> you are paid for the part of the drop beyond your deductible, up to your cap, multiplied by the value you covered. Example: 6% drop, 2% deductible, 10% cap pays 4% of your covered value.</p>
          <p className="meta"><b>Where the price comes from:</b> on this testnet, a mock price feed that anyone can move. It is not a real market price. A live version would settle only on the first fresh price a trusted equity feed publishes after the open.</p>
          <p className="meta"><b>Real or simulated:</b> everything here is simulated. Mock tokens, mock prices, no real money, no real insurance.</p>
        </details>

        <div className="flow">
          <div className="flow__step">
            <p className="meta">01 · How much</p>
            <label className="field-in">
              <input
                aria-label={`${TICKER} to cover`}
                value={tokens}
                inputMode="decimal"
                onChange={(e) => setTokens(e.target.value.replace(/[^0-9.]/g, ""))}
              />
            </label>
            <p className="meta">
              {TICKER} to cover{me ? ` · you hold ${fmtTokens(me.tokens)}` : ""}
              {me && me.tokens > 0n && (
                <button className="linkbtn" onClick={() => setTokens(fmtTokens(me.tokens).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, ""))}>Max</button>
              )}
            </p>
          </div>

          <div className="flow__step">
            <p className="meta">02 · How protected</p>
            <ul className="tierlist">
              {snap?.tiers.map((t, i) => (
                <li key={t.name}>
                  <button className={i === tierIdx ? "on" : ""} onClick={() => setTierIdx(i)} aria-pressed={i === tierIdx}>
                    <span>{t.name}</span>
                    <span className="meta">pays after {t.deductibleBps / 100}% · up to {t.capBps / 100}% · costs {t.premiumBps / 100}%</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="flow__step">
            <p className="meta">03 · Your quote</p>
            {view && (
              <>
                <dl className="rows">
                  <div><dt>Value covered</dt><dd>{fmtUsd(view.notional)} USDC</dd></div>
                  <div><dt>You pay now</dt><dd>{fmtUsd(view.premium)} USDC</dd></div>
                  <div><dt>Most you can receive</dt><dd>{fmtUsd(view.maxPayout)} USDC</dd></div>
                </dl>
                <table className="scen">
                  <caption className="meta">If the first price after the open is…</caption>
                  <thead>
                    <tr><th className="meta">Lower by</th><th className="meta">Your tokens lose</th><th className="meta">Cover pays</th></tr>
                  </thead>
                  <tbody>
                    {GAPS.map((g) => {
                      const settle = (snap!.feedPrice * BigInt(10_000 - g * 100)) / 10_000n;
                      const pay = payoutOf(view.notional, view.tier, snap!.feedPrice, settle);
                      return (
                        <tr key={g}>
                          <td>{g}%</td>
                          <td>{fmtSigned(-(view.notional * BigInt(g)) / 100n)}</td>
                          <td>{fmtSigned(pay)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </>
            )}
          </div>
        </div>

        <div className="cta">
          <MagneticButton label={cta.label} onClick={cta.onClick} disabled={cta.disabled} />
          {cta.note && <p className="meta">{cta.note}</p>}
          {lowFunds && signer && !wrongNetwork && (
            <p className="meta">
              Need test funds? <button className="linkbtn" disabled={busy} onClick={() => void faucet()}>Get 1,000 mUSDC and 100 {TICKER}</button>
            </p>
          )}
          {!sale && snap && !snap.session && (
            <p className="meta">Sessions are opened by the keeper. On this testnet anyone can open one from the <a className="linkbtn" href="/demo">Demo page</a>.</p>
          )}
          {done && (
            <p className="meta ok">
              Cover bought. {txUrl ? <a className="linkbtn" href={txUrl} target="_blank" rel="noreferrer">View transaction</a> : null}
            </p>
          )}
          {err && <p className="meta warn">{err}</p>}
        </div>

        <div className="mine" id="covers">
          <h2 className="h2">My covers</h2>
          {!signer && <p className="meta">Connect a wallet to see your covers.</p>}
          {signer && covers && covers.length === 0 && <p className="meta">No covers yet. Buy one above.</p>}
          {signer && !covers && <p className="meta">Loading…</p>}
          <ul className="covers">
            {covers?.map((c) => (
              <li key={`${c.sessionId}-${c.coverId}`}>
                <div>
                  <p className="covers__t">Session {c.sessionId.toString()} · {snap?.tiers[c.tier]?.name}</p>
                  <p className="meta">{STATE_TEXT[c.state]}</p>
                </div>
                <dl className="covers__n">
                  <div><dt className="meta">Covered</dt><dd>{fmtUsd(c.notional)}</dd></div>
                  <div><dt className="meta">Premium</dt><dd>{fmtUsd(c.premium)}</dd></div>
                  <div><dt className="meta">{c.state === "paid" || c.state === "nopayout" ? "Paid" : c.state === "refunded" ? "Refund" : "Max payout"}</dt>
                    <dd>{c.state === "paid" || c.state === "nopayout" ? fmtUsd(c.payout) : c.state === "refunded" ? fmtUsd(c.premium) : fmtUsd(c.maxPayout)}</dd></div>
                </dl>
              </li>
            ))}
          </ul>
          {me && me.claimable > 0n && (
            <MagneticButton
              small
              label={`Claim ${fmtUsd(me.claimable)} USDC`}
              disabled={busy}
              onClick={() => void act(async () => { if (signer) await send(signer, need("pool"), POOL_ABI, "claim"); })}
            />
          )}
        </div>
      </div>
    </section>
  );
}
