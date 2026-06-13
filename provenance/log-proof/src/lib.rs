//! In-zkVM verification that a Mantle DeFi swap LOG is real chain data — the other half of
//! "data proven, not asserted" (the price half is provenance/pyth-vaa/).
//!
//! Given a trusted `receipts_root` (from a Mantle block header, itself anchored to an
//! on-chain block hash via EIP-2935 — live on Mantle/Arsia) and a Merkle-Patricia inclusion
//! proof, this verifies a receipt is included at the trie key `RLP(txIndex)` and that the
//! receipt contains a specific Agni Swap log. The circuit walks the provided path nodes only:
//! sibling subtrees (including Mantle's type-0x7e deposit receipt) appear solely as 32-byte
//! hashes, so the deposit-encoding quirk that breaks off-circuit trie *rebuilds* never matters
//! in-circuit. Pure no_std logic (only `tiny_keccak`), so it drops into the SP1 guest behind
//! the keccak precompile. Isolated workspace so it can't change the deployed program vkey.

use tiny_keccak::{Hasher, Keccak};

#[derive(Debug, PartialEq, Eq)]
pub enum ProofError {
    NodeHashMismatch,
    BadRlp,
    BadNode,
    KeyExhausted,
    PathMismatch,
    NotIncluded,
}

fn keccak(data: &[u8]) -> [u8; 32] {
    let mut k = Keccak::v256();
    k.update(data);
    let mut out = [0u8; 32];
    k.finalize(&mut out);
    out
}

// ---- minimal RLP reader (no_std, slice-based) ----

/// One decoded RLP item: a byte string or a nested list, as a slice into the source.
struct Item<'a> {
    is_list: bool,
    payload: &'a [u8],
}

/// Decode the items of an RLP list `node` (the node must be a list at the top level).
fn rlp_list_items(node: &[u8]) -> Result<heapless_vec::Vec<Item<'_>>, ProofError> {
    let (is_list, payload, _consumed) = rlp_header(node)?;
    if !is_list {
        return Err(ProofError::BadNode);
    }
    let mut out = heapless_vec::Vec::new();
    let mut rest = payload;
    while !rest.is_empty() {
        let (il, pl, consumed) = rlp_header(rest)?;
        out.push(Item { is_list: il, payload: pl });
        rest = &rest[consumed..];
    }
    Ok(out)
}

/// Parse one RLP header; returns (is_list, payload_slice, total_consumed_from_input).
fn rlp_header(b: &[u8]) -> Result<(bool, &[u8], usize), ProofError> {
    let first = *b.first().ok_or(ProofError::BadRlp)?;
    if first < 0x80 {
        // single byte, itself the value
        Ok((false, &b[..1], 1))
    } else if first < 0xb8 {
        let len = (first - 0x80) as usize;
        let end = 1 + len;
        Ok((false, b.get(1..end).ok_or(ProofError::BadRlp)?, end))
    } else if first < 0xc0 {
        let ll = (first - 0xb7) as usize;
        let len = be_len(b.get(1..1 + ll).ok_or(ProofError::BadRlp)?)?;
        let end = 1 + ll + len;
        Ok((false, b.get(1 + ll..end).ok_or(ProofError::BadRlp)?, end))
    } else if first < 0xf8 {
        let len = (first - 0xc0) as usize;
        let end = 1 + len;
        Ok((true, b.get(1..end).ok_or(ProofError::BadRlp)?, end))
    } else {
        let ll = (first - 0xf7) as usize;
        let len = be_len(b.get(1..1 + ll).ok_or(ProofError::BadRlp)?)?;
        let end = 1 + ll + len;
        Ok((true, b.get(1 + ll..end).ok_or(ProofError::BadRlp)?, end))
    }
}

fn be_len(b: &[u8]) -> Result<usize, ProofError> {
    let mut n = 0usize;
    for &x in b {
        n = (n << 8) | x as usize;
    }
    Ok(n)
}

/// Expand bytes to nibbles (high then low).
fn to_nibbles(bytes: &[u8], out: &mut heapless_vec::Vec<u8>) {
    for &x in bytes {
        out.push(x >> 4);
        out.push(x & 0x0f);
    }
}

/// Decode a hex-prefix-encoded path: returns (is_leaf, nibbles).
fn decode_hp(path: &[u8]) -> (bool, heapless_vec::Vec<u8>) {
    let mut nibs = heapless_vec::Vec::new();
    if path.is_empty() {
        return (false, nibs);
    }
    let flag = path[0] >> 4;
    let is_leaf = flag & 2 != 0;
    let odd = flag & 1 != 0;
    if odd {
        nibs.push(path[0] & 0x0f);
    }
    to_nibbles(&path[1..], &mut nibs);
    (is_leaf, nibs)
}

