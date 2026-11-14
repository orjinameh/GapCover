"use client";
import "./explainer.css";

const WAVE = "M0 0 Q30 -9 60 0 T120 0 T180 0 T240 0 T300 0 T360 0 T420 0 T480 0 V260 H0 Z";

const Person = ({ x }: { x: number }) => (
  <g transform={`translate(${x} 16)`}>
    <circle cx="0" cy="6" r="6" />
    <path d="M-11 30a11 11 0 0 1 22 0z" />
  </g>
);

export default function PoolFlow() {
  return (
    <figure className="pf">
      <div className="pf-box" role="img" aria-label="People pay fees into the pool, so the pool rises. On a rare bad night the pool pays one person, so it dips. Your slice rises and falls with it.">
        <svg viewBox="0 0 320 400" aria-hidden="true">
          <defs>
            <clipPath id="pf-clip"><rect x="40" y="120" width="240" height="190" rx="16" /></clipPath>
          </defs>

          <g fill="var(--fg)">
            <Person x={110} />
            <Person x={160} />
            <Person x={210} />
          </g>

          {/* fees dropping in, with a ripple where they land */}
          {[110, 160, 210].map((x, i) => (
            <g key={x}>
              <circle className="pf-drop" cx={x} cy="84" r="6" style={{ animationDelay: `${i * 0.7}s` }} />
              <ellipse className="pf-ripple" cx={x} cy="150" rx="6" ry="2" style={{ animationDelay: `${i * 0.7}s` }} />
            </g>
          ))}

          {/* the pool */}
          <g clipPath="url(#pf-clip)">
            <g className="pf-level">
              <g transform="translate(0 124)"><g className="pf-wave pf-wave--b"><path d={WAVE} fill="var(--fg)" fillOpacity="0.14" /></g></g>
              <g transform="translate(0 130)"><g className="pf-wave"><path d={WAVE} fill="var(--fg)" fillOpacity="0.26" /></g></g>
            </g>
            <rect x="40" y="120" width="72" height="190" fill="none" stroke="var(--acc)" strokeWidth="2" strokeDasharray="4 5" className="pf-slice" />
          </g>
          <rect x="40" y="120" width="240" height="190" rx="16" fill="none" stroke="var(--fg)" strokeWidth="1.5" />

          {/* the rare payout */}
          <circle className="pf-out" cx="248" cy="312" r="6" />
          <g fill="var(--fg)" transform="translate(0 338)"><Person x={248} /></g>
        </svg>

        <p className="pf-l pf-l--top">People pay fees</p>
        <p className="pf-l pf-l--slice">Your slice</p>
        <p className="pf-l pf-l--pool">The pool</p>
        <p className="pf-l pf-l--out">Rare bad night: we pay</p>
      </div>
      <figcaption className="meta pf__cap">Fees fill the pool. A payout empties a little.</figcaption>
    </figure>
  );
}
