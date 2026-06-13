# Bukti Roadmap — the trust boundary is mostly closed

Most of what was "roadmap" is now **done and live**. What remains is integration + frontier
extensions, all on the same SP1 stack.

## 1. ✅ DONE & LIVE — Trustless data provenance (in-circuit receipt-inclusion)
The endgame is reached: a real Agni swap log is **proven on-chain** to be genuine Mantle chain
data — `keccak(rlp(header)) == blockHash` → `receiptsRoot` → Merkle-Patricia **receipts-trie**
inclusion → the receipt contains the Swap log. Live: **BuktiProvenance**
`0xa4d6d9932B19f9B03D0439264F1188F39F8522f0`, proof tx `0x92537a75…`, `getProven → included=true`.

**The blocker is cracked.** The original `provenance/check-trie/` finding was that op-alloy
couldn't reproduce Mantle's `receiptsRoot` because of the type-`0x7e` deposit receipt. We
reverse-engineered it empirically: **Mantle encodes the deposit receipt with only the 4 base
consensus fields — `0x7e‖RLP([status, cumGas, bloom, logs])`, no depositNonce, no
depositReceiptVersion** (it forked before OP's Canyon receipt-hashing change). With that fix our
rebuild reproduces `receiptsRoot` **5/5 across live blocks**, and the in-circuit MPT verifier is
tested in `provenance/log-proof/` (5/5). The trust anchor is solved too: **EIP-2935 is live on
Mantle (Arsia)** — the historical block hash is readable on-chain, no relayer. Self-contained on
Mantle, with no coprocessor dependency. **And it's now folded into a metric:** BuktiFullProof
(`0xC16f221d…`) is a single Groth16 proof that a USD-volume metric was computed over N swaps EACH
proven genuine chain data, with the notional decoded in-circuit from the proven log — live on-chain
across 2 distinct verified cases (`proofCount=2`: 3 swaps/$0.303 and 5 swaps/$1.297, `latest()` =
5 swaps, included=true). The metric's inputs are proven, not asserted. Scaling this
to the full Sharpe over a 25-wallet batch (many inclusion proofs per wallet) is an engineering
scale-up + the Pyth price half (§2); the construction is proven.

## 2. ✅ BUILT — First Pyth VAA verification inside SP1 (integration pending)
**Done and tested:** `provenance/pyth-vaa/` parses a Pyth accumulator update + Wormhole VAA,
verifies the **13-of-19 guardian secp256k1 quorum** over the keccak body, the price's Merkle
inclusion, and decodes the price — **4/4 tests against a real Hermes update** (reproduces the
exact price Hermes reports; a tampered body breaks the quorum). To our knowledge, the first
guardian-signature + Pyth-accumulator verification in zkVM-compatible Rust. Remaining: fold into
the live circuit behind SP1 precompiles + re-prove.

Background: Pyth prices are attested by Wormhole VAAs — 13-of-19 guardian secp256k1 signatures
over a keccak256 body, plus a per-price Merkle proof. SP1 ships
[secp256k1-recover and keccak precompiles](https://blog.succinct.xyz/succinctshipsprecompiles/),
making in-circuit VAA verification a low-single-digit-millions-of-cycles add-on. **No
public prior art of Pyth VAA verification in SP1/RISC Zero exists as of June 2026** —
this would be a first. Historical prices become cryptographically authentic instead of
witness-asserted. (Forward path: Pyth Lazer payloads carry a single ECDSA signature —
trivial in-circuit.)

## 3. ✅ LIVE — Anti-cherry-picking commitment (v3) + stronger constructions (roadmap)
**Shipped:** BuktiAttestation v3 commits, in-circuit, a keccak hash of the wallet's FULL ordered
swap set (`swapsRoot`) — dropping or reordering any leg changes the on-chain attestation. 25/25
verified against the public witness. Stronger *exhaustiveness* proofs are the next step:
- **Nonce-delta exhaustiveness**: MPT account proofs at the window's boundary blocks give
  `nonce(end) − nonce(start)` = the exact count of outgoing txs; the circuit then proves
  inclusion of exactly that many — no omitted trades.
- **Bloom-filtered receipt scan** over a parent-hash-linked header chain (SP1-CC's
  `get_logs()` pattern): every log matching the trader's filter in range, complete by
  construction, scaled via [SP1 proof aggregation](https://docs.succinct.xyz/docs/sp1/writing-programs/proof-aggregation).

## 4. Bring your Bybit PnL on-chain (zkTLS, ~1 week pilot — sponsor-aligned)
**Bybit is a hackathon sponsor**, which makes this the highest-value extension: prove a trader's
*centralized-exchange* track record on-chain too. The same pattern
[Brevis + Primus run in production for Binance proof-of-reserves](https://blog.brevis.network/2026/04/13/brevis-primus-and-perena-verifiable-proof-of-reserves-for-usd/)
applies to trader history. Precise design: a [Reclaim](https://docs.reclaimprotocol.org/) /
[Primus](https://docs.primuslabs.xyz/) zkTLS provider attests a Bybit trade-history export; the
attested export is fed as a **signed input** into the *same* SP1 circuit that already computes
Sharpe/drawdown/ROI for DeFi swaps — so the metric stays proven in-zkVM, only the data source
changes. Effort is ~1 week for a pilot (Reclaim SDK + the attestor-sig check in-circuit).
**Honest caveat:** Reclaim/Primus are attestor/MPC-TLS models, so this trades the relayer for an
attestor-trust assumption — it is *not* a pure end-to-end SNARK. We'd state that plainly rather
than overclaim. (Not built — scoped here; the DeFi path above is fully live.)

## 5. Productization
Mainnet deployment → one design-partner integration (copy-trading or agent-vault on
Mantle) charging per attestation in MNT → scheduled re-scoring (a full 25-wallet batch
re-proves in ~24 minutes on cached artifacts; minutes on a 16 GB CI runner) → coverage:
Merchant Moe Liquidity Book accounting, perps venues.

### Why this sequencing is credible
Every item reuses the deployed stack (SP1 v6.x circuit + vkey-rotatable verifier — circuit
upgrades don't break consumers). Items 1–3 remove the exact assumptions documented in our
trust boundary; we cited live, audited dependencies and flagged the two estimates
(VAA cycle count; Mantle's EIP-2935 fork status) that need a benchmark before commitment.
