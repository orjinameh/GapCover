import MagneticButton from "./MagneticButton";

export default function Hero() {
  return (
    <section className="hero">
      <aside className="rail">
        <p className="meta">Index<br />01 / The problem</p>
        <ol className="rail__list">
          <li><span className="meta">01</span>Buy before close</li>
          <li><span className="meta">02</span>Feed freezes</li>
          <li><span className="meta">03</span>First fresh print</li>
          <li><span className="meta">04</span>Settle, atomic</li>
        </ol>
        <p className="meta rail__foot">
          Worked example<br />
          10,000 USDC · Standard tier<br />
          6.00% gap − 2.00% deductible<br />
          = 400.00 USDC paid
        </p>
      </aside>

      <div className="field">
        <span className="ghost" aria-hidden="true">−6.00%</span>
        <p className="meta field__kicker">Programmable stock markets · parametric cover</p>
        <h1 className="display">
          <span className="display__row">The weekend</span>
          <span className="display__row display__row--outline">is unpriced.</span>
        </h1>
        <div className="field__low">
          <p className="lede">
            Tokenized stocks trade all weekend. Their price feed does not. Holders carry the gap into
            every open. Gap Cover prices it on-chain: last in-session print against the first fresh
            print after the open, refused outright if the feed is frozen.
          </p>
          <MagneticButton label="Run the weekend" href="#simulator" />
        </div>
        <p className="meta field__legal">
          Testnet demo. Mock tokens, mock feeds, no real funds. Not an offer. Not available to U.S. persons.
        </p>
      </div>
    </section>
  );
}
