"use client";
import "./explainer.css";

function Person({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <circle cx={x} cy={y - 8} r="8" className="ex-solid" />
      <path d={`M${x - 15} ${y + 18} a15 13 0 0 1 30 0 z`} className="ex-solid" />
    </g>
  );
}

const FEE_ROWS = [90, 160, 230, 160, 90];

export default function PoolFlow() {
  return (
    <figure className="pf">
      <svg
        viewBox="0 0 900 320"
        role="img"
        aria-label="Customers pay fees into the pool and the level rises. On a rare bad night the pool pays one customer and the level dips. Your share is a slice of the pool."
      >
        {/* customers paying fees */}
        <Person x={70} y={90} />
        <Person x={70} y={160} />
        <Person x={70} y={230} />
        <text x="215" y="58" textAnchor="middle" className="ex-lab">FEES IN</text>
        {FEE_ROWS.map((y, i) => (
          <circle key={i} cx="110" cy={y} r="5" className="ex-coin pf-fee" style={{ animationDelay: `${i * 0.9}s` }} />
        ))}

        {/* the pool */}
        <rect x="360" y="40" width="180" height="220" rx="4" className="pf-tank" />
        <rect x="360" y="40" width="180" height="220" className="pf-level" />
        <rect x="360" y="40" width="40" height="220" className="pf-slice" />
        <text x="380" y="30" textAnchor="middle" className="ex-lab">YOUR SLICE</text>
        <text x="450" y="286" textAnchor="middle" className="ex-lab">THE POOL</text>

        {/* rare payout */}
        <text x="680" y="126" textAnchor="middle" className="ex-lab">A BAD NIGHT: PAYOUT</text>
        {[0, 1, 2].map((i) => (
          <circle key={i} cx="545" cy="160" r="5" className="ex-coin pf-pay" style={{ animationDelay: `${i * 0.18}s` }} />
        ))}
        <Person x={830} y={160} />
      </svg>
      <figcaption className="meta pf__cap">Fees raise the pool. A payout lowers it. Your slice rises and falls with it.</figcaption>
    </figure>
  );
}
