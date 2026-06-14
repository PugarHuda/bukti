# Bukti

**Proof-of-Real-PnL — the chain-authenticity layer for on-chain trading track records.**

Every AI trading agent claims a great record; none can prove it. A screenshot is editable, a
dashboard says "trust me," and **even a ZK proof of the PnL *math* can't tell a real track record
from a fabricated one** — it proves arithmetic over whatever numbers you feed it.

**Bukti** reconstructs a wallet/agent's risk-adjusted track record (Sharpe-style score, drawdown,
ROI, volume) from **raw Mantle swaps inside an SP1 zero-knowledge VM**, attests it on-chain — and,
uniquely, **proves every trade is genuine Mantle chain data**: receipt-trie inclusion under the
block's `receiptsRoot`, anchored trustlessly via EIP-2935. So a fabricated record literally cannot
pass. It's also the drop-in **ZK validator for Mantle's ERC-8004** Validation Registry.

- 🌐 **Live (primary):** https://bukti-smoky.vercel.app
- 🌐 **Live (backup, full app on Cloudflare):** https://bukti.hudapugar.workers.dev
- 📄 [PITCH.md](PITCH.md) · [SUBMISSION.md](SUBMISSION.md) · [DEPLOYMENTS.md](DEPLOYMENTS.md) · [docs/INTEGRATION.md](docs/INTEGRATION.md) · [docs/ROADMAP.md](docs/ROADMAP.md)

Built for **The Turing Test Hackathon 2026** (Mantle). Primary track: **AI Alpha & Data** (Mirana).

---

> 🏆 **Flagship — the Provable ClawHack Leaderboard.** This hackathon's Phase 1 ("ClawHack")
> ranked agents with a leaderboard you had to trust. Bukti re-ran the cohort *provably*: **382
> wallets discovered, 105 active traders scored from 1,818 raw mainnet swaps across 49 Agni +
> FusionX pools**, each score attested on-chain by the real SP1 verifier across **four 714-byte
> Groth16 proofs (memory-safe batches)**, for **$0** on an 8 GB laptop. Every displayed score equals
> the on-chain attested value bit-for-bit (`qa-consistency` 105/105).
>
> **The insight VCs remember:** volume crowns the wrong winners. The volume champion (77 swaps)
> ranks **#82** by proven score; volume agrees with proven skill just **25%** of the time, and
> **97% of all volume came from net-losing wallets.** Proof separates signal from noise.

## The moat: we prove the *data*, not just the math

Two agents advertise the same +312%. One is real, one is fabricated. A screenshot verifier passes
both; a ZK proof of the PnL math passes both. **Bukti catches the fake** because it requires a
Groth16 proof that each swap log is included in a real Mantle block — with no trusted indexer:

- **BuktiProvenance** — we cracked Mantle's non-standard 4-field deposit-receipt (type `0x7e`)
  encoding, rebuild the receipts trie, and prove a swap log's inclusion under the block's
  `receiptsRoot`, anchored by the real block hash served on-chain via **EIP-2935** (live on Mantle).
  `getProven(...)` returns true only for genuine chain data.
- **BuktiFullProof** — a metric (USD volume) computed over swaps **each proven genuine chain data**,
  in one Groth16 proof. On-chain across 2 distinct verified cases (`proofCount = 2`).

