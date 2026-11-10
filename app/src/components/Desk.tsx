"use client";
import { useState } from "react";
import { DEMO_TOKENS, DEPLOYED, need } from "@/lib/config";
import { POOL_ABI, STOCK_ABI, USDC_ABI } from "@/lib/abis";
import { STATUS, ensureAllowance, phaseOf, send } from "@/lib/chain";
import { fmtPx, fmtTokens, fmtUsd, notionalOf, parseTokens, parseUsd, payoutOf, premiumOf } from "@/lib/math";
import { useApp } from "./state";
import MagneticButton from "./MagneticButton";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export default function Desk() {
  const { snap, signer, demo, connectBrowser, useDemo, refresh } = useApp();
  const [tokens, setTokens] = useState("100");
  const [tierIdx, setTierIdx] = useState(1);
  const [amount, setAmount] = useState("1000");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function act(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setMsg(null);
    try {
      await fn();
      setMsg(`${label}: done`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message.split("\n")[0] : String(e));
    } finally {
      setBusy(null);
      void refresh();
    }
  }

  if (!DEPLOYED || !snap) {
    return (
      <section id="desk" className="desk">
        <aside className="rail"><p className="meta">Index<br />03 / Desks</p></aside>
        <div className="stage"><p className="meta warn">{DEPLOYED ? "Reading chain…" : "Contracts not configured."}</p></div>
      </section>
    );
  }

  const me = snap.me;
  const tier = snap.tiers[tierIdx];
  const raw = parseTokens(tokens);
  const notional = notionalOf(raw, snap.feedPrice);
  const premium = premiumOf(notional, tier.premiumBps);
  const maxPayout = (notional * BigInt(tier.capBps)) / 10_000n;
  const phase = phaseOf(snap);
  const canBuy = !!signer && !!me && phase.phase === "sale" && raw > 0n && !busy;
  const util = snap.totalAssets > 0n && snap.session ? Number((snap.session.reserved * 10_000n) / snap.totalAssets) / 100 : 0;
  const yieldPct = (Number(snap.sharePrice) / 1e18 - 1) * 100;
  const sess = snap.session;
  const settledPreview = sess && sess.status === STATUS.Closed ? payoutOf(notional, tier, sess.refPrice, snap.feedPrice) : null;

  return (
    <section id="desk" className="desk">
      <aside className="rail">
        <p className="meta">Index<br />03 / Desks</p>
        <div>
          <p className="meta">Active wallet · {signer?.kind ?? "none"}</p>
          <p className="addr">{signer ? short(signer.address) : "…"}</p>
          <div className="seg">
            <button className={signer?.kind === "demo" ? "on" : ""} onClick={useDemo}>Demo</button>
            <button className={signer?.kind === "browser" ? "on" : ""} onClick={() => void connectBrowser()}>Browser wallet</button>
          </div>
        </div>
        <p className="meta rail__foot">
          ETH {me ? (Number(me.eth) / 1e18).toFixed(4) : "…"}<br />
          mUSDC {me ? fmtUsd(me.usdc) : "…"}<br />
          NVDAm {me ? fmtTokens(me.tokens) : "…"}<br />
          Feed {fmtPx(snap.feedPrice)} · spot {fmtPx(snap.spot)}
        </p>
      </aside>

      <div className="stage stage--desk">
        <div className="desk__cols">
          <div className="col">
            <h2 className="h2">Cover desk</h2>
            <p className="meta">{phase.label}</p>
            <label className="field-in">
              <span className="meta">Tokens to cover (raw)</span>
              <input value={tokens} inputMode="decimal" onChange={(e) => setTokens(e.target.value)} />
            </label>
            <div className="seg">
              {snap.tiers.map((t, i) => (
                <button key={t.name} className={i === tierIdx ? "on" : ""} onClick={() => setTierIdx(i)}>{t.name}</button>
              ))}
            </div>
            <dl className="rows">
              <div><dt>Notional at feed price</dt><dd>{fmtUsd(notional)}</dd></div>
              <div><dt>Premium ({tier.premiumBps / 100}%)</dt><dd>{fmtUsd(premium)}</dd></div>
              <div><dt>Deductible / cap</dt><dd>{tier.deductibleBps / 100}% / {tier.capBps / 100}%</dd></div>
              <div><dt>Max payout</dt><dd>{fmtUsd(maxPayout)}</dd></div>
            </dl>
            <div className="btnrow">
              <MagneticButton
                small
                label={busy === "Buy cover" ? "Buying…" : "Buy cover"}
                disabled={!canBuy}
                onClick={() =>
                  void act("Buy cover", async () => {
                    if (!signer) return;
                    await ensureAllowance(signer, premium);
                    await send(signer, need("pool"), POOL_ABI, "buyCover", [snap.activeId, raw, tierIdx]);
                  })
                }
              />
              <MagneticButton
                small
                label="Test tokens"
                disabled={!signer || !!busy}
                onClick={() =>
                  void act("Test tokens", async () => {
                    if (!signer) return;
                    await send(signer, need("usdc"), USDC_ABI, "faucet", [signer.address, 1_000n * 10n ** 6n]);
                    await send(signer, need("stock"), STOCK_ABI, "mint", [signer.address, DEMO_TOKENS]);
                  })
                }
              />
            </div>
            {settledPreview !== null && <p className="meta">If settled at the current feed price: {fmtUsd(settledPreview)} payout</p>}
            {me && me.claimable > 0n && (
              <MagneticButton small label={`Claim ${fmtUsd(me.claimable)}`} onClick={() => void act("Claim", async () => { if (signer) await send(signer, need("pool"), POOL_ABI, "claim"); })} />
            )}
          </div>

          <div className="col col--shift">
            <h2 className="h2 h2--outline">Underwrite</h2>
            <p className="meta">{snap.locked ? "Locked while cover is outstanding" : "Open for deposits and withdrawals"}</p>
            <dl className="rows">
              <div><dt>Pool assets</dt><dd>{fmtUsd(snap.totalAssets)}</dd></div>
              <div><dt>Utilization (reserved)</dt><dd>{util.toFixed(2)}%</dd></div>
              <div><dt>Share price</dt><dd>{(Number(snap.sharePrice) / 1e18).toFixed(6)}</dd></div>
              <div><dt>Yield since start</dt><dd>{yieldPct >= 0 ? "+" : ""}{yieldPct.toFixed(4)}%</dd></div>
              <div><dt>Your position</dt><dd>{me ? fmtUsd(me.shareValue) : "…"}</dd></div>
            </dl>
            <label className="field-in">
              <span className="meta">Amount, mUSDC</span>
              <input value={amount} inputMode="decimal" onChange={(e) => setAmount(e.target.value)} />
            </label>
            <div className="btnrow">
              <MagneticButton
                small
                label="Deposit"
                disabled={!signer || !!busy || snap.locked}
                onClick={() =>
                  void act("Deposit", async () => {
                    if (!signer) return;
                    const a = parseUsd(amount);
                    await ensureAllowance(signer, a);
                    await send(signer, need("pool"), POOL_ABI, "deposit", [a, signer.address]);
                  })
                }
              />
              <MagneticButton
                small
                label="Withdraw all"
                disabled={!signer || !!busy || snap.locked || !me || me.shares === 0n}
                onClick={() =>
                  void act("Withdraw", async () => {
                    if (!signer || !me) return;
                    await send(signer, need("pool"), POOL_ABI, "withdraw", [me.shares, signer.address]);
                  })
                }
              />
            </div>
          </div>
        </div>
        {msg && <p className="meta">{msg}</p>}
        <p className="meta field__legal">
          Underwriting is testnet only and carries real smart contract risk even with mock money. Not an offer. Not available to U.S. persons.
        </p>
      </div>
    </section>
  );
}
