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
    if (snap.locked) dep = { label: "Locked while cover is outstanding", disabled: true };
    else if (a === 0n) dep = { label: "Enter an amount", disabled: true };
    else if (a > me.usdc) dep = { label: "Not enough mUSDC", disabled: true };
    else if (busy) dep = { label: "Confirm in wallet…", disabled: true };
    else
      dep = {
        label: `Deposit ${fmtUsd(a)} USDC`,
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
        <p className="meta">Underwriters</p>
        <p className="lede">
          Underwriters supply the capital that pays holders. You earn the premiums. You lose part of your deposit when a gap is paid out.
          Every cover is fully collateralized, so the pool can never owe more than it holds.
        </p>
        <p className="meta rail__foot">
          Deposits and withdrawals are closed while any cover is outstanding, so nobody joins late for the premium or leaves early to dodge a loss.
        </p>
      </aside>
      <div className="stage">
        <p className="meta">{snap?.locked ? "Pool locked until the session settles" : "Open for deposits and withdrawals"}</p>
        <h1 className="display display--md">
          <span className="display__row">Earn the</span>
          <span className="display__row display__row--outline">premium.</span>
        </h1>

        <dl className="rows">
          <div><dt>Pool assets</dt><dd>{snap ? fmtUsd(snap.totalAssets) : "…"} USDC</dd></div>
          <div><dt>Reserved for payouts</dt><dd>{util.toFixed(2)}%</dd></div>
          <div><dt>Share price</dt><dd>{snap ? (Number(snap.sharePrice) / 1e18).toFixed(6) : "…"}</dd></div>
          <div><dt>Return since start</dt><dd>{yieldPct >= 0 ? "+" : ""}{yieldPct.toFixed(4)}%</dd></div>
          <div><dt>Your position</dt><dd>{me ? fmtUsd(me.shareValue) : "Connect to see"} USDC</dd></div>
        </dl>

        <div className="flow">
          <div className="flow__step">
            <p className="meta">Amount, mUSDC{me ? ` · you hold ${fmtUsd(me.usdc)}` : ""}</p>
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
                label="Withdraw all"
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
        <p className="meta field__legal">Underwriting carries smart contract risk even with test money. Unaudited. Not an offer or advice.</p>
      </div>
    </section>
  );
}
