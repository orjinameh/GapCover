"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { DEPLOYED } from "@/lib/config";
import { phaseOf, secondsLeft } from "@/lib/chain";
import { fmtTokens, fmtUsd } from "@/lib/math";
import { useApp } from "./state";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const NAV = [
  { href: "/", label: "Protect" },
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
          <p className="meta">Your account</p>
          <button className="sheet__x meta" onClick={() => setWalletOpen(false)}>Close</button>
        </div>
        {signer ? (
          <>
            <p className="addr">{signer.address}</p>
            <p className="meta">{signer.kind === "demo" ? "Practice account, kept in this browser" : "Your own account"}</p>
            {me && (
              <dl className="rows">
                <div><dt>Network fee money</dt><dd>{(Number(me.eth) / 1e18).toFixed(4)}</dd></div>
                <div><dt>Test dollars</dt><dd>{fmtUsd(me.usdc)}</dd></div>
                <div><dt>Stocks</dt><dd>{fmtTokens(me.tokens)}</dd></div>
              </dl>
            )}
            {me && me.eth === 0n && (
              <>
                <p className="meta warn">This account has no network fee money, so it can't send anything yet. Copy the address, paste it into the free faucet, then come back.</p>
                <button className="sheet__btn" onClick={() => { try { void navigator.clipboard.writeText(signer.address); } catch {} }}>
                  <span>Copy my address</span>
                </button>
                <a className="sheet__btn" href="https://portal.cdp.coinbase.com/products/faucet" target="_blank" rel="noreferrer">
                  <span>Open the free faucet</span>
                  <span className="meta">Pick Base Sepolia</span>
                </a>
              </>
            )}
            {signer.kind === "browser" && wrongNetwork && (
              <button className="sheet__btn" onClick={() => void switchNetwork()}>Switch network</button>
            )}
            <button className="sheet__btn" onClick={disconnect}>Disconnect</button>
          </>
        ) : (
          <>
            <h2 className="h2 h2--sm">Connect</h2>
            <button className="sheet__btn" onClick={() => void connectBrowser().catch((e) => setErr(e instanceof Error ? e.message.split("\n")[0] : String(e)))}>
              <span>Use MetaMask or similar</span>
              <span className="meta">{hasInjected ? "Detected" : "Not found on this device"}</span>
            </button>
            <button className="sheet__btn" onClick={useDemo}>
              <span>Use a practice account</span>
              <span className="meta">Nothing to install. Play money only</span>
            </button>
            {!hasInjected && (
              <a className="sheet__btn" href={`https://metamask.app.link/dapp/${typeof window !== "undefined" ? window.location.host + window.location.pathname : ""}`}>
                <span>Open in the MetaMask app</span>
                <span className="meta">On a phone</span>
              </a>
            )}
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

  let label = DEPLOYED ? "Loading" : "Not set up yet";
  let left: number | null = null;
  if (snap) {
    const p = phaseOf(snap);
    label = p.label;
    left = secondsLeft(snap, p.target);
  }
  if (error) label = "Connection problem";

  return (
    <>
      <header className="bar">
        <Link href="/" className="bar__brand">Gap Cover<span className="bar__tag">practice</span></Link>
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
        Practice version. Play money, nothing here is real. Not advice. Not for U.S. residents.
      </footer>
      <WalletSheet />
    </>
  );
}
