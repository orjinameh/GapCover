import Link from "next/link";
import { IS_BETA } from "@/lib/config";

/** First page: what this is, two doors, how it works, what can go wrong. Server component, no wallet needed. */
export default function Home() {
  return (
    <section className="market home">
      <aside className="rail">
        <p className="meta">GapCover · {IS_BETA ? "beta" : "practice version"}</p>
        <p className="lede">Weekend protection for tokenized stocks, paid for by the people who fund it.</p>
      </aside>
      <div className="stage">
        <h1 className="display display--md">
          <span className="display__row">Weekend drops,</span>
          <span className="display__row display__row--outline">covered.</span>
        </h1>
        <p className="lede lede--wide">
          Tokenized stocks trade all week, but news lands over the weekend and the price can open far lower on Monday. GapCover pays holders part of that loss, and pays the people who fund it from the fees.
        </p>

        <div className="doors">
          <Link href="/protect" className="door">
            <span className="meta">I hold stocks</span>
            <b className="door__t">Protect my stocks</b>
            <span className="door__d">Pay a small fee each weekend. If your stock opens much lower on Monday, we pay you part of the loss.</span>
            <span className="door__go">Protect →</span>
          </Link>
          <Link href="/earn" className="door">
            <span className="meta">I want to earn</span>
            <b className="door__t">Earn from the fees</b>
            <span className="door__d">Buy gGAP, your share of the money that pays those claims. Its price rises with fees and falls when claims are paid.</span>
            <span className="door__go">Earn →</span>
          </Link>
        </div>

        <h2 className="h2">How it works</h2>
        <ol className="steps">
          <li><b>Holders subscribe.</b> They pick how much stock to protect and how much of a drop they will cover themselves. A small fee is taken each weekend.</li>
          <li><b>The pool holds the money.</b> gGAP holders put dollars in the pool and get gGAP, a token that is their share of it. Fees from holders go into the pool.</li>
          <li><b>Monday decides.</b> If the stock opens lower than Friday&apos;s last price by more than the holder&apos;s own part, the pool pays the difference, up to a cap. Otherwise the fee stays in the pool.</li>
        </ol>

        <h2 className="h2">What can go wrong</h2>
        <div className="meta field__legal">
          <p><b>If you protect stocks:</b> on a calm weekend the fee is gone, like any insurance. In a very big drop you carry the part above the cap.</p>
          <p><b>If you hold gGAP:</b> in a market crash, many holders get paid at once and gGAP can lose a lot in one weekend. In our test on ten years of real prices, limiting one night to 15% of the pool kept the worst weekend near 13% to 14%. That is a simulation, not a promise.</p>
          <p>{IS_BETA ? <><b>Beta:</b> real money and small limits, on code that is not audited yet. Only use money you can afford to lose. Not advice.</> : <><b>Practice version:</b> play money, made-up prices, nothing here is real or audited. Not advice.</>}</p>
        </div>
        <p className="meta"><Link className="linkbtn" href="/how">See it with real numbers</Link></p>
      </div>
    </section>
  );
}
