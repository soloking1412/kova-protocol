# KOVA Protocol

Native intent & solver settlement layer for Sui. Built for **Sui Overflow 2026 — DeepBook Specialized track**.

A user signs a `KovaIntent` declaring what they want — *swap X for at least Y before a deadline* — and escrows their input. A permissionless solver network competes to fill it by routing through DeepBook inside a single Programmable Transaction Block (PTB). If the delivered output falls below the user's minimum, the **entire PTB reverts** and the escrow is untouched. Zero settlement risk, zero counterparty exposure.

## How settlement stays safe

KOVA's contracts are venue-agnostic — they never call DeepBook themselves. A fill is one atomic PTB:

```
take_input  →  route through DeepBook  →  settle
```

1. **`take_input`** withdraws the escrowed input and returns it with a `FillReceipt` — a struct with **no abilities** (a hot potato). The only way to discharge it is `settle`, so a solver can never take the input and walk away.
2. The solver routes the coin through any DeepBook pool, producing the output coin.
3. **`settle`** asserts `output ≥ min_output`. If it fails, the whole transaction reverts, restoring the escrow.

Because the input only moves under the hot potato, and the minimum is enforced at the last step, settlement is atomic and trustless.

## Economics — aligned, three-way surplus split

The user always receives their **guaranteed floor** (`min_output`). Whatever the solver's route captures *above* the floor is the surplus, split three ways:

- **Protocol** — a 5 bps fee on the surplus (we tax value created, not volume).
- **User** — 50% of the net surplus as **price improvement** on top of the floor.
- **Solver** — the remaining ~50% as its reward: the incentive to compete for the fill.

So users get a hard floor *and* upside, solvers earn a real margin, and the protocol is sustainable — verified live (a `0.01 DBUSDC` floor was filled at `0.0895 DBUSDC`).

## Layout

```
contracts/   Move package — intent, registry, settlement, router, events (+ tests)
sdk/         @kova/sdk — build & read intents (browser + node)
solver/      Solver bot — watch, quote (DeepBook), execute PTB, log to Walrus
frontend/    Next.js dApp — swap UI, intent explorer, solver leaderboard
scripts/     deploy.sh, fund-solver.ts
```

## Stack

- **Contracts** — Move 2024, framework resolved from the installed Sui CLI.
- **SDK / solver** — `@mysten/sui` 2.x (`SuiGrpcClient` for execution), `@mysten/deepbook-v3` for routing, `@mysten/walrus` for the audit log.
- **Frontend** — Next.js 15, `@mysten/dapp-kit`, Tailwind, React Query.

The solver executes settlement over the **gRPC client** (the supported path as JSON-RPC sunsets 2026-07-31) and watches `IntentCreated` via cursor-based event polling; gRPC checkpoint streaming is a drop-in upgrade in `solver/src/watcher.ts`.

## Quick start

### 1. Contracts

```bash
cd contracts
sui move build
sui move test          # 18 tests: surplus split, slippage revert, double-fill, refunds, lifecycle, registry
```

### 2. Deploy (testnet)

Requires a Sui wallet on testnet with gas:

```bash
sui client switch --env testnet
bash scripts/deploy.sh   # publishes; prints package / registry / fee-collector ids
```

The registry and fee collector are created by module `init` on publish — publishing is the only step.

### 3. Configure

Copy the printed ids into:

- `solver/.env`     (from `solver/.env.example`)
- `frontend/.env.local` (from `frontend/.env.local.example`)

### 4. Register the solver

```bash
cd solver && npx tsx ../scripts/fund-solver.ts   # stakes 1 SUI, prints SOLVER_RECORD_ID
```

### 5. Run

```bash
cd solver && npm start      # watches for intents and fills them
cd frontend && npm run dev  # http://localhost:3000
```

## Tokens (testnet)

Routing uses DeepBook's testnet pools: `SUI`, `DBUSDC`, `DEEP`, `DBTC`, `WAL`. Get test coins from the DeepBook faucet and SUI from the Sui testnet faucet.

Note: only DeepBook's **whitelisted** pools (e.g. `DEEP_SUI`, `DEEP_DBUSDC`) charge zero fees and route without a DEEP balance. Non-whitelisted pools require the solver to supply DEEP for taker fees.

## Live deployment (testnet)

The protocol is deployed and verified end-to-end on Sui testnet:

| | |
|---|---|
| Package | `0xf34836a0a26c0a40b1862c4d2a43354e9983f805cb14f67158f0dc7a954edbb1` |
| Registry | `0xbc95b8f3edab021b4c60be2c21df778062e3bcee440a4fcb4582b1da3824c544` |
| Fee collector | `0x4df5c17c264ea57ac3e0ceaaa6e347f4be629f14adb6323f9176ffe318d0c4a0` |

Verified flow:

- **Surplus split** — a `DEEP → DBUSDC` intent with a `0.01 DBUSDC` floor filled at `0.0895 DBUSDC`: the user got the floor plus their surplus share, the solver kept its reward, and the protocol fee landed in the collector.
- **Routing** — whitelisted pools (`DEEP_SUI`, `DEEP_DBUSDC`, zero fee) and non-whitelisted pools (`SUI_DBUSDC`, solver supplies DEEP for taker fees) both proven.
- **Zero settlement risk** — an intent whose floor the route couldn't meet aborted at `settle` (`E_OUTPUT_TOO_LOW`); the entire PTB reverted and the intent stayed `Open` with its escrow intact.
- **Walrus audit log** — every fill is written to Walrus via the testnet upload relay; blob ids appear in the solver logs.
- **Frontend** — protocol stats, the live intent feed, and the solver leaderboard all render this on-chain data directly. The intent form fetches a live DeepBook quote as you type and pre-fills an editable floor (default 1% slippage), so the UI and the solver route through the exact same `findPool` logic in the SDK — quote and fill can never drift.

Notes for reproduction: the solver wallet needs WAL for Walrus storage (swap SUI via `wal_exchange::exchange_all_for_wal`), and `GAS_BUDGET_MIST` can be tuned for the fill PTB.
