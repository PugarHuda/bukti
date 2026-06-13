//! In-circuit Mantle swap-log PROVENANCE: prove a swap log is real chain data.
//!
//! Given a trusted Mantle block hash (read on-chain via EIP-2935 — live on Mantle/Arsia), the
//! guest verifies, entirely in-circuit:
//!   1. keccak(header_rlp) == block_hash            (the header is the real one)
//!   2. receipts_root = header field #5             (the root the block committed to)
//!   3. MPT inclusion of a receipt at key RLP(txIndex) under receipts_root
//!   4. that receipt contains the Agni pool's Swap log (topic0)
//! and commits the proven statement. No trie rebuild in-circuit — sibling subtrees (including
//! Mantle's type-0x7e deposit receipt) appear only as 32-byte hashes on the path.
//!
//! Pure logic + tiny_keccak, so it runs in the SP1 guest (behind the keccak precompile once
//! merged). Lives in its own crate so it never changes the deployed batch program's vkey.

extern crate alloc;
use alloc::vec::Vec;
use alloy_sol_types::sol;
use serde::{Deserialize, Serialize};
use tiny_keccak::{Hasher, Keccak};

sol! {
    /// Public values committed by the provenance guest.
    struct ProvenanceOutput {
        bytes32 blockHash;   // the trusted anchor (read on-chain via EIP-2935)
        bytes32 receiptsRoot;// extracted from the verified header
        address pool;        // the DEX pool whose Swap log was proven
        bytes32 topic0;      // the Swap event signature
        uint32  txIndex;     // receipt index proven included
        bool    included;    // always true on a valid proof (guest panics otherwise)
    }
}

/// Witness for one swap-log provenance proof.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProvenanceInput {
    pub block_hash: [u8; 32],
    pub header_rlp: Vec<u8>,
    pub proof: Vec<Vec<u8>>, // MPT path nodes, root -> leaf
    pub key: Vec<u8>,        // RLP(txIndex)
    pub pool: [u8; 20],
    pub topic0: [u8; 32],
}

#[derive(Debug, PartialEq, Eq)]
pub enum ProvError {
    HeaderHashMismatch,
    NodeHashMismatch,
    BadRlp,
    BadNode,
    PathMismatch,
    NotIncluded,
    LogAbsent,
}

pub fn keccak(data: &[u8]) -> [u8; 32] {
    let mut k = Keccak::v256();
    k.update(data);
    let mut out = [0u8; 32];
    k.finalize(&mut out);
    out
}

// ---- minimal RLP reader ----
struct Rlp<'a> {
    is_list: bool,
    payload: &'a [u8],
}
fn rlp_header(b: &[u8]) -> Result<(bool, &[u8], usize), ProvError> {
    let first = *b.first().ok_or(ProvError::BadRlp)?;
    if first < 0x80 {
        Ok((false, &b[..1], 1))
    } else if first < 0xb8 {
        let n = (first - 0x80) as usize;
        Ok((false, b.get(1..1 + n).ok_or(ProvError::BadRlp)?, 1 + n))
    } else if first < 0xc0 {
        let ll = (first - 0xb7) as usize;
        let n = be(b.get(1..1 + ll).ok_or(ProvError::BadRlp)?);
        Ok((false, b.get(1 + ll..1 + ll + n).ok_or(ProvError::BadRlp)?, 1 + ll + n))
    } else if first < 0xf8 {
        let n = (first - 0xc0) as usize;
        Ok((true, b.get(1..1 + n).ok_or(ProvError::BadRlp)?, 1 + n))
    } else {
        let ll = (first - 0xf7) as usize;
        let n = be(b.get(1..1 + ll).ok_or(ProvError::BadRlp)?);
        Ok((true, b.get(1 + ll..1 + ll + n).ok_or(ProvError::BadRlp)?, 1 + ll + n))
    }
}
fn be(b: &[u8]) -> usize {
    let mut n = 0usize;
    for &x in b {
        n = (n << 8) | x as usize;
    }
    n
}
fn items(payload: &[u8]) -> Result<Vec<Rlp<'_>>, ProvError> {
    let mut out = Vec::new();
    let mut rest = payload;
    while !rest.is_empty() {
        let (il, pl, c) = rlp_header(rest)?;
        out.push(Rlp { is_list: il, payload: pl });
        rest = &rest[c..];
    }
    Ok(out)
}
fn list_items(node: &[u8]) -> Result<Vec<Rlp<'_>>, ProvError> {
    let (is_list, payload, _) = rlp_header(node)?;
    if !is_list {
        return Err(ProvError::BadNode);
    }
    items(payload)
}

