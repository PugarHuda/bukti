# provenance/ — in-circuit receipt-proof R&D

The honest endgame for Bukti's trust model is proving each swap is a real Mantle chain
event *inside* the zkVM (see [../docs/ROADMAP.md](../docs/ROADMAP.md) §1). This folder
holds the de-risking experiment.

## `check-trie/` — empirical finding

Rebuilds a real Mantle block's receipts Merkle-Patricia trie locally (`alloy-trie`
HashBuilder) and compares the root to the on-chain `header.receipts_root`. This is the
make-or-break step: if we can't reproduce the root off-chain, we can't verify inclusion
proofs in-circuit.

```bash
cd check-trie && cargo run --release -- 96483631
```

**Result:** ordinary receipts (EIP-1559 `0x02`, legacy) reproduce correctly, but the
block's **type-`0x7e` OP deposit/system receipt** does not — Mantle is a *modified*
OP-stack (MNT gas token, EigenDA, custom fee fields), so its receipt RLP diverges from
canonical OP encoding, and the rebuilt root ≠ `receipts_root`.

**Conclusion:** in-circuit receipt-inclusion proofs are viable but gated on Mantle's exact
receipt-encoding spec — a multi-week research item, not a hackathon slice. We scoped it
precisely rather than ship a half-working version. Isolated from the main build so it can
never affect the deployed batch program's verification key.
