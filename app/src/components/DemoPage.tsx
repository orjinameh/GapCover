"use client";
import { useEffect } from "react";
import Simulator from "./Simulator";
import SessionControls from "./SessionControls";
import { IS_BETA } from "@/lib/config";
import { useApp } from "./state";

export default function DemoPage() {
  const { signer, useDemo } = useApp();
  // the one click simulator signs with the test wallet
  useEffect(() => {
    if (!IS_BETA && !signer) useDemo();
  }, [signer, useDemo]);
  if (IS_BETA) {
    return (
      <section className="market market--thin">
        <aside className="rail"><p className="meta">Practice tools</p></aside>
        <div className="stage"><p className="lede">Practice tools are not part of the beta.</p></div>
      </section>
    );
  }
  return (
    <>
      <div className="demo-note meta">Demo · a whole weekend in about 80 seconds, with a made-up price. A real version would run on real market hours.</div>
      <Simulator />
      <section className="market market--thin">
        <aside className="rail"><p className="meta">By hand</p></aside>
        <div className="stage"><SessionControls /></div>
      </section>
    </>
  );
}
