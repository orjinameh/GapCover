"use client";
import { IS_BETA } from "@/lib/config";
import Explainer from "./Explainer";

export default function HowItWorks() {
  return (
    <section className="market">
      <aside className="rail"><p className="meta">How it works</p></aside>
      <div className="stage">
        <h1 className="display display--md">
          <span className="display__row">A weekend,</span>
          <span className="display__row display__row--outline">in numbers.</span>
        </h1>
        <p className="lede lede--wide">Move the slider to see what a holder gets, what the fee costs, and what the pool pays.</p>
        <Explainer />
        <details className="lede lede--wide">
          <summary className="meta">Questions</summary>
          <p className="meta"><b>Who pays the holder?</b> The pool. Its money comes from gGAP holders, and it also receives the weekly fees.</p>
          <p className="meta"><b>Can the pool run out?</b> It can pay out all the money it has set aside for a night, but never more than it holds. gGAP holders cannot lose more than they put in.</p>
          <p className="meta"><b>What stops everyone from using the pool at once?</b> One night can use only a share of the pool (15% in this version), and one account only a small share of that.</p>
          <p className="meta"><b>What if the price feed fails?</b> The night is cancelled and every fee is refunded.</p>
          <p className="meta"><b>Is this real?</b> {IS_BETA ? "Yes, in a small beta with real money. The code is not audited. Not advice." : "No. Practice stocks, play money, made-up prices. Not audited, not advice."}</p>
        </details>
      </div>
    </section>
  );
}
