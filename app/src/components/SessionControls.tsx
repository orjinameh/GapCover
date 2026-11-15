"use client";
import { useState } from "react";
import { friendlyError } from "@/lib/friendly";
import { DEMO_MANUAL, START_PRICE, need } from "@/lib/config";
import { FEED_ABI, KEEPER_ABI, POOL_ABI, SPOT_ABI } from "@/lib/abis";
import { STATUS, phaseOf, pub, send } from "@/lib/chain";
import { useApp } from "./state";
import MagneticButton from "./MagneticButton";

/** Manual session lifecycle for the testnet demo keeper. Works with any connected wallet. */
export default function SessionControls() {
  const { snap, signer, refresh } = useApp();
  const [gapPct, setGapPct] = useState("6");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  if (!snap) return null;

  const sess = snap.session;
  const phase = phaseOf(snap);
  const status = sess?.status ?? STATUS.None;
  const idle = !busy && !!signer;
  const canOpen = idle && phase.phase === "idle";
  const canClose = idle && phase.phase === "frozen" && status === STATUS.Scheduled;
  const canSettle = idle && phase.phase === "await" && status === STATUS.Closed;
  const canVoid = idle && !!sess && (status === STATUS.Scheduled || status === STATUS.Closed) && phase.phase !== "sale";

  async function act(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setMsg(null);
    try {
      await fn();
      setMsg(`${label}: done`);
    } catch (e) {
      setMsg(friendlyError(e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(null);
      void refresh();
    }
  }

  return (
    <div className="controls">
      <p className="meta">By hand · {phase.label}</p>
      <div className="btnrow btnrow--tight">
        <MagneticButton small label="Start a night" disabled={!canOpen} onClick={() => void act("Start a night", async () => { if (!signer) return;
            // a fresh price first, so the pool does not refuse sales because the last price is old
            const last = (await pub.readContract({ address: need("feed"), abi: FEED_ABI, functionName: "latestRoundData" })) as readonly [bigint, bigint, bigint, bigint, bigint];
            const px = last[1] > 0n ? last[1] : START_PRICE;
            await send(signer, need("feed"), FEED_ABI, "pushRound", [px]);
            await send(signer, need("spot"), SPOT_ABI, "setPrice", [need("stock"), px]);
            await send(signer, need("keeper"), KEEPER_ABI, "scheduleNow", [need("pool"), DEMO_MANUAL.closeIn, DEMO_MANUAL.openIn]) })} />
        <MagneticButton small label="Close the market" disabled={!canClose} onClick={() => void act("Close the market", async () => { if (signer) await send(signer, need("pool"), POOL_ABI, "closeSession", [snap.activeId]); })} />
        <label className="gapin">
          <span className="meta">Drop %</span>
          <input value={gapPct} inputMode="decimal" onChange={(e) => setGapPct(e.target.value)} />
        </label>
        <MagneticButton
          small
          label="Open at new price and pay"
          disabled={!canSettle}
          onClick={() =>
            void act("Pay out", async () => {
              if (!signer || !sess) return;
              const g = BigInt(Math.round(Math.max(0, Math.min(Number(gapPct) || 0, 90)) * 100));
              const price = (sess.refPrice * (10_000n - g)) / 10_000n;
              await send(signer, need("feed"), FEED_ABI, "pushRound", [price]);
              await send(signer, need("spot"), SPOT_ABI, "setPrice", [need("stock"), price]);
              const r = (await pub.readContract({ address: need("feed"), abi: FEED_ABI, functionName: "latestRoundData" })) as readonly [bigint, bigint, bigint, bigint, bigint];
              await send(signer, need("pool"), POOL_ABI, "settle", [snap.activeId, r[0]]);
            })
          }
        />
        <MagneticButton small label="Cancel the night" disabled={!canVoid} onClick={() => void act("Cancel the night", async () => { if (signer) await send(signer, need("pool"), POOL_ABI, "voidSession", [snap.activeId]); })} />
      </div>
      <p className="meta">There is no live market in this practice version, so these buttons play the market. By hand, a night lasts 3 minutes: buy in the first 2, press Close the market within 30 seconds after that, then open it a minute later.</p>
      {!signer && <p className="meta warn">Connect first.</p>}
      {msg && <p className="meta">{msg}</p>}
    </div>
  );
}
