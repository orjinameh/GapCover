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
  const [mode, setMode] = useState<"demo" | "browser">("demo");
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const addrRef = useRef<Address | undefined>(undefined);

  const signer = mode === "browser" && browser ? browser : demo;
  addrRef.current = signer?.address;

  useEffect(() => {
    const d = loadDemo();
    setDemo(d);
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
    void refresh();
    const id = setInterval(() => void refresh(), IS_LOCAL ? 1000 : 3000);
    return () => clearInterval(id);
  }, [refresh, signer?.address]);

  const connectBrowser = useCallback(async () => {
    const eth = window.ethereum;
    if (!eth) {
      setError("No browser wallet found. Install one, or use the demo wallet.");
      return;
    }
    const accounts = (await eth.request({ method: "eth_requestAccounts" })) as Address[];
    try {
      await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: toHex(CHAIN.id) }] });
    } catch {
      await eth.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: toHex(CHAIN.id),
            chainName: CHAIN.name,
            nativeCurrency: CHAIN.nativeCurrency,
            rpcUrls: [RPC_URL],
          },
        ],
      });
    }
    const wc = createWalletClient({ account: accounts[0], chain: CHAIN, transport: custom(eth) });
    setBrowser({ address: accounts[0], wc, kind: "browser" });
    setMode("browser");
  }, []);

  const useDemo = useCallback(() => setMode("demo"), []);

  const value = useMemo(
    () => ({ snap, error, refresh, signer, demo, connectBrowser, useDemo }),
    [snap, error, refresh, signer, demo, connectBrowser, useDemo],
  );
  return <C.Provider value={value}>{children}</C.Provider>;
}
