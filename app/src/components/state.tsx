"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createWalletClient, custom, http, toHex, type Address } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { CHAIN, DEPLOYED, IS_LOCAL, RPC_URL } from "@/lib/config";
import { pub, readSnapshot, type Signer, type Snapshot } from "@/lib/chain";

type Eip1193 = { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> };
declare global {
  interface Window {
    ethereum?: Eip1193;
  }
}

type Ctx = {
  snap: Snapshot | null;
  error: string | null;
  refresh: () => Promise<void>;
  signer: Signer | null;
  demo: Signer | null;
  connectBrowser: () => Promise<void>;
  useDemo: () => void;
  disconnect: () => void;
  wrongNetwork: boolean;
  switchNetwork: () => Promise<void>;
  walletOpen: boolean;
  setWalletOpen: (v: boolean) => void;
  hasInjected: boolean;
};

const C = createContext<Ctx | null>(null);
export const useApp = () => {
  const v = useContext(C);
  if (!v) throw new Error("useApp outside provider");
  return v;
};

const PK = "gapcover.demo.pk";

function loadDemo(): Signer {
  let pk: `0x${string}` | null = null;
  try {
    const v = localStorage.getItem(PK);
    if (v && /^0x[0-9a-fA-F]{64}$/.test(v)) pk = v as `0x${string}`;
  } catch {}
  if (!pk) {
    pk = generatePrivateKey();
    try {
      localStorage.setItem(PK, pk);
    } catch {}
  }
  const account = privateKeyToAccount(pk);
  const wc = createWalletClient({ account, chain: CHAIN, transport: http(RPC_URL) });
  return { address: account.address, wc, kind: "demo" };
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [demo, setDemo] = useState<Signer | null>(null);
  const [browser, setBrowser] = useState<Signer | null>(null);
  const [mode, setMode] = useState<"none" | "demo" | "browser">("none");
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wrongNetwork, setWrongNetwork] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const [hasInjected, setHasInjected] = useState(false);
  const addrRef = useRef<Address | undefined>(undefined);

  const signer = mode === "browser" && browser ? browser : mode === "demo" ? demo : null;
  addrRef.current = signer?.address;

  useEffect(() => {
    setHasInjected(typeof window !== "undefined" && !!window.ethereum);
    const d = loadDemo();
    setDemo(d);
    try {
      const saved = localStorage.getItem("gapcover.mode");
      if (saved === "demo") setMode("demo");
      if (saved === "browser" && window.ethereum) {
        void window.ethereum.request({ method: "eth_accounts" }).then((acc) => {
          const a = (acc as Address[])[0];
          if (!a) return;
          const wc = createWalletClient({ account: a, chain: CHAIN, transport: custom(window.ethereum!) });
          setBrowser({ address: a, wc, kind: "browser" });
          setMode("browser");
        });
      }
    } catch {}
    if (IS_LOCAL) {
      void pub.request({ method: "anvil_setBalance" as never, params: [d.address, toHex(10n ** 19n)] as never }).catch(() => {});
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!DEPLOYED) return;
    try {
      setSnap(await readSnapshot(addrRef.current));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    try {
      if (mode !== "none") localStorage.setItem("gapcover.mode", mode);
      else localStorage.removeItem("gapcover.mode");
    } catch {}
  }, [mode]);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), IS_LOCAL ? 1000 : 3000);
    return () => clearInterval(id);
  }, [refresh, signer?.address]);

  const switchNetwork = useCallback(async () => {
    const eth = window.ethereum;
    if (!eth) return;
    try {
      await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: toHex(CHAIN.id) }] });
    } catch {
      await eth.request({
        method: "wallet_addEthereumChain",
        params: [{ chainId: toHex(CHAIN.id), chainName: CHAIN.name, nativeCurrency: CHAIN.nativeCurrency, rpcUrls: [RPC_URL] }],
      });
    }
    setWrongNetwork(false);
  }, []);

  useEffect(() => {
    if (mode !== "browser" || !window.ethereum) {
      setWrongNetwork(false);
      return;
    }
    const eth = window.ethereum;
    const check = async () => {
      try {
        const id = (await eth.request({ method: "eth_chainId" })) as string;
        setWrongNetwork(parseInt(id, 16) !== CHAIN.id);
      } catch {}
    };
    void check();
    const t = setInterval(check, 3000);
    return () => clearInterval(t);
  }, [mode]);

  const connectBrowser = useCallback(async () => {
    const eth = window.ethereum;
    if (!eth) {
      setError("No browser wallet found. Install one, or use the demo wallet.");
      return;
    }
    const accounts = (await eth.request({ method: "eth_requestAccounts" })) as Address[];
    await switchNetwork();
    const wc = createWalletClient({ account: accounts[0], chain: CHAIN, transport: custom(eth) });
    setBrowser({ address: accounts[0], wc, kind: "browser" });
    setMode("browser");
    setWalletOpen(false);
  }, [switchNetwork]);

  const useDemo = useCallback(() => {
    setMode("demo");
    setWalletOpen(false);
  }, []);
  const disconnect = useCallback(() => {
    setMode("none");
    setWalletOpen(false);
  }, []);

  const value = useMemo(
    () => ({ snap, error, refresh, signer, demo, connectBrowser, useDemo, disconnect, wrongNetwork, switchNetwork, walletOpen, setWalletOpen, hasInjected }),
    [snap, error, refresh, signer, demo, connectBrowser, useDemo, disconnect, wrongNetwork, switchNetwork, walletOpen, hasInjected],
  );
  return <C.Provider value={value}>{children}</C.Provider>;
}
