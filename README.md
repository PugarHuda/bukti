# Bukti

**Verifiable, on-chain, risk-adjusted trading track records — proven in a zkVM, on Mantle.**

> Nansen tells you a wallet's PnL. **Bukti proves its Sharpe ratio on-chain.** It reconstructs a wallet/agent's risk-adjusted performance (Sharpe, max drawdown, ROI, volume) from raw Mantle DeFi trades *inside an SP1 zero-knowledge VM*, then verifies the proof on Mantle and stores a tamper-proof, composable attestation — so any vault, lender, or copy-trading protocol can route capital by **proven** track record, not self-reported screenshots.

**Live demo:** https://bukti-smoky.vercel.app

Built for **The Turing Test Hackathon 2026** (Mantle). Primary track: **AI Alpha & Data**; cross-nominated for **AI DevTools** and **Grand Champion**.

---

## The problem

Every "AI trading agent" claims a Sharpe ratio. None can *prove* it. Off-chain dashboards (Nansen, Dune, PolyVision) compute wallet PnL but the numbers are trust-me. On-chain "reputation" systems make the agent self-report. There is no permissionless, trustless way to compute a *standardized risk-adjusted* track record from raw chain data and expose it as a primitive other contracts can gate on.

Bukti is that primitive.

## How it works

```
[Indexer]  raw Mantle swap logs (Agni)  +  Pyth Benchmarks historical prices
   │        → RAW swap legs (token, amount, trade-time price)  →  swaps.json
   ▼
[SP1 zkVM guest]  cost-basis PnL reconstruction  →  realized trades
   │              → score / maxDrawdown / ROI / volume   (pure integer math)
   │              commit public values {wallet, anchor, metrics}
   ▼
[Succinct Prover Network]  →  Groth16 proof
   ▼
[Mantle]  SP1 verifier → BuktiAttestation.submitAttestation()
          → composable, tamper-proof score  →  read by GatedVault, lenders, copy-trade…
```

- **The zk proof covers the reconstruction itself, not just summary stats:** the
  weighted-average cost-basis realized-PnL computation *and* the risk metrics run inside
  the zkVM in deterministic integer arithmetic.
- **The score** is a per-trade Sharpe-style information ratio (mean/std of per-trade
  returns, ×1000 on-chain) — deliberately *not* marketed as an annualized Sharpe ratio.
- **Data provenance** is anchored to a Mantle block hash, asserted by the submitting
  relayer in the MVP. In-circuit receipt-Merkle-proof verification and an on-chain
  block-hash accumulator (for fully trustless, provably-complete history) are the
  explicit roadmap — not claimed today.

## Live on Mantle Sepolia (chainId 5003)

