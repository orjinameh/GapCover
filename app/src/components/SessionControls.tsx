"use client";
import { useState } from "react";
import { DEMO, need } from "@/lib/config";
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
      setMsg(e instanceof Error ? e.message.split("\n")[0] : String(e));
    } finally {
      setBusy(null);
      void refresh();
    }
  }

  return (
    <div className="controls">
      <p className="meta">Manual session controls · {phase.label}</p>
      <div className="btnrow btnrow--tight">
        <MagneticButton small label="Open session" disabled={!canOpen} onClick={() => void act("Open session", async () => { if (signer) await send(signer, need("keeper"), KEEPER_ABI, "scheduleNow", [need("pool"), DEMO.closeIn, DEMO.openIn]); })} />
        <MagneticButton small label="Close session" disabled={!canClose} onClick={() => void act("Close session", async () => { if (signer) await send(signer, need("pool"), POOL_ABI, "closeSession", [snap.activeId]); })} />
        <label className="gapin">
          <span className="meta">Gap %</span>
          <input value={gapPct} inputMode="decimal" onChange={(e) => setGapPct(e.target.value)} />
        </label>
        <MagneticButton
          small
          label="Print open and settle"
          disabled={!canSettle}
          onClick={() =>
            void act("Settle", async () => {
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
        <MagneticButton small label="Void session" disabled={!canVoid} onClick={() => void act("Void session", async () => { if (signer) await send(signer, need("pool"), POOL_ABI, "voidSession", [snap.activeId]); })} />
      </div>
      <p className="meta">The Cover page runs on real sessions. On this testnet there is no live exchange, so these buttons play the keeper and the price feed. A session lasts about 80 seconds.</p>
      {!signer && <p className="meta warn">Connect a wallet first.</p>}
      {msg && <p className="meta">{msg}</p>}
    </div>
  );
}
