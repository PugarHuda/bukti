# Bukti — DoraHacks Submission (paste-ready)

## BUIDL name
**Bukti** — The Provable ClawHack Leaderboard

## One-line pitch
Nansen tells you a wallet's PnL. **Bukti proves it** — we re-ranked this hackathon's own
ClawHack cohort (**105 agents across 49 Agni + FusionX pools, 1,818 raw mainnet swaps**) inside
an SP1 zkVM and attested the entire leaderboard on Mantle with 714-byte Groth16 proofs — all 105
scores verified bit-for-bit against chain (qa-consistency 105/105), for $0 on an 8 GB laptop.

**Positioning:** **Proof-of-Real-PnL — the chain-authenticity layer for agent reputation.**
A screenshot (or a ZK proof of the PnL math alone) can't tell a real track record from a fake;
Bukti can, because it proves every trade is genuine Mantle chain data. Also the ZK Validation
layer for ERC-8004 on Mantle. *Catch-a-cheater: two agents, same +312% — Bukti proves which is real.*

## Tracks
- Primary: **AI Alpha & Data** (Mirana) — Path A: Data & Analytics
- Secondary: **AI Trading & Strategy** (BGA)

## Links
- 🌐 Live demo: https://bukti-smoky.vercel.app  ·  backup (full app, Cloudflare): https://bukti.hudapugar.workers.dev
- 📦 Repo (open-source): https://github.com/PugarHuda/bukti
- 📖 Live API docs: https://bukti-smoky.vercel.app/doc  ·  Pitch deck: https://bukti-smoky.vercel.app/slide
- 🎬 Demo video: **[PASTE after recording]**
- 📄 Pitch: [PITCH.md](PITCH.md) · Business: [docs/BUSINESS.md](docs/BUSINESS.md) · Judge run-through: [docs/JUDGE-RUNTHROUGH.md](docs/JUDGE-RUNTHROUGH.md) · Architecture: [DEPLOYMENTS.md](DEPLOYMENTS.md) · [docs/](docs)

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
105 scored from 1,818 raw mainnet swaps, the **entire ranking attested on-chain with four
714-byte Groth16 proofs, for $0** on an 8 GB laptop. The insight: **volume crowns the wrong
winners** — the cohort's volume champion (77 swaps) ranks only #82 by proven score.

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
  105-agent leaderboard, verified by a real SP1 verifier on-chain.
- **Surfaces (Telegram & Discord):** `bukti-bot` answers `/score`, `/validate`, `/leaderboard`
  on both Telegram and Discord — every reply read live from chain, backed by the proof.

## Deployed contracts (Mantle Sepolia, chainId 5003 — all Mantlescan-verified)
| Contract | Address |
|---|---|
| **BuktiAttestation (105-wallet wide cohort)** | `0xDFb9C6fA99D8Fa2c8eeA2AE7C055C8cbA53971E9` |
| BuktiAttestation v2 (batch) | `0x2EB832F24136c24A3B38D4b06D3318C48B618163` |
| BuktiAttestation v3 (+ completeness commitment) | `0x03fA99f0dE08F182b2880Ee12a2194DBF00a0Dbf` |
| SP1 Groth16 Verifier v6.1.0 (real) | `0xb5c7a7761221931ee15c8C70DdF4192a94C49a5A` |
| GatedVault | `0x851C251411Fe4F4bab586F775c7450f86A348EAD` |
| BuktiValidator (ERC-8004 ZK validator) | `0xda0cEB552af13f5a096D8aA4E5A9FceB9cf6D8D0` |
| BuktiAllocator (capital routed by proof) | `0xa2D2E87367A5cEB1c10B02952fD1e5d375b4b5B9` |
| **BuktiProvenance** (proves a swap log is genuine Mantle chain data) | `0xa4d6d9932B19f9B03D0439264F1188F39F8522f0` |
| **BuktiFullProof** (metric proven over genuine chain data, in ONE proof) | `0xC16f221d8bae221A7B5B3ca74DCDCb892B9067FB` |
| ReferenceValidationRegistry | `0x0954E50cBC85836C9E3FC6868d24b6118d974E9d` |

Key txs: ClawHack batch proof `0xe478d52a6c5e312bf0a62b4dad0f944b784da3011649947770c96e00fb82dbc6` ·
completeness re-proof `0x39183a61c94f3af6616aad33fa01225dc2b877c6a3119c02f7d38513cee54f1c` ·
**provenance proof** (swap = genuine chain data) `0x92537a756a28692e5b084fcb751cac993fd1a0491fe7ce613880e00c989cf8e6` ·
ERC-8004 ZK validation `0x780bbaa851bd7789e349a878fd6a8a07410a6efc44e415d8ce9bf01971a0847f`

## 20 Project Deployment Award checklist
- [x] Contract deployed on Mantle Testnet
- [x] Contract verified on Mantle Explorer (3 contracts, "Pass - Verified")
- [x] AI-powered function callable on-chain (proof-verified attestation)
- [x] Frontend publicly accessible: https://bukti-smoky.vercel.app
- [x] Deployment address in submission (above)
- [ ] Demo video ≥ 2 min — **record & paste link**
- [x] Open-source repo + README: https://github.com/PugarHuda/bukti

## X thread (Community Voting) — paste-ready (7 tweets)

**1/** Two AI agents both claim a +312% track record. One is real. One is fabricated.
A screenshot can't tell them apart. Neither can a ZK proof of the PnL *math*.
Meet Bukti — the one verifier that can. 🧵 #MantleAIHackathon
https://bukti-smoky.vercel.app/dashboard/authenticity

**2/** The problem: every trading agent claims a great record, none can prove it. Screenshots
are edited, dashboards say "trust me," on-chain "reputation" is self-reported.
Capital flows to liars.

**3/** Bukti reconstructs a wallet's risk-adjusted track record from raw @0xMantle swaps
*inside an SP1 zero-knowledge VM*, and attests it on-chain with a real Groth16 proof.
The proof is the product — a number a smart contract can `require()`.

**4/** The moat nobody else has: we prove every trade is **genuine Mantle chain data**.
We cracked Mantle's receipt encoding + anchor the block hash via EIP-2935 — so a fabricated
record literally cannot pass. Live on-chain. That's why we catch the fake.

**5/** We re-ran @0xMantle's own ClawHack cohort PROVABLY: 105 agents, 1,818 raw swaps, the whole
leaderboard attested with four 714-byte Groth16 proofs, for \$0. The insight VCs remember:
**volume crowns the wrong winners** — the volume champion ranks #82 by proven skill.

**6/** And a proof is useless until it moves money: BuktiAllocator routes capital by proven
score — 82% to the champion, **0%** to the volume champion who actually lost money.
Plus an ERC-8004 ZK validator, an x402 proof-gate, an embeddable score badge, an MCP server.

**7/** Don't trust us — verify our real Groth16 proof yourself, live in your browser. ✅
**Proof-of-Real-PnL — the chain-authenticity layer for the agent economy.** Built on Mantle.
🔗 https://bukti-smoky.vercel.app · code: https://github.com/PugarHuda/bukti
#MantleAIHackathon

---
*(Single-tweet fallback):*
> Two agents claim +312%. One's lying. Bukti proves which — because it proves the trades are
> real @0xMantle chain data, not a screenshot. zkVM-reconstructed, Groth16-verified on-chain, $0.
> Proof-of-Real-PnL. 👇 https://bukti-smoky.vercel.app #MantleAIHackathon
