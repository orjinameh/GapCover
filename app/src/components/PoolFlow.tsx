"use client";
import "./explainer.css";

const Person = () => (
  <svg className="pf-person" viewBox="0 0 24 28" aria-hidden="true">
    <circle cx="12" cy="8" r="6" />
    <path d="M1 28a11 11 0 0 1 22 0z" />
  </svg>
);

export default function PoolFlow() {
  return (
    <figure className="pf">
      <div className="pf-grid" role="img" aria-label="People pay fees into the pool, so it fills up. On a rare bad night the pool pays one person, so it dips. Your slice rises and falls with it.">
        <div className="pf-who">
          <span className="pf-people"><Person /><Person /><Person /></span>
          <span className="meta">People pay fees</span>
        </div>
        <div className="pf-lane" aria-hidden="true">
          <i className="pf-coin pf-fee" />
          <i className="pf-coin pf-fee pf-fee--b" />
          <i className="pf-coin pf-fee pf-fee--c" />
        </div>
        <div className="pf-tank" aria-hidden="true">
          <div className="pf-water" />
          <div className="pf-slice"><span>Your slice</span></div>
          <span className="pf-name">The pool</span>
        </div>
        <div className="pf-lane" aria-hidden="true">
          <i className="pf-coin pf-pay" />
          <i className="pf-coin pf-pay pf-pay--b" />
        </div>
        <div className="pf-who">
          <span className="pf-people"><Person /></span>
          <span className="meta">Rare bad night: we pay</span>
        </div>
      </div>
      <figcaption className="meta pf__cap">Fees fill the pool. A payout empties a little.</figcaption>
    </figure>
  );
}
