# GapCover: submission pack

Weekend and overnight gap protection for tokenized stocks on Base.

Practice version: https://gap-cover.vercel.app
Code: https://github.com/orjinameh/GapCover

Status in one line: working practice version on Base Sepolia (fake money), not audited, no real money yet. Anything marked FILL IN is for the team to complete with real numbers before submitting. Do not submit it blank or guessed.

---

## 1. The pitch (short version)

Tokenized stocks on Base trade around the clock on weekdays, but the market behind them still closes every weekend and overnight. When it reopens, the price can be far from the last close, and holders could not sell in between.

GapCover lets a holder pay a small weekly fee. If the stock opens lower than it closed, a pool pays them automatically, with no claim form. People who fund the pool earn the fees and take the risk. They hold gGAP, a token that is a share of the pool.

A real case: Nvidia closed Friday 6 Nov at $187.97 and opened Monday 9 Nov at $170.81, 9.1% lower. On $10,000 of stock that is about $900. At the Standard level, with a 2% deductible, the cover would have paid about $710 on that weekend.

## 2. Who it is for

- **Holders.** People who own tokenized stocks and do not want to sit through a weekend gap. They subscribe weekly and choose a level (Light or Standard).
- **Funders.** People who want to earn fees by taking that risk. They buy gGAP, which behaves like a share in a pool: the price goes up with fees and down with payouts. They do not need to read how an underwriting pool works.

## 3. How it works

1. Funders deposit USDC and receive gGAP, an ERC-20 token. The price of gGAP is the pool's assets divided by the shares.
2. A holder subscribes weekly. A new subscription waits two nights before it covers anything, and cancelling takes effect after notice, so nobody can join only for a night they already expect to be bad.
3. Before each market close, the pool takes a fee for each active subscription and reserves the largest possible payout for it.
4. At close, the contract records the last price. After the open, the first price print from the Chainlink feed settles the night. If the price is lower by more than the deductible, the holder is paid automatically, up to the cap for their level.
5. If anything looks wrong (no print, the token's multiplier changes, the sequencer is down, a print below 50% of the close), the night is voided and every fee is refunded.

Levels (practice settings):

| Level | Deductible | Largest payout | Weekly fee |
|---|---|---|---|
| Light | 5% | 15% of the stock's value | 0.40% |
| Standard | 2% | 10% of the stock's value | 0.60% |

## 4. What is built

Smart contract (Solidity, Foundry):
- One pool per stock with USDC as the asset. The pool shares are a real ERC-20 token, gGAP, that can be transferred.
- Weekly subscriptions with a two-night wait, cancel notice, and failed renewals skipped without leaving debt.
- Settlement from a Chainlink price feed, with proof that the print named is the first one after the open.
- A payout only for stock the wallet still holds at settlement (a wallet that moved the stock away is paid less or nothing).
- Limits: a night may reserve at most 15% of the pool, one wallet at most 5%, a minimum cover size, up to 100 covers per night, a deposit cap, and a pause switch for new sales.
- Safety checks: the Base sequencer uptime feed with a grace period, and a bound that refuses a suspect settle price.
- Tests: 142 passing, including invariants (the pool is always solvent) and replay tests on real feed data.

App (Next.js, viem):
- Home, Protect, Earn, and How it works pages, plus Practice tools for demos.
- Plain-language wording and clear reasons when a button is disabled.
- Mainnet beta mode, behind configuration, that is off in the practice version.

Keeper (Node, viem):
- Schedules each weekend from an NYSE holiday calendar, renews subscriptions in batches, and closes and settles nights.

## 5. What we measured

A simulation of a shared pool across four stocks over 521 weekends, at the Standard level with the pool 15% used each night and a 0.6% fee:

- Yearly return for funders: about 33% in random conditions and about 18% when gaps are twice as bad as history.
- Worst single weekend: about 13 to 14% down for funders. Without the pool limits it was up to 96% in one weekend.
- These assume the pool is fully used every weekend. Real returns will be lower, and demand is untested.

We are not promising returns. The worst case is shown to users in the app and in every post.

## 6. Honest limits

- Not audited.
- No legal review yet. The product looks like insurance in some places, and stock tokens can carry rules of their own.
- The keeper has not run on a live pool. One keeper wallet holds the scheduling and pause roles. A multisig is better.
- Holiday feed behavior is an assumption we have not verified.
- A wallet could sell stock after the open print and before settlement. That window is minutes.
- Demand at about 0.6% a weekend is untested.

## 7. Traction (fill in with real numbers before submitting)

- Practice-network wallets that opened the app: FILL IN
- Wallets that subscribed in the practice version: FILL IN
- Test USDC deposited as gGAP: FILL IN
- Nights settled on the practice network: FILL IN
- Community feedback received (Telegram, X): FILL IN, with two or three real quotes
- Mainnet status: FILL IN (not live, or live with a deposit cap and tiny first night)

Do not round up. A small true number is better than a large vague one.

## 8. Build activity (dated log)

Keep adding a line each time something ships.

| Date | What shipped |
|---|---|
| 15 Nov 2026 | gGAP became a real token; Buy gGAP screen; pool and wallet limits; weekly subscriptions with safeguards; levels re-priced |
| 16 Nov 2026 | New layout (Home, Protect, Earn, How it works); weekly keeper with holiday calendar; deposit cap and mainnet deploy script; beta mode; sequencer check and suspect-price bound |
| 17 Nov 2026 | Payout only for stock still held at settlement; gas test for large nights; cover limit raised from 32 to 100 |
| FILL IN | FILL IN |

## 9. Demo video script for judges (about 75 seconds)

Record the practice version. Do the slow parts first, off camera: subscribe, then run two nights so the subscription is active (a new one has a two-night wait).

| Time | Show | Say or caption |
|---|---|---|
| 0:00-0:08 | Nvidia chart or How it works slider at 9.1% | "Nvidia fell 9.1% over one weekend, while the market was shut." |
| 0:08-0:18 | Home, then Protect with an active subscription | "On Base, a holder subscribes weekly. About 0.6% a weekend." |
| 0:18-0:30 | Practice tools: Start a night, Renew subscriptions, Close the market | "Friday close. The pool reserves the payout." |
| 0:30-0:42 | Type 9.1 in Drop %, press Open at new price and pay | "Monday opens 9.1% lower." |
| 0:42-0:55 | Protect: the payout arrives | "Paid automatically. No claim form." |
| 0:55-1:08 | Earn: the gGAP price after the payout | "Funders hold gGAP, a share of the pool. Fees raise the price, payouts lower it." |
| 1:08-1:15 | Text card | "Practice version. Fake money. Not audited. Code and demo links." |

## 10. Judging map (as reported; the official rules were not seen)

- Onchain traction: Section 7, and the mainnet status line.
- Product quality: Sections 3 to 5, and the demo video.
- Public build activity: Section 8, the commit history, and the X account.
