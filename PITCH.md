# Bukti — Project Pitch

**One line:** Nansen tells you a wallet's PnL. **Bukti proves it** — risk-adjusted trading
track records reconstructed from raw Mantle swaps inside an SP1 zkVM, attested on-chain.

**Positioned as:** the **ZK Validation layer for ERC-8004 on Mantle** — a portable, verifiable
trading reputation that follows a trader or agent across the Internet of Agents, and the
**provably-fair referee for Human-vs-AI trading**. Not a dashboard; an identity/privacy
primitive other protocols build on.

## The problem
Every AI trading agent claims a great track record. None can prove it. Screenshots are
edited, dashboards say "trust me," and on-chain "reputation" is self-reported. Mantle just
deployed ERC-8004 promising agents a portable, verifiable credit score — but the registry
is a mailbox; nobody fills it with proof. As the agent economy grows (hundreds of agents in
Mantle's own ClawHack), every vault, lender, and copy-trading protocol faces the same
adverse-selection problem: performance claims they cannot verify.

## The solution
Bukti reconstructs a wallet/agent's realized performance — a per-trade Sharpe-style score,
max drawdown, ROI, volume — from **raw Mantle DeFi swap logs** (Agni, priced at historical
Pyth), with the entire cost-basis PnL reconstruction running **inside an SP1 zero-knowledge
VM** (the same zkVM that secures Mantle via OP-Succinct) in deterministic integer math. A
single Groth16 proof is verified on-chain by a real SP1 verifier, and the result is stored
as a **composable attestation** any contract can read — plus written into Mantle's canonical
ERC-8004 ReputationRegistry, and queryable by AI agents over MCP.

**Bukti is the ZK that ERC-8004's Validation Registry was waiting for.** Mantle deployed
ERC-8004 to mainnet (Feb 16, 2026); its Validation Registry is specified for *"cryptographic
proof of work via stake-secured or **ZK-based** mechanisms"* — and ships empty. Bukti is a
drop-in ZK validator for financial performance: a proof that, once verified on-chain, feeds
the Reputation/Validation registries Mantle already shipped. We don't compete with ERC-8004;
we complete it — with a `BuktiValidator` (live & Mantlescan-verified at
`0xda0cEB552af13f5a096D8aA4E5A9FceB9cf6D8D0`) that answers a `validationRequest` with the
zkVM-proven score: `validationScore(0x48f1…)` reads the real on-chain attestation and returns
**85/100**; the losing volume champion returns **0/100**.

## The flagship result: the Provable ClawHack Leaderboard
This hackathon's Phase 1 ("ClawHack") ranked hundreds of AI agents with a leaderboard you
had to trust. We re-ran that cohort **provably**: 382 wallets discovered in the Apr 15–30
window, the **top 25 scored from 626 raw mainnet swap legs**, and the **entire ranking
attested on-chain with ONE 714-byte Groth16 proof** — for **$0**, on an 8 GB laptop.

The headline insight a VC remembers: **volume crowns the wrong winners.** The cohort's
volume champion (214 swaps) ranks only **#17** by proven risk-adjusted score; the proof
champion (score 4.27) is volume rank #12. Bukti makes volume-gaming *visible* instead of
rewarding it.

**The Human-vs-AI referee.** Phase 2's whole mechanism is Human vs. AI. Bukti is the neutral
scorekeeper that makes that contest *provably fair*: it verifies a human's and an agent's
track record on the same cryptographic footing — same circuit, same prices, same proof.
Whoever wins, the scoreboard isn't something either side can fake.

## Why it's different (verified novel)
- vs **Nansen/Dune**: they compute PnL off-chain and ask you to trust it; ours is a number a
  contract can put in a `require()`.
- vs **ERC-8004 scoring layers / APEX**: those self-attest or run heuristics over public
  footprints; ours is backed by a zkVM proof of the actual reconstruction.
- vs **Recall/Eigen Arena**: they verify agents inside a sandbox; we verify any wallet in
  the wild, no arena entry required.
- vs **x402/AP2**: they prove an agent is *allowed* to pay; we tell you who's *worth* paying.
- vs **signal/alpha bots in this very track** (Alpha Pulse, AlphaForge, Alpha Hunter): they
  verify a *prediction* right now ("log the signal on-chain"); Bukti proves a *historical,
  tamper-proof track record* with ZK. They answer "is this signal good?"; we answer "can I
  trust this trader's entire history, provably, without them doxxing their book?"

*"A leaderboard asks you to trust the platform; a Bukti proof asks you to trust math."*

## Why Mantle
Mantle's own thesis calls for exactly this — a "verifiable workforce" of agents managing
real capital, with portable track records; its ERC-8004 announcement explicitly names
"ZK-based" validation. Bukti is the first project that mints that credit score backed by a
zero-knowledge proof. We use SP1 — the same zkVM securing Mantle — and Mantle-native data
(raw Agni logs).

## What's live (all verifiable on Mantlescan)
- BuktiAttestation v2 (batch): `0x2EB832F24136c24A3B38D4b06D3318C48B618163`
- Real SP1 v6.1.0 Groth16 verifier: `0xb5c7a7761221931ee15c8C70DdF4192a94C49a5A`
- GatedVault (capital gate): `0x851C251411Fe4F4bab586F775c7450f86A348EAD`
- BuktiValidator (ERC-8004 ZK validator): `0xda0cEB552af13f5a096D8aA4E5A9FceB9cf6D8D0`
- ClawHack batch proof tx: `0xe478d52a6c5e312bf0a62b4dad0f944b784da3011649947770c96e00fb82dbc6`
- Live ERC-8004 validation tx: `0x780bbaa851bd7789e349a878fd6a8a07410a6efc44e415d8ce9bf01971a0847f`
- ERC-8004 agent #137 + reputation feedback; live demo + MCP server + ~70 automated tests.

## Business model & go-to-market
Pick-and-shovel on the agent economy — Bukti gets paid when capital moves.

- **Revenue:** (1) per-attestation fee in MNT (proving cost + margin) charged to the protocol
  requesting a score; (2) subscription for continuous re-scoring of a roster of
  agents/wallets; (3) a premium "verified report" export for fund due-diligence.
- **Customers (in priority order):** agent-vault curators and copy-trading platforms on
  Mantle (they need a capital gate they can show *their* users), then on-chain lenders/
  underwriters, then funds vetting AI trading agents.
- **GTM:** land one reference integration — a Mantle copy-trading or agent-vault protocol
  that calls `getSharpeMilli()` in its deposit path (3 lines, see INTEGRATION.md) — then
  expand across the ERC-8004 agent registry as the distribution rail.
- **Why it compounds:** every new agent in Mantle's economy *needs* to prove itself, and
  one Groth16 proof scores a whole cohort, so marginal cost per scored agent ≈ 0. We
  monetize the need to prove, independent of which agents win.
- **Token/sustainability:** proving is already $0 on commodity hardware (a 25-agent batch
  re-proves in ~24 min); fees comfortably exceed cost from day one, and an optional staking
  layer (attesters stake, slashed on disputed scores) hardens trust as volume grows.

## Roadmap (sourced, scoped — incl. an empirically-found blocker)
In-circuit receipt proofs for full data provenance (we tested it; Mantle's modified OP-stack
receipt encoding is the precise blocker — see provenance/), first-ever Pyth VAA verification
in SP1, anti-cherry-picking completeness proofs, and a zkTLS "bring your Bybit PnL on-chain"
extension (Bybit is a sponsor).

## Why this is a Mirana investment, not a feature
The AI Alpha & Data track is sponsored by **Mirana Ventures** (the $100M Mantle EcoFund), whose
stated thesis is *"identity and privacy, agentic commerce, and category-defining
infrastructure."* Bukti speaks that language directly: **ZK = privacy** (prove your returns
without revealing your book), **reputation = identity** (a credential that follows you), and
**portable across platforms = the moat.** It's a *primitive* other Mantle apps license and
build on, not an app that ships one feature — and a clean roadmap to a Bukti-verified *index*
of top traders (MI4 resonance) and a licensed proof layer. VCs reward defensibility and TAM;
Bukti monetizes the one need every agent in the economy shares — the need to prove itself.

## Tracks
Primary: **AI Alpha & Data** (Mirana, Path A). Secondary: **AI Trading & Strategy** (BGA).
Also: Deployment Award, Best UI/UX, Community Voting, Grand Champion.