| Contract | Address |
|---|---|
| **BuktiAttestation** | [`0x7b0A5E9D4A8b1bf2829478e72f62283C6939C816`](https://sepolia.mantlescan.xyz/address/0x7b0A5E9D4A8b1bf2829478e72f62283C6939C816) |
| GatedVault (composability demo) | [`0x5e6b9242Db15959EdCEccBa5C369fca3576fd598`](https://sepolia.mantlescan.xyz/address/0x5e6b9242Db15959EdCEccBa5C369fca3576fd598) |

An attestation reconstructed from a **real Mantle mainnet trader** (`0x4cf8…23c5`, 11 raw Agni swap legs → 5 realized trades, score **−1.316**, ROI **−1.25%**, real anchor block hash) is stored on-chain: [tx `0x8b90c36e…`](https://sepolia.mantlescan.xyz/tx/0x8b90c36ef1b09904c39022e56ce0530be8c75f94168bc64c9a1bb93f4ab312f7). Yes — the demo wallet *lost* money; the point is the score is reconstructed and provable, not flattering.

**ERC-8004 integration, live:** the score is also written into Mantle's canonical ERC-8004 registries on Sepolia — agent **#137** in the [IdentityRegistry](https://sepolia.mantlescan.xyz/address/0x8004A818BFB912233c491871b3d84c89A494BD9e) (agentURI → the attestation tx) with `giveFeedback` in the [ReputationRegistry](https://sepolia.mantlescan.xyz/address/0x8004B663056A597Dffe9eCcC1965A193B7388713) ([tx `0xf44b6d62…`](https://sepolia.mantlescan.xyz/tx/0xf44b6d62e80ab8e6e8f09b7da31f1975b3ea58269d66beb7fb1d3c44480464f7)). Mantle's ERC-8004 announcement calls for "ZK-based" validation and "portable track records" — Bukti is that layer, running. See [DEPLOYMENTS.md](DEPLOYMENTS.md).

> **Current trust status, stated plainly:** the deployed verifier is still a mock
> placeholder while the Groth16 path is wired to the Succinct Prover Network — the
> on-chain flow is live, the proof verification swap-in is `setVerifier(...)` away.

## Repository layout

```
bukti/
  lib/        Rust — shared types + compute_metrics (Sharpe/drawdown/ROI/volume)
  program/    Rust — the SP1 zkVM guest (reads trades, commits ABI-encoded metrics)
  script/     Rust — host: execute / prove / evm (Groth16 fixture) / vkey
  contracts/  Foundry — BuktiAttestation.sol, GatedVault.sol, Deploy.s.sol
  indexer/    TypeScript — reconstruct trade series from raw Mantle swaps (+ Pyth)
  web/        Next.js — address → verified score card + on-chain links
```

## Quick start

Requires a Linux environment (SP1 needs Linux/WSL2). Toolchain: Rust, [SP1](https://docs.succinct.xyz/) (`sp1up`), [Foundry](https://getfoundry.sh/), Node ≥ 20.

```bash
# 1. zkVM — reconstruct & check metrics inside the circuit
cargo run --release --bin bukti -- --execute                       # built-in sample
cargo run --release --bin bukti -- --execute --input swaps.json   # real data

# 2. Indexer — build swaps.json from real Mantle swaps (no API key)
cd indexer && npm install
npm run discover                                                         # find active wallets
npm run index -- --wallet 0x<AGENT> --from <BLOCK> --out ../swaps.json

# 3. Contracts — test & deploy
cd contracts && forge test
forge script script/Deploy.s.sol:Deploy --rpc-url $MANTLE_SEPOLIA_RPC \
  --private-key $PRIVATE_KEY --broadcast --legacy

# 4. Frontend
cd web && npm install && npm run dev
```

Copy `.env.example` → `.env` and fill `PRIVATE_KEY`, `BUKTI_VKEY` (`cargo run --bin vkey`).

## What we use on Mantle (track answers)

- **Data sources:** raw Mantle on-chain swap logs from **Agni Finance** (a PancakeSwap-V3 fork — note its non-standard Swap event) and Merchant Moe, priced via **Pyth** (MNT/USD, ETH/USD feeds). No centralized API.
- **Role of AI/zk:** the risk-adjusted metric reconstruction runs in the SP1 zkVM; the proof is the trust anchor — an AI/compute result written *verifiably* on-chain.
- **Mantle realization:** an `ISP1Verifier` on Mantle verifies the proof; `BuktiAttestation` stores the composable score; `GatedVault` demonstrates a consumer gating capital by verified Sharpe.

## Business model & go-to-market

Bukti is **trust infrastructure that gets paid when capital moves**:

- **Who pays:** protocols that route capital on reputation — copy-trading platforms, agent-vault
  curators, on-chain credit/underwriting, and funds doing due diligence on AI trading agents.
  They pay per verified attestation (proving cost + margin) or via subscription for continuous
  re-scoring of a roster of agents/wallets.
- **Why they pay:** today they either trust self-reported numbers (adverse selection) or build
  bespoke analytics (expensive, unverifiable to *their* users). A Bukti attestation is a
  number they can put in a `require()` — and show their own users as proof, not promise.
- **Wedge market:** the AI-agent economy on Mantle. Hundreds of trading agents (ClawHack alone)
  with zero verifiable track records; every agent marketplace and vault needs exactly this gate.
  ERC-8004 gives the distribution rail: Bukti writes the score, the registry carries it.
- **Post-hackathon path:** (1) real Groth16 verifier on mainnet; (2) integrate with one
  copy-trading/vault partner on Mantle as the reference consumer; (3) per-attestation fee in MNT;
  (4) expand reconstruction coverage (Merchant Moe LB, perps) as volume justifies.
- **For investors (Mirana lens):** this is a *pick-and-shovel* position on the agent economy —
  it monetizes every agent's need to prove itself, regardless of which agents win.

## Trust boundary (stated openly)

The zk proof makes the **computation** (raw swap legs → cost-basis PnL → risk metrics) verifiable and deterministic. What it does **not** yet prove: that the supplied swap legs are authentic, complete, and correctly priced — the anchor block hash is relayer-asserted in the MVP. The roadmap closes this in order: (1) in-circuit receipt-Merkle-proof verification against the anchor's `receiptsRoot` (authenticity), (2) Pyth signed-price verification in-circuit (pricing), (3) an on-chain historical-block-hash accumulator + canonical full-history window policy (completeness, anti-cherry-picking). Known open limitations shared by all on-chain performance metrics: wash-trading can inflate volume, and in-window round-trips only are scored.

## Roadmap

- Real SP1 Groth16 verifier on Mantle (matching SP1 SDK version) via the Succinct Prover Network.
- In-zkVM receipt-Merkle-proof verification for permissionless, no-cooperation reconstruction.
- On-chain block-hash accumulator for fully trustless historical input.
- Merchant Moe Liquidity Book (bin) accounting; LP-position PnL; multi-DEX at scale.

## License

MIT.
