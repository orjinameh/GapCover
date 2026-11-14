"use client";
import { useState } from "react";
import { DEPLOYED, need } from "@/lib/config";
import { POOL_ABI, USDC_ABI } from "@/lib/abis";
import { ensureAllowance, send } from "@/lib/chain";
import { fmtUsd, parseUsd } from "@/lib/math";
import { useApp } from "./state";
import MagneticButton from "./MagneticButton";
import PoolFlow from "./PoolFlow";
import PoolHistory from "./PoolHistory";

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

  async function act(_label: string, fn: () => Promise<void>) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ ok: true, t: "Done." });
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      setMsg({ ok: false, t: /User rejected|denied/i.test(m) ? "Cancelled." : m.split("\n")[0] });
    } finally {
      setBusy(false);
      void refresh();
    }
  }

  let dep: { label: string; onClick?: () => void; disabled?: boolean } = { label: "Loading", disabled: true };
  if (!signer) dep = { label: "Connect", onClick: () => setWalletOpen(true) };
  else if (wrongNetwork) dep = { label: "Switch network", onClick: () => void switchNetwork() };
  else if (snap && me) {
    if (snap.locked) dep = { label: "Locked for now", disabled: true };
    else if (a === 0n) dep = { label: "Enter an amount", disabled: true };
    else if (a > me.usdc) dep = { label: "Not enough test dollars", disabled: true };
    else if (busy) dep = { label: "Confirm…", disabled: true };
    else
      dep = {
        label: `Add $${fmtUsd(a)}`,
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
          Add money that pays people when their stock drops. Earn their fees. Big drop? You can lose some of your money.
        </p>
      </aside>
      <div className="stage">
        <p className="meta">{snap?.locked ? "Locked while protection is active" : "Open: add or take out money"}</p>
        <h1 className="display display--md">
          <span className="display__row">Earn from</span>
          <span className="display__row display__row--outline">the fees.</span>
        </h1>

        <PoolFlow />

        <dl className="rows">
          <div><dt>Money in the pool</dt><dd>${snap ? fmtUsd(snap.totalAssets) : "…"}</dd></div>
          <div><dt>Held back for payouts</dt><dd>{util.toFixed(0)}%</dd></div>
          <div><dt>Earned so far</dt><dd>{yieldPct >= 0 ? "+" : ""}{yieldPct.toFixed(2)}%</dd></div>
          <div><dt>Your money</dt><dd>{me ? `$${fmtUsd(me.shareValue)}` : "Connect to see"}</dd></div>
        </dl>

        <PoolHistory tiers={snap?.tiers} refreshKey={`${snap?.activeId ?? 0}-${snap?.session?.status ?? 0}`} />

        <div className="flow">
          <div className="flow__step">
            <p className="meta">Amount to add, in dollars{me ? ` · you have $${fmtUsd(me.usdc)}` : ""}</p>
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
              <MagneticButton small label="Get practice money" disabled={busy} onClick={() => void act("Faucet", async () => { await send(signer, need("usdc"), USDC_ABI, "faucet", [signer.address, 5_000n * 10n ** 6n]); })} />
            )}
          </div>
          {msg && <p className={`meta ${msg.ok ? "ok" : "warn"}`}>{msg.t}</p>}
        </div>
        <div className="meta field__legal">
          <p><b>Risk:</b> you can lose some or all of this money. It is locked while protection is active.</p>
          <p><b>Practice version:</b> play money, nothing here is real. Not advice.</p>
        </div>
      </div>
    </section>
  );
}
