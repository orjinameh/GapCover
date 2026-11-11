"use client";
import { useEffect } from "react";
import Simulator from "./Simulator";
import SessionControls from "./SessionControls";
import { useApp } from "./state";

export default function DemoPage() {
  const { signer, useDemo } = useApp();
  // the one click simulator signs with the test wallet
  useEffect(() => {
    if (!signer) useDemo();
  }, [signer, useDemo]);
  return (
    <>
      <div className="demo-note meta">Judge demo · compressed testnet session, mock feed and mock exchange. Not how production would run.</div>
      <Simulator />
      <section className="market market--thin">
        <aside className="rail"><p className="meta">By hand</p></aside>
        <div className="stage"><SessionControls /></div>
      </section>
    </>
  );
}