fn nibbles(bytes: &[u8]) -> Vec<u8> {
    let mut v = Vec::with_capacity(bytes.len() * 2);
    for &x in bytes {
        v.push(x >> 4);
        v.push(x & 0x0f);
    }
    v
}
fn decode_hp(path: &[u8]) -> (bool, Vec<u8>) {
    let mut nibs = Vec::new();
    if path.is_empty() {
        return (false, nibs);
    }
    let flag = path[0] >> 4;
    let is_leaf = flag & 2 != 0;
    if flag & 1 != 0 {
        nibs.push(path[0] & 0x0f);
    }
    nibs.extend_from_slice(&nibbles(&path[1..]));
    (is_leaf, nibs)
}

/// The receiptsRoot is RLP header field #5 (0-indexed).
pub fn header_receipts_root(header_rlp: &[u8]) -> Result<[u8; 32], ProvError> {
    let fs = list_items(header_rlp)?;
    let f = fs.get(5).ok_or(ProvError::BadNode)?;
    if f.payload.len() != 32 {
        return Err(ProvError::BadNode);
    }
    let mut r = [0u8; 32];
    r.copy_from_slice(f.payload);
    Ok(r)
}

/// Walk the MPT inclusion proof from `root` along `key`; return the leaf value.
pub fn verify_inclusion(root: &[u8; 32], proof: &[Vec<u8>], key: &[u8]) -> Result<Vec<u8>, ProvError> {
    let kn = nibbles(key);
    let mut expected = *root;
    let mut idx = 0usize;
    for node in proof {
        if keccak(node) != expected {
            return Err(ProvError::NodeHashMismatch);
        }
        let it = list_items(node)?;
        if it.len() == 17 {
            if idx == kn.len() {
                return Ok(it[16].payload.to_vec());
            }
            let child = &it[kn[idx] as usize];
            idx += 1;
            if child.payload.len() == 32 {
                expected.copy_from_slice(child.payload);
            } else {
                return Err(ProvError::BadNode);
            }
        } else if it.len() == 2 {
            let (is_leaf, pn) = decode_hp(it[0].payload);
            let rem = &kn[idx..];
            if rem.len() < pn.len() || rem[..pn.len()] != pn[..] {
                return Err(ProvError::PathMismatch);
            }
            idx += pn.len();
            if is_leaf {
                if idx != kn.len() {
                    return Err(ProvError::PathMismatch);
                }
                return Ok(it[1].payload.to_vec());
            }
            let child = &it[1];
            if child.payload.len() == 32 {
                expected.copy_from_slice(child.payload);
            } else {
                return Err(ProvError::BadNode);
            }
        } else {
            return Err(ProvError::BadNode);
        }
    }
    Err(ProvError::NotIncluded)
}

/// Does the receipt `leaf` contain a log from `address` whose first topic is `topic0`?
pub fn receipt_has_log(leaf: &[u8], address: &[u8; 20], topic0: &[u8; 32]) -> Result<bool, ProvError> {
    let body = if leaf.first().map(|&t| t < 0x80).unwrap_or(false) { &leaf[1..] } else { leaf };
    let fs = list_items(body)?;
    if fs.len() < 4 || !fs[3].is_list {
        return Err(ProvError::BadNode);
    }
    for log in items(fs[3].payload)? {
        if !log.is_list {
            continue;
        }
        let parts = items(log.payload)?;
        if parts.len() < 3 {
            continue;
        }
        let topics = items(parts[1].payload)?;
        let t0 = topics.first().map(|t| t.payload);
        if parts[0].payload == address && t0 == Some(&topic0[..]) {
            return Ok(true);
        }
    }
    Ok(false)
}

/// RLP(txIndex) -> txIndex.
fn key_to_index(key: &[u8]) -> u32 {
    if key.is_empty() {
        return 0;
    }
    // RLP(0) is 0x80 (single byte); RLP(small) is the byte itself; RLP(0x80..) is 0x81  b ...
    if key.len() == 1 {
        return if key[0] == 0x80 { 0 } else { key[0] as u32 };
    }
    let (_, payload, _) = match rlp_header(key) {
        Ok(x) => x,
        Err(_) => return 0,
    };
    be(payload) as u32
}

sol! {
    /// Public values for the FULL integration proof: a metric (USD volume) computed entirely
    /// over swaps that are EACH proven to be genuine Mantle chain data — in one Groth16 proof.
    struct FullOutput {
        uint32  numSwaps;          // trades proven genuine chain data
        uint64  totalVolumeUsdE6;  // sum of |amount0| (USDT, 6dec = USD*1e6) over the proven logs
        bytes32 firstBlockHash;    // anchor (EIP-2935-checkable) of the first proven swap
        bool    allIncluded;       // always true on a valid proof (guest panics otherwise)
    }
}

