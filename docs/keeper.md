# Keeper

A small script that runs the weekly cycle for one pool: `app/scripts/keeper/keeper.mjs`.

## What it does each pass

It reads the chain first and only acts when a step is due, so running it more often than needed is harmless.

| Pool state | Keeper action | Who may call it |
|---|---|---|
| No active night, and the next window is within 72 hours of its close | `scheduleSession` | the pool's keeper wallet only |
| Night on sale, subscribers due | `renewMany` (batches of 20) | anyone |
| Close time reached | `closeSession` | anyone |
| Closed, open time reached, first feed print found | `settle` with that round id | anyone |
| Close or print missed past the windows | `voidSession` (refunds every fee) | anyone |

Only scheduling needs the keeper wallet. The rest could be run by anyone, which is by design.

## The market calendar

`app/scripts/keeper/calendar.mjs`. A night is any stretch with no trading of at least two calendar days (weekend,
weekend plus holiday, or a midweek holiday).

- close = 20:00 ET on the last trading day before the gap (the 24/5 feed goes quiet)
- open = 09:30 ET on the first trading day after the gap
- holidays: the NYSE Group's published 2026, 2027 and 2028 closures. The script refuses to run past 2028.
- tested (`node app/scripts/keeper/calendar.test.mjs`) against the real Nvidia weekend constants used in the fork
  replay, the March clock change, Good Friday 2027, a Monday holiday (18 Jan 2027), Thanksgiving 2026 and July 2027.

Not verified: how the Chainlink 24/5 feed behaves on holidays. The script assumes it is quiet from 20:00 ET on the last
trading day, as on a normal Friday. Watch the first holiday night closely, or run it with `SEND` off first.

## Running it

Dry run (reads the chain, simulates calls if a key is set, sends nothing):

```
RPC_URL=... POOL=0x... FEED=0x... node app/scripts/keeper/keeper.mjs > keeper.log 2>&1
```

Real run: add `KEEPER_PRIVATE_KEY=...` and `SEND=1`. The key must be the pool's `keeper` address (set at deploy).
Use a fresh wallet with a little ETH for gas, not a wallet that holds funds. For a cron job add `ONCE=1`.

## Limits

- One pool, one wallet, one process. If it is down, a night is not scheduled, or settles late, or is voided after the
  grace period (fees refunded, nobody loses money, but nobody is paid either).
- No alerting yet. Read the log, or add a message when a step fails.
- A real launch should point the keeper address at a multisig and have the script use a separate hot wallet only for
  the permissionless steps.
