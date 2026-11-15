"use client";
import { useEffect, useState } from "react";
import type { Abi } from "viem";
import { need } from "@/lib/config";
import { friendlyError } from "@/lib/friendly";
import { POOL_ABI } from "@/lib/abis";
import { ensureAllowance, pub, send } from "@/lib/chain";
import { fmtTokens, fmtUsd } from "@/lib/math";
import { useApp } from "./state";
import MagneticButton from "./MagneticButton";

type SubState = { active: boolean; tier: number; since: bigint; cancelAfter: bigint; raw: bigint; nights: bigint };

/** Weekly subscription: the same protection, renewed every weekend. Sits under the one-off Protect button. */
export default function Subscribe({ raw, tierIdx, tierName, premium }: { raw: bigint; tierIdx: number; tierName: string; premium: bigint }) {
  const { snap, signer, wrongNetwork, refresh } = useApp();
  const [sub, setSub] = useState<SubState | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const addr = signer?.address;
  const sessionKey = `${snap?.activeId ?? 0}-${snap?.session?.status ?? 0}`;

  useEffect(() => {
    if (!addr) { setSub(null); return; }
    let live = true;
    const rd = <T,>(functionName: string, args: readonly unknown[] = []) =>
      pub.readContract({ address: need("pool"), abi: POOL_ABI as Abi, functionName, args }) as Promise<T>;
    void Promise.all([rd<readonly [boolean, boolean, number, bigint, bigint, bigint]>("subs", [addr]), rd<bigint>("sessionCount")])
      .then(([s, n]) => live && setSub({ active: s[0], tier: Number(s[2]), since: s[3], cancelAfter: s[4], raw: s[5], nights: n }))
      .catch(() => {});
    return () => { live = false; };
  }, [addr, sessionKey, busy]);

  async function act(fn: () => Promise<void>, okText: string) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ ok: true, t: okText });
    } catch (e) {
      setMsg({ ok: false, t: friendlyError(e instanceof Error ? e.message : String(e)) });
    } finally {
      setBusy(false);
      void refresh();
    }
  }

  const running = !!sub && sub.active && sub.cancelAfter === 0n;
  const ending = !!sub && sub.active && sub.cancelAfter !== 0n;
  const firstNight = sub ? sub.since + 2n : 0n;
  const waiting = !!sub && sub.active && sub.nights < firstNight;
  const weeksToStart = sub ? Number(firstNight - sub.nights) : 0;
  const ready = !!signer && !wrongNetwork && !!snap?.me;
  const have = snap?.me?.tokens ?? 0n;
  const why = !signer
    ? "Connect to subscribe."
    : wrongNetwork
      ? "Switch to the right network to subscribe."
      : !snap?.me
        ? "Loading your account…"
        : raw === 0n
          ? "Enter how many stocks to protect, above."
          : raw > have
            ? `You have ${fmtTokens(have)} stocks and are trying to protect ${fmtTokens(raw)}. Lower the amount, or get practice money above.`
            : null;

  return (
    <div className="mine">
      <h2 className="h2">Protect every weekend</h2>
      <p className="meta">
        The same protection, renewed for you each weekend, so you never forget. Each weekend the fee is taken from your account. If you can&apos;t pay one week, that weekend simply isn&apos;t covered and you owe nothing.
      </p>
      <p className="meta">
        <b>Rules:</b> protection starts on the second weekend after you join, so nobody can join just before bad news. If you cancel, one more weekend is still covered, then it stops. To change the amount, cancel and join again.
      </p>

      {sub && running && (
        <dl className="rows">
          <div><dt>Your subscription</dt><dd>{waiting ? `Starts in ${weeksToStart} weekends` : "Running"}</dd></div>
          <div><dt>Stocks protected</dt><dd>{fmtTokens(sub.raw)}</dd></div>
          <div><dt>Level</dt><dd>{snap?.tiers[sub.tier]?.name ?? ""}</dd></div>
        </dl>
      )}
      {sub && ending && <p className="meta">Cancelled. One more weekend is still covered, then it stops.</p>}

      <div className="btnrow">
        {ready && !running && (
          <MagneticButton
            small
            label={raw > 0n ? `Subscribe · about $${fmtUsd(premium)} a weekend` : "Subscribe"}
            disabled={busy || raw === 0n || raw > (snap?.me?.tokens ?? 0n)}
            onClick={() =>
              void act(async () => {
                if (!signer) return;
                await ensureAllowance(signer, premium);
                await send(signer, need("pool"), POOL_ABI, "subscribe", [tierIdx, raw]);
              }, `Subscribed: ${fmtTokens(raw)} stocks at the ${tierName} level.`)
            }
          />
        )}
        {ready && running && (
          <MagneticButton small label="Cancel subscription" disabled={busy} onClick={() => void act(async () => { if (signer) await send(signer, need("pool"), POOL_ABI, "cancelSubscription"); }, "Cancelled.")} />
        )}
      </div>
      {!running && why && <p className="meta warn">{why}</p>}
      <p className="meta">Subscribing lets the pool take each weekend&apos;s fee from your account. You can stop it any time by cancelling here, or by removing the permission in your wallet.</p>
      {msg && <p className={`meta ${msg.ok ? "ok" : "warn"}`}>{msg.t}</p>}
    </div>
  );
}
