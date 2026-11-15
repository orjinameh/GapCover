"use client";
import { useEffect, useState } from "react";
import { DEPLOYED, need } from "@/lib/config";
import { POOL_ABI, USDC_ABI } from "@/lib/abis";
import { ensureAllowance, send } from "@/lib/chain";
import { fmtUsd, parseUsd } from "@/lib/math";
import { readNetDeposits } from "@/lib/earnings";
import { useApp } from "./state";
import MagneticButton from "./MagneticButton";
import FeeMoneyNote from "./FeeMoneyNote";
import PoolFlow from "./PoolFlow";
import PoolHistory from "./PoolHistory";

export default function Underwrite() {
  const { snap, signer, setWalletOpen, wrongNetwork, switchNetwork, refresh } = useApp();
  const [amount, setAmount] = useState("1000");
  const [out, setOut] = useState("");
  const [net, setNet] = useState<bigint | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);

  const myAddr = snap?.me?.address;
  const myShares = snap?.me?.shares;
  useEffect(() => {
    if (!myAddr) { setNet(null); return; }
    let live = true;
    void readNetDeposits(myAddr).then((n) => live && setNet(n));
    return () => { live = false; };
  }, [myAddr, myShares]);

  if (!DEPLOYED) {
    return (
      <section className="market"><aside className="rail" /><div className="stage"><p className="meta warn">Contracts are not configured for this site yet.</p></div></section>
    );
  }
  const me = snap?.me;
  const a = parseUsd(amount);
  const util = snap && snap.totalAssets > 0n && snap.session ? Number((snap.session.reserved * 10_000n) / snap.totalAssets) / 100 : 0;
  const held = snap?.session ? snap.session.reserved : 0n;
  const free = snap ? (snap.totalAssets > held ? snap.totalAssets - held : 0n) : 0n;
  const o = parseUsd(out);
  const outShares = me && me.shareValue > 0n ? (o >= me.shareValue ? me.shares : (o * me.shares) / me.shareValue) : 0n;
  const earned = me && net !== null ? me.shareValue - net : null;
  const yieldPct = snap ? (Number(snap.sharePrice) / 1e18 - 1) * 100 : 0;

  async function act(_label: string, fn: () => Promise<void>) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ ok: true, t: "Done." });
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setMsg({ ok: false, t: /User rejected|denied/i.test(m) ? "Cancelled." : /missing or invalid|insufficient funds|exceeds the balance/i.test(m) ? "This account has no network fee money. Open Your account, copy the address and get free test ETH for Base Sepolia." : m.split("\n")[0] });
    } finally {
      setBusy(false);
      void refresh();
    }
  }

  let dep: { label: string; onClick?: () => void; disabled?: boolean } = { label: "Loading", disabled: true };
  if (!signer) dep = { label: "Connect", onClick: () => setWalletOpen(true) };
  else if (wrongNetwork) dep = { label: "Switch network", onClick: () => void switchNetwork() };
  else if (snap && me) {
    if (snap.locked) dep = { label: "Buying paused for now", disabled: true };
    else if (a === 0n) dep = { label: "Enter an amount", disabled: true };
    else if (a > me.usdc) dep = { label: "Not enough test dollars", disabled: true };
    else if (busy) dep = { label: "Confirm…", disabled: true };
    else
      dep = {
        label: `Buy $${fmtUsd(a)} of gGAP`,
        onClick: () =>
          void act("Deposit", async () => {
            await ensureAllowance(signer, a);
            await send(signer, need("pool"), POOL_ABI, "deposit", [a, signer.address]);
          }),
      };
  }

  return (
    <section className="market">
      <aside className="rail">
        <p className="meta">Earn from fees</p>
        <p className="lede">
          gGAP is your share of the money that pays people when their stock drops. Its price rises from their fees. In a big drop it falls.
        </p>
      </aside>
      <div className="stage">
        <p className="meta">{snap?.locked ? "Locked while protection is active" : "Open: add or take out money"}</p>
        <h1 className="display display--md">
          <span className="display__row">Buy</span>
          <span className="display__row display__row--outline">gGAP.</span>
        </h1>

        <PoolFlow />

        <dl className="rows">
          <div><dt>gGAP price</dt><dd>${snap ? (Number(snap.sharePrice) / 1e18).toFixed(4) : "…"}</dd></div>
          <div><dt>Your gGAP</dt><dd>{me ? (Number(me.shares) / 1e9).toLocaleString(undefined, { maximumFractionDigits: 2 }) : "Connect to see"}</dd></div>
          <div><dt>Money in the pool</dt><dd>${snap ? fmtUsd(snap.totalAssets) : "…"}</dd></div>
          <div><dt>Free to use</dt><dd>{snap ? `$${fmtUsd(free)}` : "…"}</dd></div>
          <div><dt>Held back for payouts</dt><dd>{snap ? `$${fmtUsd(held)}` : "…"} · {util.toFixed(0)}%</dd></div>
          <div><dt>Earned so far</dt><dd>{yieldPct >= 0 ? "+" : ""}{yieldPct.toFixed(2)}%</dd></div>
          <div><dt>Your money</dt><dd>{me ? `$${fmtUsd(me.shareValue)}` : "Connect to see"}</dd></div>
          {earned !== null && <div><dt>You earned</dt><dd>{earned < 0n ? "−" : "+"}${fmtUsd(earned < 0n ? -earned : earned)}</dd></div>}
        </dl>

        <PoolHistory tiers={snap?.tiers} refreshKey={`${snap?.activeId ?? 0}-${snap?.session?.status ?? 0}`} />

        <div className="flow">
          <div className="flow__step">
            <p className="meta">Dollars to spend on gGAP{me ? ` · you have $${fmtUsd(me.usdc)}` : ""}</p>
            <label className="field-in">
              <input aria-label="Amount to deposit" value={amount} inputMode="decimal" onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} />
            </label>
          </div>
        </div>

        {me && me.shares > 0n && (
          <div className="flow">
            <div className="flow__step">
              <p className="meta">Dollars of gGAP to sell</p>
              <label className="field-in">
                <input aria-label="Amount to withdraw" value={out} placeholder="0" inputMode="decimal" onChange={(e) => setOut(e.target.value.replace(/[^0-9.]/g, ""))} />
              </label>
              <div className="ex__chips">
                {[25, 50, 75].map((pc) => (
                  <button key={pc} type="button" className="ex-chip" onClick={() => setOut(fmtUsd((me.shareValue * BigInt(pc)) / 100n).replace(/,/g, ""))}>{pc}%</button>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="cta">
          <FeeMoneyNote />
          <div className="btnrow">
            <MagneticButton label={dep.label} onClick={dep.onClick} disabled={dep.disabled} />
            {signer && !wrongNetwork && me && me.shares > 0n && o > 0n && (
              <MagneticButton
                small
                label={`Sell $${fmtUsd(o >= me.shareValue ? me.shareValue : o)}`}
                disabled={busy || !!snap?.locked || outShares === 0n}
                onClick={() => void act("Withdrawal", async () => { await send(signer, need("pool"), POOL_ABI, "withdraw", [outShares, signer.address]); setOut(""); })}
              />
            )}
            {signer && !wrongNetwork && me && me.shares > 0n && (
              <MagneticButton
                small
                label="Sell all"
                disabled={busy || !!snap?.locked}
                onClick={() => void act("Withdrawal", async () => { await send(signer, need("pool"), POOL_ABI, "withdraw", [me.shares, signer.address]); })}
              />
            )}
            {signer && !wrongNetwork && me && me.usdc < 100n * 10n ** 6n && (
              <MagneticButton small label="Get practice money" disabled={busy} onClick={() => void act("Faucet", async () => { await send(signer, need("usdc"), USDC_ABI, "faucet", [signer.address, 5_000n * 10n ** 6n]); })} />
            )}
          </div>
          {msg && <p className={`meta ${msg.ok ? "ok" : "warn"}`}>{msg.t}</p>}
        </div>
        <div className="meta field__legal">
          <p><b>Risk:</b> gGAP can lose value, and in a market crash it can lose a lot at once. Selling is paused while protection is active.</p>
          <p><b>Practice version:</b> play money, nothing here is real. Not advice.</p>
        </div>
      </div>
    </section>
  );
}
