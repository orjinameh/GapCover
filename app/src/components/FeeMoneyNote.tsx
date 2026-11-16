"use client";
import { IS_BETA } from "@/lib/config";
import { useApp } from "./state";

/** Shown when the connected account has no network fee money, so it cannot send anything yet. */
export default function FeeMoneyNote() {
  const { snap, signer, setWalletOpen } = useApp();
  if (!signer || !snap?.me || snap.me.eth > 0n) return null;
  return (
    <p className="meta warn">
      {IS_BETA ? "This account needs a small amount of ETH on Base for network fees before it can do anything. " : "This account needs a little network fee money before it can do anything. "}
      <button className="linkbtn" onClick={() => setWalletOpen(true)}>{IS_BETA ? "Show my address" : "Get it free"}</button>
    </p>
  );
}
