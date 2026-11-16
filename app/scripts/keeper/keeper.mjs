// GapCover keeper: runs the weekly cycle for one pool.
//   schedule a night  ->  renew subscribers  ->  close at the Friday 20:00 ET shutdown  ->  settle at the
//   first print on or after the next open (09:30 ET)  ->  void if something goes wrong.
// Every step is safe to repeat: it reads the chain first and only acts when the step is due.
//
// Dry run (default): reads the chain and prints what it would do. It simulates each call when a key is set.
// Real run: set SEND=1.
//
// Environment:
//   RPC_URL              Base RPC url (required)
//   POOL, FEED           the pool and the Chainlink feed addresses (required)
//   KEEPER_PRIVATE_KEY   the pool's keeper wallet (needed to schedule, and to send anything). Use a fresh wallet.
//   SEND=1               send transactions. Without it nothing is sent.
//   ONCE=1               run one pass and exit (for a cron job). Otherwise loops.
//   INTERVAL=60          seconds between passes when looping
//   SALE_LEAD_HOURS=72   open sales this many hours before the close
//
// Run:  node app/scripts/keeper/keeper.mjs > keeper.log 2>&1
import { createPublicClient, createWalletClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { nextWindow } from "./calendar.mjs";

const need = (k) => {
  const v = process.env[k];
  if (!v) throw new Error(`Set ${k}`);
  return v;
};
const RPC_URL = need("RPC_URL");
const POOL = need("POOL");
const FEED = need("FEED");
const SEND = process.env.SEND === "1";
const ONCE = process.env.ONCE === "1";
const INTERVAL = Number(process.env.INTERVAL || 60);
const LEAD = Number(process.env.SALE_LEAD_HOURS || 72) * 3600;
const account = process.env.KEEPER_PRIVATE_KEY ? privateKeyToAccount(process.env.KEEPER_PRIVATE_KEY) : null;

const POOL_ABI = parseAbi([
  "function activeSession() view returns (uint256)",
  "function getSession(uint256) view returns ((uint64 saleStart, uint64 closeTime, uint64 openTime, uint8 status, uint32 coverCount, uint128 reserved, uint128 premiums, uint256 refPrice, uint256 settlePrice, uint256 multiplierAtClose))",
  "function params() view returns ((uint32 refMaxAge, uint32 printWindow, uint32 voidGrace, uint32 buyCutoff, uint32 lockWindow, uint16 maxCovers, uint128 minNotional, uint16 maxUseBps, uint16 maxHolderBps, bool subscriptionOnly, uint128 depositCap, address sequencerFeed, uint32 sequencerGrace, uint16 minSettleBps))",
  "function subscribersLength() view returns (uint256)",
  "function subscriberAt(uint256) view returns (address)",
  "function subscriptionDue(uint256 id, address who) view returns (bool)",
  "function scheduleSession(uint64 saleStart, uint64 closeTime, uint64 openTime) returns (uint256)",
  "function renewMany(uint256 id, address[] who)",
  "function closeSession(uint256 id)",
  "function settle(uint256 id, uint80 roundId)",
  "function voidSession(uint256 id)",
]);
const FEED_ABI = parseAbi([
  "function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)",
  "function getRoundData(uint80) view returns (uint80, int256, uint256, uint256, uint80)",
]);

const pub = createPublicClient({ transport: http(RPC_URL) });
const wallet = account ? createWalletClient({ account, transport: http(RPC_URL) }) : null;
const log = (...a) => console.log(new Date().toISOString(), ...a);
const read = (fn, args = []) => pub.readContract({ address: POOL, abi: POOL_ABI, functionName: fn, args });

/** Simulates when a key is available, sends only when SEND=1. */
async function act(label, fn, args) {
  if (!account) {
    log(`[no key] would ${label}`);
    return;
  }
  const { request } = await pub.simulateContract({ address: POOL, abi: POOL_ABI, functionName: fn, args, account });
  if (!SEND) {
    log(`[dry run] ${label}: simulation passed, not sent`);
    return;
  }
  const hash = await wallet.writeContract(request);
  const r = await pub.waitForTransactionReceipt({ hash });
  log(`${label}: ${r.status} ${hash}`);
  if (r.status !== "success") throw new Error(`${label} reverted`);
}

/** First round on or after `open`: walks back from the latest round until the feed time drops below `open`. */
async function firstPrintRound(open) {
  const latest = await pub.readContract({ address: FEED, abi: FEED_ABI, functionName: "latestRoundData" });
  let id = latest[0];
  let found = null;
  for (let i = 0; i < 3000; i++, id--) {
    const r = await pub.readContract({ address: FEED, abi: FEED_ABI, functionName: "getRoundData", args: [id] });
    if (r[3] >= open) found = id;
    else return found; // earliest round on or after open, or null if the feed has not printed yet
  }
  throw new Error("Round search ran past 3000 rounds. Check the open time.");
}

async function pass() {
  const block = await pub.getBlock();
  const now = block.timestamp;
  const { printWindow, voidGrace, buyCutoff, lockWindow } = await read("params");
  const active = await read("activeSession");

  if (active === 0n) {
    const w = nextWindow(Number(now) * 1000);
    const close = BigInt(Math.floor(w.closeMs / 1000));
    const open = BigInt(Math.floor(w.openMs / 1000));
    const saleOpens = close - BigInt(LEAD);
    if (now < saleOpens) return log(`No night open. Next close ${w.closeDay} 20:00 ET, sales open ${new Date(Number(saleOpens) * 1000).toISOString()}.`);
    const saleStart = now + 60n;
    if (close <= saleStart + BigInt(buyCutoff) || open <= close + BigInt(lockWindow)) return log("Too late to schedule this window.");
    return act(`schedule night ${w.closeDay} -> ${w.openDay}`, "scheduleSession", [saleStart, close, open]);
  }

  const s = await read("getSession", [active]);
  const status = Number(s.status);

  if (status === 1) {
    // Scheduled
    if (now >= s.closeTime) {
      if (now <= s.closeTime + BigInt(lockWindow)) return act(`close night ${active}`, "closeSession", [active]);
      return act(`void night ${active} (never closed)`, "voidSession", [active]);
    }
    if (now >= s.saleStart) {
      const n = Number(await read("subscribersLength"));
      const due = [];
      for (let i = 0; i < n; i++) {
        const who = await read("subscriberAt", [BigInt(i)]);
        if (await read("subscriptionDue", [active, who])) due.push(who);
      }
      if (due.length === 0) return log(`Night ${active}: sale open, no renewals due.`);
      for (let i = 0; i < due.length; i += 20) await act(`renew ${due.slice(i, i + 20).length} subscriber(s) for night ${active}`, "renewMany", [active, due.slice(i, i + 20)]);
      return;
    }
    return log(`Night ${active}: waiting for sale start.`);
  }

  if (status === 2) {
    // Closed, waiting for the open
    if (now < s.openTime) return log(`Night ${active}: closed, waiting for the open at ${new Date(Number(s.openTime) * 1000).toISOString()}.`);
    if (now > s.openTime + BigInt(printWindow) + BigInt(voidGrace)) return act(`void night ${active} (no print in time)`, "voidSession", [active]);
    const round = await firstPrintRound(s.openTime);
    if (round === null) return log(`Night ${active}: no feed print since the open yet.`);
    return act(`settle night ${active} with round ${round}`, "settle", [active, round]);
  }

  log(`Night ${active} has status ${status}, nothing to do.`);
}

log(`Keeper for pool ${POOL}. ${SEND ? "SENDING transactions" : "dry run, nothing is sent"}. ${account ? `wallet ${account.address}` : "no key"}.`);
for (;;) {
  try {
    await pass();
  } catch (e) {
    log("Error:", e instanceof Error ? e.message.split("\n")[0] : String(e));
  }
  if (ONCE) break;
  await new Promise((r) => setTimeout(r, INTERVAL * 1000));
}
