"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { CHAIN, DEPLOYED, TICKER } from "@/lib/config";
import { phaseOf, secondsLeft } from "@/lib/chain";
import { fmtTokens, fmtUsd } from "@/lib/math";
import { useApp } from "./state";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const NAV = [
  { href: "/", label: "Cover" },
  { href: "/underwrite", label: "Provide Liquidity" },
  { href: "/demo", label: "Demo" },
];

function WalletSheet() {
  const { walletOpen, setWalletOpen, signer, snap, connectBrowser, useDemo, disconnect, hasInjected, wrongNetwork, switchNetwork } = useApp();
  const [err, setErr] = useState<string | null>(null);
  if (!walletOpen) return null;
  const me = snap?.me;
  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label="Wallet" onClick={() => setWalletOpen(false)}>
      <div className="sheet__panel" onClick={(e) => e.stopPropagation()}>
        <div className="sheet__head">
          <p className="meta">Wallet</p>
          <button className="sheet__x meta" onClick={() => setWalletOpen(false)}>Close</button>
        </div>
        {signer ? (
          <>
            <p className="addr">{signer.address}</p>
            <p className="meta">{signer.kind === "demo" ? "Test wallet, kept in this browser" : "Browser wallet"}</p>
            {me && (
              <dl className="rows">
                <div><dt>ETH (gas)</dt><dd>{(Number(me.eth) / 1e18).toFixed(4)}</dd></div>
                <div><dt>mUSDC</dt><dd>{fmtUsd(me.usdc)}</dd></div>
                <div><dt>{TICKER}</dt><dd>{fmtTokens(me.tokens)}</dd></div>
              </dl>
            )}
            {signer.kind === "browser" && wrongNetwork && (
              <button className="sheet__btn" onClick={() => void switchNetwork()}>Switch to {CHAIN.name}</button>
            )}
            <button className="sheet__btn" onClick={disconnect}>Disconnect</button>
          </>
        ) : (
          <>
            <h2 className="h2 h2--sm">Connect</h2>
            <button className="sheet__btn" onClick={() => void connectBrowser().catch((e) => setErr(e instanceof Error ? e.message.split("\n")[0] : String(e)))}>
              <span>Browser wallet</span>
              <span className="meta">{hasInjected ? "Detected" : "None found on this device"}</span>
            </button>
            <button className="sheet__btn" onClick={useDemo}>
              <span>Test wallet</span>
              <span className="meta">No extension needed. Testnet only</span>
            </button>
            <p className="meta">On a phone, open this page inside your wallet app's browser to use your own wallet.</p>
            {err && <p className="meta warn">{err}</p>}
          </>
        )}
      </div>
    </div>
  );
}

export default function Shell({ children }: { children: React.ReactNode }) {
  const { snap, error, signer, setWalletOpen, wrongNetwork } = useApp();
  const path = usePathname();
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  let label = DEPLOYED ? "Reading chain" : "Not deployed";
  let left: number | null = null;
  if (snap) {
    const p = phaseOf(snap);
    label = p.label;
    left = secondsLeft(snap, p.target);
  }
  if (error) label = "Network trouble";

  return (
    <>
      <header className="bar">
        <Link href="/" className="bar__brand">Gap Cover<span className="bar__tag">testnet</span></Link>
        <nav className="bar__nav" aria-label="Main">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={path === n.href ? "on" : ""}>{n.label}</Link>
          ))}
        </nav>
        <span className="bar__live">
          <i className="dot" />
          <span className="bar__label">{label}</span>
          {left !== null && <b className="bar__count">{left}s</b>}
        </span>
        <button className="bar__wallet" onClick={() => setWalletOpen(true)}>
          {signer ? (wrongNetwork ? "Wrong network" : short(signer.address)) : "Connect"}
        </button>
      </header>
      {children}
      <footer className="foot meta">
        Gap Cover on {CHAIN.name}. Mock tokens and mock price feeds, no real funds. Unaudited. Not an offer or advice, not available to U.S. persons.
        No claim of rights in any underlying company.
      </footer>
      <WalletSheet />
    </>
  );
}
