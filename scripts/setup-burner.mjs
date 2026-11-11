// Usage: node scripts/setup-burner.mjs [--wait]
// Creates a fresh burner wallet and saves its key straight into .env. The key is never printed.
// Reuses the existing key if .env already has one. Prints only the public address, and also saves it
// to burner-address.txt so you can open the file and copy the address as real text.
// --wait polls the balance until the burner is funded.
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";

// iPad keyboards turn -- into a long dash, so accept those too
const wait = process.argv.slice(2).some((a) => /^[-\u2010-\u2015\u2212]{1,2}wait$/.test(a));

if (!existsSync(".env")) {
  writeFileSync(".env", readFileSync(".env.example", "utf8"));
}
let env = readFileSync(".env", "utf8");

const get = (name) => {
  const m = env.match(new RegExp(`^${name}=(.*)$`, "m"));
  return m ? m[1].trim() : "";
};
const set = (name, value) => {
  const re = new RegExp(`^${name}=.*$`, "m");
  env = re.test(env) ? env.replace(re, `${name}=${value}`) : env + `\n${name}=${value}\n`;
};

let key = get("DEPLOYER_PRIVATE_KEY");
let created = false;
if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
  // 32 random bytes from the OS is a valid secp256k1 key (the chance of it being out of range is about 1 in 2^128)
  const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
  let n = 0n;
  while (n === 0n || n >= N) n = BigInt("0x" + randomBytes(32).toString("hex"));
  key = "0x" + n.toString(16).padStart(64, "0");
  set("DEPLOYER_PRIVATE_KEY", key);
  writeFileSync(".env", env);
  created = true;
}
chmodSync(".env", 0o600);

const address = execFileSync("cast", ["wallet", "address", "--private-key", key], { encoding: "utf8" }).trim();
writeFileSync("burner-address.txt", address + "\n");

const rpc = get("BASE_SEPOLIA_RPC_URL") || "https://sepolia.base.org";
console.log(created ? "New burner wallet created. Key saved to .env (not shown)." : "Burner already set up in .env. Key not shown.");
console.log("");
console.log("Fund this address with Base Sepolia ETH (0.02 is plenty):");
console.log("");
console.log("  " + address);
console.log("");
console.log("Same address saved in burner-address.txt, open it to copy as text.");

const balance = () => BigInt(execFileSync("cast", ["balance", address, "--rpc-url", rpc], { encoding: "utf8" }).trim());

if (wait) {
  console.log("\nWaiting for funds (Ctrl+C to stop)...");
  for (;;) {
    let b = 0n;
    try {
      b = balance();
    } catch {
      /* rpc hiccup, retry */
    }
    if (b > 0n) {
      console.log(`Funded: ${Number(b) / 1e18} ETH. Next: bash scripts/deploy-sepolia.sh`);
      break;
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
} else {
  console.log("\nAfter funding, run: bash scripts/deploy-sepolia.sh");
}