/// Witness for the full proof: N swap-inclusion proofs.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FullInput {
    pub swaps: Vec<ProvenanceInput>,
}

/// Decode `|amount0|` (USDT, 6-decimals = USD·1e6) from the proven receipt's Agni Swap log.
/// amount0 is the first 32 bytes of the log's data field, a two's-complement int256.
pub fn swap_notional_e6(leaf: &[u8], pool: &[u8; 20], topic0: &[u8; 32]) -> Result<u64, ProvError> {
    let body = if leaf.first().map(|&t| t < 0x80).unwrap_or(false) { &leaf[1..] } else { leaf };
    let fs = list_items(body)?;
    if fs.len() < 4 || !fs[3].is_list {
        return Err(ProvError::BadNode);
    }
    for log in items(fs[3].payload)? {
        if !log.is_list {
            continue;
        }
        let parts = items(log.payload)?;
        if parts.len() < 3 {
            continue;
        }
        let topics = items(parts[1].payload)?;
        let t0 = topics.first().map(|t| t.payload);
        if parts[0].payload == pool && t0 == Some(&topic0[..]) {
            let data = parts[2].payload;
            if data.len() < 32 {
                return Err(ProvError::BadNode);
            }
            let mut b = [0u8; 32];
            b.copy_from_slice(&data[..32]);
            // abs via two's-complement negation when the sign bit is set
            if b[0] & 0x80 != 0 {
                let mut carry = 1u16;
                for x in b.iter_mut().rev() {
                    let v = (!*x as u16) + carry;
                    *x = v as u8;
                    carry = v >> 8;
                }
            }
            // USDT amounts fit u64; the magnitude must live in the low 8 bytes
            if b[..24].iter().any(|&x| x != 0) {
                return Err(ProvError::BadNode);
            }
            let mut mag: u64 = 0;
            for &x in &b[24..] {
                mag = (mag << 8) | x as u64;
            }
            return Ok(mag);
        }
    }
    Err(ProvError::LogAbsent)
}

/// THE FULL INTEGRATION: prove every swap is genuine Mantle chain data (header→receiptsRoot→MPT
/// inclusion→Swap log) AND compute the USD-volume metric from amounts decoded in-circuit from
/// those proven logs. The metric's inputs are now proven, not witness-asserted. One proof.
pub fn verify_full(input: &FullInput) -> Result<FullOutput, ProvError> {
    use alloy_sol_types::private::FixedBytes;
    let mut total: u64 = 0;
    let mut first = [0u8; 32];
    for (i, s) in input.swaps.iter().enumerate() {
        if keccak(&s.header_rlp) != s.block_hash {
            return Err(ProvError::HeaderHashMismatch);
        }
        let receipts_root = header_receipts_root(&s.header_rlp)?;
        let leaf = verify_inclusion(&receipts_root, &s.proof, &s.key)?;
        if !receipt_has_log(&leaf, &s.pool, &s.topic0)? {
            return Err(ProvError::LogAbsent);
        }
        total = total.saturating_add(swap_notional_e6(&leaf, &s.pool, &s.topic0)?);
        if i == 0 {
            first = s.block_hash;
        }
    }
    Ok(FullOutput {
        numSwaps: input.swaps.len() as u32,
        totalVolumeUsdE6: total,
        firstBlockHash: FixedBytes::<32>::from(first),
        allIncluded: true,
    })
}

/// Full provenance check. Returns the committed output; the caller (guest) should treat any
/// `Err` as unprovable (panic), so the only provable statement is a real, included swap log.
pub fn verify_provenance(input: &ProvenanceInput) -> Result<ProvenanceOutput, ProvError> {
    // 1. the header is the one the trusted block hash commits to
    if keccak(&input.header_rlp) != input.block_hash {
        return Err(ProvError::HeaderHashMismatch);
    }
    // 2. its receiptsRoot
    let receipts_root = header_receipts_root(&input.header_rlp)?;
    // 3. inclusion of the receipt at RLP(txIndex)
    let leaf = verify_inclusion(&receipts_root, &input.proof, &input.key)?;
    // 4. the receipt actually contains the swap log
    if !receipt_has_log(&leaf, &input.pool, &input.topic0)? {
        return Err(ProvError::LogAbsent);
    }
    use alloy_sol_types::private::FixedBytes;
    Ok(ProvenanceOutput {
        blockHash: FixedBytes::<32>::from(input.block_hash),
        receiptsRoot: FixedBytes::<32>::from(receipts_root),
        pool: input.pool.into(),
        topic0: FixedBytes::<32>::from(input.topic0),
        txIndex: key_to_index(&input.key),
        included: true,
    })
}
