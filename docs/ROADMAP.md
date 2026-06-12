# Bukti Roadmap — closing the trust boundary, step by step

We state our current trust assumptions openly (relayer-asserted anchor, witness-supplied
prices, no completeness proof). Each has a concrete, sourced path to elimination — most
on the same SP1 stack we already run.

## 1. Trustless anchor — inherited from the chain itself (2–4 weeks)
Mantle is becoming the first SP1-proven ZK validity rollup (OP Succinct). Bukti v2
replaces the relayer-asserted anchor with **[SP1-CC](https://github.com/succinctlabs/sp1-contract-call)**
(live, audited, in production for EigenDA): MPT state/receipt proofs verified inside the
circuit against block hashes checked on-chain via `blockhash()` /
[EIP-2935](https://eips.ethereum.org/EIPS/eip-2935)'s 8191-block ring buffer.
*The same zkVM that proves our metrics proves the chain they ran on.*

## 2. First Pyth VAA verification inside SP1 (2–3 weeks)
Pyth prices are attested by Wormhole VAAs — 13-of-19 guardian secp256k1 signatures over a
keccak256 body, plus a per-price Merkle proof. SP1 ships
[secp256k1-recover and keccak precompiles](https://blog.succinct.xyz/succinctshipsprecompiles/),
making in-circuit VAA verification a low-single-digit-millions-of-cycles add-on. **No
public prior art of Pyth VAA verification in SP1/RISC Zero exists as of June 2026** —
this would be a first. Historical prices become cryptographically authentic instead of
witness-asserted. (Forward path: Pyth Lazer payloads carry a single ECDSA signature —
trivial in-circuit.)

## 3. Anti-cherry-picking by construction (2–6 weeks)
Two complementary proofs make the record provably *complete*, not a highlight reel:
- **Nonce-delta exhaustiveness**: MPT account proofs at the window's boundary blocks give
  `nonce(end) − nonce(start)` = the exact count of outgoing txs; the circuit then proves
  inclusion of exactly that many — no omitted trades.
- **Bloom-filtered receipt scan** over a parent-hash-linked header chain (SP1-CC's
  `get_logs()` pattern): every log matching the trader's filter in range, complete by
  construction, scaled via [SP1 proof aggregation](https://docs.succinct.xyz/docs/sp1/writing-programs/proof-aggregation).

## 4. Bring your Bybit PnL on-chain (zkTLS, 1–2 weeks for a pilot)
The same pattern [Brevis + Primus run in production for Binance proof-of-reserves](https://blog.brevis.network/2026/04/13/brevis-primus-and-perena-verifiable-proof-of-reserves-for-usd/)
applies to trader history: a custom [Reclaim](https://docs.reclaimprotocol.org/) /
[Primus](https://docs.primuslabs.xyz/) provider over Bybit's authenticated trade-history
API feeds CEX records into the same Bukti attestation flow — extending proven track
records beyond DeFi. (Stated honestly: zkTLS adds an MPC-notary/TEE assumption.)

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
