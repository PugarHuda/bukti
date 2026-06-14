# Bukti — 90-second judge run-through (verify it yourself)

Everything below is **live and independently checkable**. No account, no API key. Live app:
**https://bukti-smoky.vercel.app** (backup: **https://bukti.hudapugar.workers.dev**) · Chain:
Mantle Sepolia (5003) · Repo: github.com/PugarHuda/bukti · 105 agents · 49 Agni+FusionX pools

## The one thing to see first — "Catch a cheater"
**/dashboard/authenticity** → two agents both claim **+312%**. Click *Verify with Bukti* on each.
- **Agent A → PROVEN REAL** (reads a live on-chain attestation + `BuktiProvenance.getProven = true`).
- **Agent B → UNVERIFIED** (no proof on-chain).
A screenshot verifier (or a proof of the PnL *math* like CapCheck) passes both. Bukti catches the
fake because it proves the trades are **genuine Mantle chain data**. *That's the whole thesis.*

## Verify our real Groth16 proof — in your own browser
**/dashboard/proof** → *Verify the real proof* → the real on-chain SP1 verifier accepts our actual
356-byte proof (✓ VALID). → *Verify a tampered proof* → it reverts on-chain (✗ REJECTED).
You just verified a real zk proof against the chain, client-side.

## Verify any cohort wallet yourself
**/dashboard/leaderboard** → click any wallet to **copy its address** → paste into
**/dashboard/verify**. e.g. the champion `0xe860d04da18b968efcbbbee4133ec12fe0f14dc3` → proven
score **4.685**, read live from chain. Or hit its badge:
`https://bukti-smoky.vercel.app/badge/0xe860d04da18b968efcbbbee4133ec12fe0f14dc3` → `score 4.68 ✓`.

## Proof moves money
**/dashboard/allocate** → enter an amount → `BuktiAllocator.previewAllocation` (live) splits it by
proven score: champion `0xe860d0` **82%**, a mid trader **18%**, the volume champion (77 swaps,
score −0.077) **0%**. Real 0.01 MNT allocation already ran on-chain (tx `0x5c8db66…`).

## The data the metrics run on is proven (the capstone)
**BuktiFullProof** `0xC16f221d8bae221A7B5B3ca74DCDCb892B9067FB` — one Groth16 proof that a volume
metric was computed over swaps EACH proven genuine chain data. Read it:
```
cast call 0xC16f221d8bae221A7B5B3ca74DCDCb892B9067FB "latest()(uint32,uint64,bytes32,bool)" \
  --rpc-url https://rpc.sepolia.mantle.xyz
# -> 5, 1296611, 0x33b15e6b…, true   (latest of proofCount=2 cases: 5 swaps, $1.297 volume, allIncluded=true)
# case #1 was 3 swaps / $0.303 (tx 0x3b3fabc8…); case #2 is 5 swaps / $1.297 (tx 0x3c550cc1…) — both real, both verified on-chain
```

## Live contracts (all Mantlescan-verified — invalid proofs revert)
| Contract | Address |
|---|---|
| **BuktiAttestation** (105-wallet cohort) | `0xDFb9C6fA99D8Fa2c8eeA2AE7C055C8cbA53971E9` |
| BuktiAttestation v3 (+completeness) | `0x03fA99f0dE08F182b2880Ee12a2194DBF00a0Dbf` |
| SP1 v6.1.0 Groth16 verifier | `0xb5c7a7761221931ee15c8C70DdF4192a94C49a5A` |
| BuktiValidator (ERC-8004) | `0xda0cEB552af13f5a096D8aA4E5A9FceB9cf6D8D0` |
| BuktiAllocator | `0xa2D2E87367A5cEB1c10B02952fD1e5d375b4b5B9` |
| BuktiProvenance (swap = real chain data) | `0xa4d6d9932B19f9B03D0439264F1188F39F8522f0` |
| BuktiFullProof (metric over proven data) | `0xC16f221d8bae221A7B5B3ca74DCDCb892B9067FB` |

## Reproduce the hard parts from source
```
npm --prefix indexer run receipt-trie    # reproduces Mantle receiptsRoot 5/5 (the cracked blocker)
npm --prefix indexer run log-inclusion   # a real Agni swap log proven included in a Mantle block
forge test --root contracts              # 48/48 ; cargo test -p bukti-lib ; provenance/{pyth-vaa,log-proof} 4/4 & 5/5
```

**One line:** Anyone can claim a track record. Bukti is the only one that proves it's real, down
to the chain data — verifiably, on-chain, today.