See it live: [/dashboard/authenticity](https://bukti-smoky.vercel.app/dashboard/authenticity).

## How it works

```
[Indexer]  raw Mantle swap logs (Agni + FusionX, 49 V3-fork pools)  +  historical Pyth prices
   │        → RAW swap legs per wallet (token, amount, trade-time price)  →  batch-wide.json
   ▼
[SP1 zkVM guest]  cost-basis PnL reconstruction for N wallets  →  realized round-trips
   │              → score / maxDrawdown / ROI / volume   (deterministic integer math)
   │              commit public values: BuktiOutput[]  (one entry per wallet)
   ▼
[Groth16 proofs]  →  714 bytes each, memory-safe batches → 105 wallets
   ▼
[Mantle Sepolia]  real SP1 verifier → BuktiAttestation.submitBatchAttestation()
          → composable, tamper-proof scores → GatedVault · BuktiAllocator · ERC-8004 · MCP · leaderboard
```

- **The proof covers the reconstruction itself**, not just summary stats: the weighted-average
  cost-basis realized-PnL computation *and* the risk metrics run inside the zkVM in integer math.
- **The score** is a per-trade Sharpe-style ratio (mean/std of per-trade returns, ×1000 on-chain) —
  deliberately *not* an annualized Sharpe. A score of 0.000 means fewer than two closed round-trips
  (no provable skill yet); negatives are stored faithfully — the ranking is provable, not flattering.

## Live on Mantle Sepolia (chainId 5003) — all source-verified

| Contract | Address |
|---|---|
| **BuktiAttestation** (105-wallet cohort) | [`0xDFb9C6fA99D8Fa2c8eeA2AE7C055C8cbA53971E9`](https://sepolia.mantlescan.xyz/address/0xDFb9C6fA99D8Fa2c8eeA2AE7C055C8cbA53971E9) |
| **BuktiProvenance** (swap = genuine chain data) | [`0xa4d6d9932B19f9B03D0439264F1188F39F8522f0`](https://sepolia.mantlescan.xyz/address/0xa4d6d9932B19f9B03D0439264F1188F39F8522f0) |
| **BuktiFullProof** (metric over proven chain data) | [`0xC16f221d8bae221A7B5B3ca74DCDCb892B9067FB`](https://sepolia.mantlescan.xyz/address/0xC16f221d8bae221A7B5B3ca74DCDCb892B9067FB) |
| SP1 Groth16 Verifier v6.1.0 (real) | [`0xb5c7a7761221931ee15c8C70DdF4192a94C49a5A`](https://sepolia.mantlescan.xyz/address/0xb5c7a7761221931ee15c8C70DdF4192a94C49a5A) |
| BuktiValidator (ERC-8004 ZK validator) | [`0xda0cEB552af13f5a096D8aA4E5A9FceB9cf6D8D0`](https://sepolia.mantlescan.xyz/address/0xda0cEB552af13f5a096D8aA4E5A9FceB9cf6D8D0) |
| BuktiAllocator (capital routed by proof) | [`0xa2D2E87367A5cEB1c10B02952fD1e5d375b4b5B9`](https://sepolia.mantlescan.xyz/address/0xa2D2E87367A5cEB1c10B02952fD1e5d375b4b5B9) |
| GatedVault (capital gate) | [`0x851C251411Fe4F4bab586F775c7450f86A348EAD`](https://sepolia.mantlescan.xyz/address/0x851C251411Fe4F4bab586F775c7450f86A348EAD) |
| BuktiAttestation v3 (+completeness commitment) | [`0x03fA99f0dE08F182b2880Ee12a2194DBF00a0Dbf`](https://sepolia.mantlescan.xyz/address/0x03fA99f0dE08F182b2880Ee12a2194DBF00a0Dbf) |

**ERC-8004 integration, live:** scores are also written into Mantle's canonical ERC-8004
ReputationRegistry (agent **#137**). Mantle's ERC-8004 Validation Registry is spec'd for "ZK-based"
validation and ships empty — Bukti is the drop-in validator that fills it. See [DEPLOYMENTS.md](DEPLOYMENTS.md).

## A verifiability project, verifiable about itself

We publish our own [trust boundary](https://bukti-smoky.vercel.app/dashboard/trust) and keep
closing it with **running code** (each `npm run …` over the live cohort):

| Aspect | Status |
|---|---|
| Metric / completeness / **swap-log authenticity** | **PROVEN on-chain** |
| Block-hash anchor (EIP-2935) | **TRUSTLESS** |
| Wash-trading (fee-aware score makes it self-defeating; Spearman volume↔skill = −0.06) | **MITIGATED** |
| Open-position mark-to-market (surfaces $1,699 hidden exposure) | **MITIGATED** |
| Wallet↔controller identity (EIP-191 challenge; adversary rejected) | **MITIGATED** |
| Oracle confidence & staleness (conf/price ≤ 50 bps, fresh) | **MITIGATED** |
| Sybil / sacrifice-wallet (funder-graph set-exclusion: 18 → 87 identities) | **MITIGATED** |
| Price authenticity (in-zkVM Pyth/Wormhole guardian-sig verifier, 4/4 tests) | **CORE BUILT** |
| Third-party audit | **HONEST GAP** |

## For AI agents: bukti-mcp

Agents managing capital should check **proof, not promises**. The repo ships an MCP server
([docs/MCP.md](docs/MCP.md)) exposing 5 tools — `bukti_get_verified_score`, `bukti_leaderboard`,
`bukti_check_vault_eligibility`, `bukti_compare_wallets`, `bukti_proof_info` — all reading live from
Mantle, plus an x402 proof-gate, an embeddable score badge, and Telegram/Discord bots.

> *"Should I copy the most active ClawHack wallet (77 swaps)?"* → agent checks Bukti →
> **"No: it ranks #82 by proven score. The proven champion is `0xe860d0…` (score 4.685),
> read live from chain."**

For protocol developers: **[docs/INTEGRATION.md](docs/INTEGRATION.md)** — gate capital by proof in
3 lines of Solidity (`getSharpeMilli`), plus provenance/full-proof reads, verify-a-proof-yourself,
HTTP surfaces, and ERC-8004. Live API reference at [/doc](https://bukti-smoky.vercel.app/doc).

## Repository layout

```
bukti/
  lib/          Rust — shared types + risk metrics (Sharpe/drawdown/ROI/volume)
  program/      Rust — SP1 zkVM guest: batch attestation (BuktiOutput[])
  program-full/ Rust — SP1 guest: metric proven over swaps EACH genuine chain data
  prov-lib/     Rust — receipt-trie inclusion, header/RLP, Pyth VAA verification
  provenance/   Rust — pyth-vaa (guardian sigs) + log-proof (receipt-trie) test crates
  script/       Rust — host: execute / evm (Groth16 batch fixture) / full / vkey
  contracts/    Foundry — BuktiAttestation, Provenance, FullProof, Allocator, Validator, GatedVault
  indexer/      TypeScript — discovery, witness build, pricing, + QA/anti-gaming detectors
  web/          Next.js — landing, dashboard (8 pages), /doc, /slide, share cards, badge, x402 gate
```

## Quick start

Requires Linux/WSL2 (SP1). Toolchain: Rust, [SP1](https://docs.succinct.xyz/) (`sp1up`),
[Foundry](https://getfoundry.sh/), Node ≥ 20.

```bash
# Tests (all green)
cargo test -p bukti-lib                       # 22/22 metric tests
(cd provenance/pyth-vaa && cargo test)        # 4/4 Pyth guardian-sig
(cd provenance/log-proof && cargo test)       # 5/5 receipt-trie inclusion
forge test --root contracts                   # 48/48 contract tests

# Reproduce the hard parts from real chain data
npm --prefix indexer run receipt-trie         # rebuild Mantle receiptsRoot (the cracked blocker)
npm --prefix indexer run log-inclusion        # a real swap log proven included in a Mantle block
npm --prefix indexer run qa-consistency       # 105/105 board == on-chain attested values

# Anti-gaming detectors (over the live cohort)
npm --prefix indexer run wash-sybil           # volume is self-defeating under a fee-aware score
npm --prefix indexer run funder-graph         # sybil set-exclusion (18 → 87 identities)

# Frontend (Vercel) + Cloudflare backup
cd web && npm install && npm run dev
npm run cf:deploy                             # full app on Cloudflare Workers (see CLOUDFLARE.md)
```

## Don't trust us — check

| Claim | Verify it yourself |
|---|---|
| Verify a real Groth16 proof in your browser | [/dashboard/proof](https://bukti-smoky.vercel.app/dashboard/proof) — real proof → VALID, tampered → REVERT |
| Any wallet's proven score, from your terminal | `cast call 0xDFb9C6fA99D8Fa2c8eeA2AE7C055C8cbA53971E9 "getSharpeMilli(address)(int64,bool)" 0xe860d04da18b968efcbbbee4133ec12fe0f14dc3 --rpc-url https://rpc.sepolia.mantle.xyz` |
| A swap is genuine Mantle chain data | `BuktiProvenance.getProven(...)` = true · [reproduce the receiptsRoot](indexer/src/receipt-trie.ts) |
| Board == chain, bit-for-bit | `npm --prefix indexer run qa-consistency` → 105/105 |
| The verifier rejects junk | submit any junk proof → revert ([verifier source](https://sepolia.mantlescan.xyz/address/0xb5c7a7761221931ee15c8C70DdF4192a94C49a5A#code)) |

## Roadmap

- ~~Real SP1 Groth16 verifier on Mantle~~ ✅ live (v6.1.0).
- ~~In-zkVM receipt-trie proof of swap-log authenticity~~ ✅ live (BuktiProvenance + EIP-2935).
- ~~Metric proven over genuine chain data, end-to-end~~ ✅ live (BuktiFullProof).
- Fold the in-zkVM Pyth guardian-sig verifier (built, 4/4) into the live circuit.
- Funder-graph anti-sybil at scale; wider venue coverage (Merchant Moe LB); third-party audit.

## License

MIT.
