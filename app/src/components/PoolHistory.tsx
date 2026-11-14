"use client";
import { useEffect, useState } from "react";
import { STATUS } from "@/lib/chain";
import { readPoolHistory, type Night, type PoolHistory as History } from "@/lib/history";
import { fmtUsd, type Tier } from "@/lib/math";
import "./explainer.css";

const money = (v: bigint) => `${v < 0n ? "−" : v > 0n ? "+" : ""}$${fmtUsd(v < 0n ? -v : v)}`;
const net = (n: Night) => (n.status === STATUS.Settled ? n.fees - n.paidOut : 0n);

function label(n: Night) {
  if (n.status === STATUS.Voided) return "Cancelled. Fees refunded";
  if (n.status === STATUS.Settled) return n.paidOut > 0n ? "Paid out" : "No payout";
  return "Running";
}

/** What the pool has earned and paid, night by night. Read straight from the contract. */
export default function PoolHistory({ tiers, refreshKey }: { tiers: Tier[] | undefined; refreshKey: string }) {
  const [h, setH] = useState<History | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!tiers) return;
    let live = true;
    readPoolHistory(tiers)
      .then((x) => {
        if (live) {
          setH(x);
          setFailed(false);
        }
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [tiers, refreshKey]);

  if (failed && !h) return <p className="meta">Could not load the history. Try again in a moment.</p>;
  if (!h) return <p className="meta">Loading history…</p>;
  if (h.nights.length === 0) return <p className="meta">Nothing yet. Fees and payouts show up here after the first night.</p>;

  const settled = h.nights.filter((n) => n.status === STATUS.Settled);
  const peak = settled.reduce((m, n) => {
    const v = net(n);
    return (v < 0n ? -v : v) > m ? (v < 0n ? -v : v) : m;
  }, 1n);
  const result = h.earned - h.paid;

  return (
    <section className="hx" aria-label="What the pool has earned and paid">
      <p className="meta">What happened{h.total > h.nights.length ? ` · last ${h.nights.length} nights` : ""}</p>
      <dl className="rows">
        <div><dt>Fees earned</dt><dd>{money(h.earned)}</dd></div>
        <div><dt>Paid out</dt><dd>{money(-h.paid)}</dd></div>
        <div><dt>Result</dt><dd>{money(result)}</dd></div>
      </dl>

      <div className="hx-bars" role="img" aria-label="Result of each night: fees earned minus payouts">
        {h.nights.map((n) => {
          const v = net(n);
          const pct = n.status === STATUS.Settled ? Math.max(6, Number((v < 0n ? -v : v) * 100n / peak)) : 8;
          return (
            <span className="hx-col" key={n.id.toString()} title={`Night ${n.id}: ${label(n)}`}>
              <i
                className={`hx-bar ${n.status !== STATUS.Settled ? "hx-bar--wait" : v < 0n ? "hx-bar--loss" : "hx-bar--gain"}`}
                style={v < 0n ? { top: "50%", height: `${pct / 2}%` } : { bottom: "50%", height: `${pct / 2}%` }}
              />
            </span>
          );
        })}
      </div>

      <ul className="hx-list">
        {[...h.nights].reverse().slice(0, 6).map((n) => (
          <li key={n.id.toString()}>
            <span>
              Night {n.id.toString()}
              <small className="meta">{label(n)}</small>
            </span>
            <span className="hx-val">
              {n.status === STATUS.Settled ? money(net(n)) : n.status === STATUS.Voided ? "$0.00" : "…"}
              <small className="meta">
                {n.coverCount} {n.coverCount === 1 ? "buyer" : "buyers"}
              </small>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
