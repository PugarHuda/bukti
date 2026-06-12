# Bukti — DoraHacks Submission (paste-ready)

## BUIDL name
**Bukti** — The Provable ClawHack Leaderboard

## One-line pitch
Nansen tells you a wallet's PnL. **Bukti proves it** — we re-ranked this hackathon's own
ClawHack cohort (25 top agents, 626 raw mainnet swaps) inside an SP1 zkVM and attested the
entire leaderboard on Mantle with ONE 714-byte Groth16 proof.

**Positioning:** the **ZK Validation layer for ERC-8004 on Mantle** — the provably-fair
referee for Human-vs-AI trading.

## Tracks
- Primary: **AI Alpha & Data** (Mirana) — Path A: Data & Analytics
- Secondary: **AI Trading & Strategy** (BGA)

## Links
- 🌐 Live demo: https://bukti-smoky.vercel.app
- 📦 Repo (open-source): https://github.com/PugarHuda/bukti
- 🎬 Demo video: **[PASTE after recording]**
- 📄 Pitch: [PITCH.md](PITCH.md) · Architecture & verification: [DEPLOYMENTS.md](DEPLOYMENTS.md) · [docs/](docs)

## Description (paste into the form)
Every AI trading agent claims a great track record; none can prove it. Dashboards are
trust-me, screenshots are editable, and on-chain reputation today is self-reported.

**Bukti** reconstructs a wallet/agent's realized performance — per-trade Sharpe-style score,
max drawdown, ROI, volume — from **raw Mantle DeFi swap logs** (Agni, priced at historical
Pyth), with the entire cost-basis PnL reconstruction running **inside an SP1 zkVM** (the same
zkVM that secures Mantle via OP-Succinct) in deterministic integer math. One Groth16 proof
is verified on-chain by a real SP1 verifier and stored as a **composable attestation** any
protocol can read — our GatedVault routes capital only to agents whose *proven* score clears
a threshold. Scores are also written into Mantle's canonical **ERC-8004 ReputationRegistry**,
and exposed to AI agents through an **MCP server** so agents check proof, not promises.

Mantle deployed ERC-8004 to mainnet in Feb 2026; its **Validation Registry** is specified for
*"ZK-based"* validation and ships empty. Bukti is the drop-in **ZK validator** that fills it
for financial performance — and the neutral, **provably-fair referee for Phase 2's Human-vs-AI**
contest, scoring a human and an agent on the identical circuit, prices, and proof. Versus the
signal/alpha bots in this track (Alpha Pulse et al.) that log a *prediction*: Bukti proves a
*historical, tamper-proof track record* — "can I trust this trader's whole history, provably,
without them doxxing their book?"

Flagship result: this hackathon's Phase 1 ("ClawHack") ranked hundreds of agents with a
leaderboard you had to trust. We re-ran the cohort provably — 382 wallets discovered, the top
25 scored from 626 raw mainnet swaps, the **entire ranking attested on-chain with one
714-byte Groth16 proof, for $0** on an 8 GB laptop. The insight: **volume crowns the wrong
winners** — the cohort's volume champion (214 swaps) ranks only #17 by proven score.

## Tell us (track answers)
- **Data sources:** raw Mantle mainnet swap logs from Agni Finance (a PancakeSwap-V3 fork —
  non-standard Swap event), historical prices via Pyth Benchmarks, block-hash anchoring.
  Mantle-native data is the core source. **Mantle-native assets are first-class:** mETH and
  cmETH (Mantle's $1B+ LST/LRT) priced via Pyth METH/USD, USDY (Ondo RWA, MI4 constituent)
  via Pyth USDY/USD, MNT via MNT/USD — not ETH proxies. No centralized API.
- **Role of AI/zk:** the risk-adjusted metric reconstruction runs inside the SP1 zkVM; the
  proof is the product. An AI/compute result written *verifiably* on-chain — the hackathon's
  "AI-powered function callable on-chain."
- **Verifiable value on Mantle:** BuktiAttestation + GatedVault + **BuktiValidator** (the
  ERC-8004 ZK validator) deployed & source-verified on Mantle Sepolia; scores written into
  Mantle's ERC-8004 Reputation *and* Validation registries; one Groth16 proof attests a
  25-agent leaderboard, verified by a real SP1 verifier on-chain.
- **Surfaces (Telegram & Discord):** `bukti-bot` answers `/score`, `/validate`, `/leaderboard`
  on both Telegram and Discord — every reply read live from chain, backed by the proof.

## Deployed contracts (Mantle Sepolia, chainId 5003 — all Mantlescan-verified)
| Contract | Address |
|---|---|
| BuktiAttestation v2 (batch) | `0x2EB832F24136c24A3B38D4b06D3318C48B618163` |
| SP1 Groth16 Verifier v6.1.0 (real) | `0xb5c7a7761221931ee15c8C70DdF4192a94C49a5A` |
| GatedVault | `0x851C251411Fe4F4bab586F775c7450f86A348EAD` |
| BuktiValidator (ERC-8004 ZK validator) | `0xda0cEB552af13f5a096D8aA4E5A9FceB9cf6D8D0` |
| ReferenceValidationRegistry | `0x0954E50cBC85836C9E3FC6868d24b6118d974E9d` |

Key txs: ClawHack batch proof `0xe478d52a6c5e312bf0a62b4dad0f944b784da3011649947770c96e00fb82dbc6` ·
ERC-8004 reputation feedback `0xf44b6d62e80ab8e6e8f09b7da31f1975b3ea58269d66beb7fb1d3c44480464f7` ·
ERC-8004 ZK validation `0x780bbaa851bd7789e349a878fd6a8a07410a6efc44e415d8ce9bf01971a0847f`

## 20 Project Deployment Award checklist
- [x] Contract deployed on Mantle Testnet
- [x] Contract verified on Mantle Explorer (3 contracts, "Pass - Verified")
- [x] AI-powered function callable on-chain (proof-verified attestation)
- [x] Frontend publicly accessible: https://bukti-smoky.vercel.app
- [x] Deployment address in submission (above)
- [ ] Demo video ≥ 2 min — **record & paste link**
- [x] Open-source repo + README: https://github.com/PugarHuda/bukti

## X post (Community Voting) — paste
> Most AI trading agents *claim* a track record. None can *prove* it.
>
> Meet Bukti: we re-ranked @0xMantle's own ClawHack cohort PROVABLY — 25 agents,
> reconstructed from raw mainnet swaps inside an SP1 zkVM, the whole leaderboard attested
> on-chain with ONE 714-byte Groth16 proof. For \$0.
>
> Volume crowns the wrong winners. Proof doesn't. 👇
> https://bukti-smoky.vercel.app
> #MantleAIHackathon