/// Verify an MPT inclusion proof: walk `proof` from `root` following `key`, return the leaf
/// value (the included receipt bytes) if the path resolves, else an error.
pub fn verify_inclusion(root: &[u8; 32], proof: &[&[u8]], key: &[u8]) -> Result<heapless_vec::Bytes, ProofError> {
    let mut key_nibs = heapless_vec::Vec::new();
    to_nibbles(key, &mut key_nibs);

    let mut expected = *root;
    let mut idx = 0usize; // position in key_nibs

    for node in proof {
        if keccak(node) != expected {
            return Err(ProofError::NodeHashMismatch);
        }
        let items = rlp_list_items(node)?;
        match items.len() {
            17 => {
                // branch node
                if idx == key_nibs.len() {
                    return Ok(heapless_vec::Bytes::from(items.as_slice()[16].payload));
                }
                let nib = key_nibs.as_slice()[idx] as usize;
                idx += 1;
                let child = &items.as_slice()[nib];
                if child.payload.len() == 32 {
                    expected.copy_from_slice(child.payload);
                } else {
                    return Err(ProofError::BadNode); // inlined child not expected on this path
                }
            }
            2 => {
                // extension or leaf
                let (is_leaf, path_nibs) = decode_hp(items.as_slice()[0].payload);
                let remaining = &key_nibs.as_slice()[idx..];
                if remaining.len() < path_nibs.len() || remaining[..path_nibs.len()] != *path_nibs.as_slice() {
                    return Err(ProofError::PathMismatch);
                }
                idx += path_nibs.len();
                if is_leaf {
                    if idx != key_nibs.len() {
                        return Err(ProofError::PathMismatch);
                    }
                    return Ok(heapless_vec::Bytes::from(items.as_slice()[1].payload));
                }
                let child = &items.as_slice()[1];
                if child.payload.len() == 32 {
                    expected.copy_from_slice(child.payload);
                } else {
                    return Err(ProofError::BadNode);
                }
            }
            _ => return Err(ProofError::BadNode),
        }
    }
    Err(ProofError::NotIncluded)
}

/// Does the receipt `leaf` (type-prefixed consensus encoding) contain a log emitted by
/// `address` whose first topic is `topic0`? This is the "the swap really happened" check.
pub fn receipt_has_log(leaf: &[u8], address: &[u8; 20], topic0: &[u8; 32]) -> Result<bool, ProofError> {
    // Strip an optional EIP-2718 type byte (0x01/0x02/0x7e) to reach the RLP body.
    let body = if leaf.first().map(|&t| t < 0x80).unwrap_or(false) { &leaf[1..] } else { leaf };
    let fields = rlp_list_items(body)?; // [status, cumGas, bloom, logs]
    if fields.len() < 4 {
        return Err(ProofError::BadNode);
    }
    if !fields.as_slice()[3].is_list {
        return Err(ProofError::BadNode);
    }
    // re-wrap the logs payload as a list and iterate
    let logs = rlp_items_of_payload(fields.as_slice()[3].payload)?;
    for log in logs.as_slice() {
        if !log.is_list {
            continue;
        }
        let parts = rlp_items_of_payload(log.payload)?; // [address, topics, data]
        if parts.len() < 3 {
            continue;
        }
        let addr = parts.as_slice()[0].payload;
        let topics = rlp_items_of_payload(parts.as_slice()[1].payload)?;
        let t0 = topics.as_slice().first().map(|t| t.payload);
        if addr == address && t0 == Some(&topic0[..]) {
            return Ok(true);
        }
    }
    Ok(false)
}

/// Iterate the items of an already-extracted list payload (the bytes inside a list header).
fn rlp_items_of_payload(payload: &[u8]) -> Result<heapless_vec::Vec<Item<'_>>, ProofError> {
    let mut out = heapless_vec::Vec::new();
    let mut rest = payload;
    while !rest.is_empty() {
        let (il, pl, consumed) = rlp_header(rest)?;
        out.push(Item { is_list: il, payload: pl });
        rest = &rest[consumed..];
    }
    Ok(out)
}

/// Tiny fixed-capacity vec/bytes to stay alloc-light (the guest is single-threaded, bounded).
mod heapless_vec {
    pub use std::vec::Vec as StdVec;

    pub struct Vec<T> {
        inner: StdVec<T>,
    }
    impl<T> Vec<T> {
        pub fn new() -> Self {
            Vec { inner: StdVec::new() }
        }
        pub fn push(&mut self, v: T) {
            self.inner.push(v);
        }
        pub fn len(&self) -> usize {
            self.inner.len()
        }
        pub fn as_slice(&self) -> &[T] {
            &self.inner
        }
    }

    pub struct Bytes {
        inner: StdVec<u8>,
    }
    impl Bytes {
        pub fn from(b: &[u8]) -> Self {
            Bytes { inner: b.to_vec() }
        }
        pub fn as_slice(&self) -> &[u8] {
            &self.inner
        }
    }
}
