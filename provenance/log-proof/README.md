# mantle-log-proof — proving a Mantle swap LOG is real chain data, in-circuit

> **Status:** the blocker is cracked. Off-circuit, a real Agni Swap log is provably included in
> a real Mantle block (`indexer/src/log-inclusion.ts` → LOG_INCLUSION_OK). This crate is the
> in-circuit verifier core (MPT path walk + receipt-log extraction), tested against that real
> proof. Folding it (with provenance/pyth-vaa/) into the live circuit behind SP1's keccak
> precompile + re-proving is the remaining integration. Isolated workspace so its deps can't
> change the deployed vkey.

## The blocker, and the crack

To prove a swap log is real you rebuild the block's **receipts trie** and verify an inclusion
proof against the header's `receiptsRoot`. Standard `op-alloy` *cannot reproduce Mantle's
receiptsRoot*, because Mantle's **type-0x7e deposit receipt** diverges from canonical OP. This
was the project's documented multi-week blocker.

**Reverse-engineered empirically (validated on live mainnet):** Mantle encodes the deposit
receipt with only the **4 base consensus fields**:

```
0x7e || RLP([ status, cumulativeGasUsed, logsBloom, logs ])
```

— **no `depositNonce`, no `depositReceiptVersion`** (Mantle forked before OP's Canyon
receipt-hashing update, and also omits the Regolith deposit-nonce field from the consensus
receipt). Standard op-alloy appends those fields, so its rebuilt root diverges. With the
4-field rule, `indexer/src/receipt-trie.ts` reproduces Mantle's `receiptsRoot` **5/5 across
live blocks** (and the same encoder reproduces an Ethereum-mainnet block too, ruling out an
encoder bug).

## What the in-circuit verifier checks

Inputs (witness): `receipts_root`, the MPT `proof` path nodes, the trie `key = RLP(txIndex)`,
and the target receipt `leaf`.

1. **MPT path walk** (`verify_inclusion`): start at `receipts_root`; for each path node assert
   `keccak(node) == expected_hash`, RLP-decode it (branch / extension / leaf), follow the key
   nibbles, and return the leaf value. Sibling subtrees — **including the type-0x7e deposit
   receipt** — appear only as 32-byte hashes, so the deposit-encoding quirk never touches the
   in-circuit path. (A swap log lives in an ordinary 0x02 receipt anyway.)
2. **Log presence** (`receipt_has_log`): RLP-decode the proven receipt and confirm it contains
   a log emitted by the Agni pool with the PancakeV3-fork Swap `topic0` — "the swap happened."

## Trust anchor

`receipts_root` comes from the block header; `keccak(header_rlp) == blockHash`; and **EIP-2935
is live on Mantle (Arsia upgrade)** — the historical block hash for the last ~8191 blocks is
readable on-chain from `0x0F792be4B0c0cb4DAE440Ef133E90C0eCD48CCCC`, so the anchor is trustless
(no relayer). Older history anchors to Mantle's L1 state commitment / OP-Succinct proof.

## Run

```bash
# off-circuit: reproduce receiptsRoot + a real inclusion proof, and dump the fixture
npm --prefix ../../indexer run receipt-trie       # RECEIPT_TRIE_OK 5/5
npm --prefix ../../indexer run log-inclusion -- --dump   # LOG_INCLUSION_OK

# in-circuit core
cargo test    # verifies the path + log against the real fixture, rejects tampering
```

## Remaining integration (scoped)

- Reconstruct the Mantle header RLP in-guest to bind `receipts_root → blockHash` (mind Arsia's
  repurposed `BlobGasUsed` header field).
- Merge `verify_inclusion` + the Pyth verifier into `bukti-program`, behind SP1's keccak +
  secp256k1 precompiles, take {header, proof, price-update} as witness, and re-prove. Reference
  Succinct's `rsp` / Mantle's own `op-succinct` for Mantle-correct header/receipt handling.
