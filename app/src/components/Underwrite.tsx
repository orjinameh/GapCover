"use client";
import { useState } from "react";
import { CHAIN, DEPLOYED, need } from "@/lib/config";
import { POOL_ABI, USDC_ABI } from "@/lib/abis";
import { ensureAllowance, send } from "@/lib/chain";
import { fmtUsd, parseUsd } from "@/lib/math";
import { useApp } from "./state";
import MagneticButton from "./MagneticButton";

export default function Underwrite() {
  const { snap, signer, setWalletOpen, wrongNetwork, switchNetwork, refresh } = useApp();
  const [amount, setAmount] = useState("1000");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);

  if (!DEPLOYED) {
    return (
      <section className="market"><aside className="rail" /><div className="stage"><p className="meta warn">Contracts are not configured for this site yet.</p></div></section>
    );
  }
  const me = snap?.me;
  const a = parseUsd(amount);
  const util = snap && snap.totalAssets > 0n && snap.session ? Number((snap.session.reserved * 10_000n) / snap.totalAssets) / 100 : 0;
  const yieldPct = snap ? (Number(snap.sharePrice) / 1e18 - 1) * 100 : 0;

  async function act(label: string, fn: () => Promise<void>) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ ok: true, t: `${label} confirmed.` });
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setMsg({ ok: false, t: /User rejected|denied/i.test(m) ? "Cancelled in your wallet." : m.split("\n")[0] });
    } finally {
      setBusy(false);
      void refresh();
    }
  }

  let dep: { label: string; onClick?: () => void; disabled?: boolean } = { label: "Loading", disabled: true };
  if (!signer) dep = { label: "Connect wallet", onClick: () => setWalletOpen(true) };
  else if (wrongNetwork) dep = { label: `Switch to ${CHAIN.name}`, onClick: () => void switchNetwork() };
  else if (snap && me) {
    if (snap.locked) dep = { label: "Locked while stock protection is active", disabled: true };
    else if (a === 0n) dep = { label: "Enter an amount", disabled: true };
    else if (a > me.usdc) dep = { label: "Not enough test dollars", disabled: true };
    else if (busy) dep = { label: "Confirm in wallet…", disabled: true };
    else
      dep = {
        label: `Add ${fmtUsd(a)} USDC`,
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
        <p className="meta">Provide liquidity</p>
        <p className="lede">
          Other people pay a fee to protect their stocks. You put in money that pays them if their stock drops. In return, you earn a share of those fees.
          If a payout happens, your share of that cost comes out of your money, so you can lose part of what you put in.
        </p>
        <p className="meta">
          You are not buying a new coin. You add USDC and get shares that track your slice of the pool. A share is worth more as fees arrive and less when payouts are made.
        </p>
        <p className="meta rail__foot">
          You cannot add or take out money while stock protection is active. This stops people joining at the last minute for the fees, or leaving early to avoid a loss.
        </p>
      </aside>
      <div className="stage">
        <p className="meta">{snap?.locked ? "Locked until the current round ends" : "Open: you can add or take out money"}</p>
        <h1 className="display display--md">
          <span className="display__row">Earn from</span>
          <span className="display__row display__row--outline">the fees.</span>
        </h1>

        <dl className="rows">
          <div><dt>Total money in the pool</dt><dd>{snap ? fmtUsd(snap.totalAssets) : "…"} USDC</dd></div>
          <div><dt>Set aside for possible payouts</dt><dd>{util.toFixed(2)}%</dd></div>
          <div><dt>Value of one share</dt><dd>{snap ? (Number(snap.sharePrice) / 1e18).toFixed(6) : "…"}</dd></div>
          <div><dt>Gain or loss since start</dt><dd>{yieldPct >= 0 ? "+" : ""}{yieldPct.toFixed(4)}%</dd></div>
          <div><dt>Your money in the pool</dt><dd>{me ? fmtUsd(me.shareValue) : "Connect to see"} USDC</dd></div>
        </dl>

        <div className="flow">
          <div className="flow__step">
            <p className="meta">Amount to add, in test dollars (mUSDC){me ? ` · you hold ${fmtUsd(me.usdc)}` : ""}</p>
            <label className="field-in">
              <input aria-label="Amount to deposit" value={amount} inputMode="decimal" onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} />
            </label>
          </div>
        </div>

        <div className="cta">
          <div className="btnrow">
            <MagneticButton label={dep.label} onClick={dep.onClick} disabled={dep.disabled} />
            {signer && !wrongNetwork && me && me.shares > 0n && (
              <MagneticButton
                small
                label="Take out all"
                disabled={busy || !!snap?.locked}
                onClick={() => void act("Withdrawal", async () => { await send(signer, need("pool"), POOL_ABI, "withdraw", [me.shares, signer.address]); })}
              />
            )}
            {signer && !wrongNetwork && me && me.usdc < 100n * 10n ** 6n && (
              <MagneticButton small label="Get test mUSDC" disabled={busy} onClick={() => void act("Faucet", async () => { await send(signer, need("usdc"), USDC_ABI, "faucet", [signer.address, 5_000n * 10n ** 6n]); })} />
            )}
          </div>
          {msg && <p className={`meta ${msg.ok ? "ok" : "warn"}`}>{msg.t}</p>}
        </div>
        <div className="meta field__legal">
          <p><b>The risk:</b> you can lose some or all of the money you add. If a stock drops a lot, the pool pays the people who bought protection, and that cost is shared by everyone in the pool, including you.</p>
          <p>Your money is stuck while protection is active, so you cannot take it out early.</p>
          <p><b>This is a test:</b> the pool was filled with play money by the developer, not by real investors. Nothing here is real money or real insurance. Not financial advice.</p>
        </div>
      </div>
    </section>
  );
}
