//! In-zkVM verification of Pyth price updates — the "prices proven, not asserted" core.
//!
//! Today Bukti prices each swap leg at a relayer-asserted historical Pyth price. This module
//! is the path to proving those prices were the EXACT values signed by Wormhole's guardians:
//! it parses a Pyth accumulator update (the bytes Hermes serves), verifies the Wormhole VAA's
//! guardian secp256k1 signatures over the Merkle root, verifies a price's Merkle inclusion in
//! that signed root, and decodes the price. To our knowledge this guardian-signature + Pyth
//! accumulator verification has not been done inside a zkVM before.
//!
//! Pure `no_std`-friendly logic (only `k256` + `tiny_keccak`), so it drops into the SP1 guest
//! where both map to accelerated precompiles (secp256k1 `ecrecover`, `keccak`). It lives in an
//! ISOLATED workspace so developing it cannot change the deployed batch program's vkey.

use k256::ecdsa::{RecoveryId, Signature, VerifyingKey};
use tiny_keccak::{Hasher, Keccak};

/// Wormhole mainnet guardian set #6 — the current active set (19 guardians), read from the
/// Wormhole core contract `getGuardianSet(6)` on Ethereum
/// (0x98f3c9e6E3fAce36bAAd05FE09d375Ef1464288B). The set index is read from each VAA header,
/// so production code resolves the right set on-chain; this constant pins the live one.
pub const GUARDIAN_SET_6: [[u8; 20]; 19] = [
    hexaddr(b"5893B5A76c3f739645648885bDCcC06cd70a3Cd3"),
    hexaddr(b"fF6CB952589BDE862c25Ef4392132fb9D4A42157"),
    hexaddr(b"114De8460193bdf3A2fCf81f86a09765F4762fD1"),
    hexaddr(b"107A0086b32d7A0977926A205131d8731D39cbEB"),
    hexaddr(b"8C82B2fd82FaeD2711d59AF0F2499D16e726f6b2"),
    hexaddr(b"42579bFFbCF4276E290aB8E4C162bd4052b97970"),
    hexaddr(b"938f104AEb5581293216ce97d771e0CB721221B1"),
    hexaddr(b"18e41674CcF26329cD111406C1D05C6c80b23EdC"),
    hexaddr(b"9D16870160e703324D057c3361c34C5beFBa2c34"),
    hexaddr(b"000aC0076727b35FBea2dAc28fEE5cCB0fEA768e"),
    hexaddr(b"AF45Ced136b9D9e24903464AE889F5C8a723FC14"),
    hexaddr(b"f93124b7c738843CBB89E864c862c38cddCccF95"),
    hexaddr(b"D2CC37A4dc036a8D232b48f62cDD4731412f4890"),
    hexaddr(b"DA798F6896A3331F64b48c12D1D57Fd9cbe70811"),
    hexaddr(b"D1F64e26238811de5553C40f64af41eE1B6057Cc"),
    hexaddr(b"3F851Ad586A47ceF8d04748f33ab0D71395f06b4"),
    hexaddr(b"178e21ad2E77AE06711549CFBB1f9c7a9d8096e8"),
    hexaddr(b"7899cEAB1DC961Dae9defDB7A4f521269a5448FC"),
    hexaddr(b"6FbEBc898F403E4773E95feB15E80C9A99c8348d"),
];

/// 13-of-19 quorum (floor(2/3 * 19) + 1), the Wormhole guardian threshold.
pub const QUORUM: usize = 13;

#[derive(Debug, PartialEq, Eq)]
pub enum VaaError {
    BadMagic,
    Truncated,
    BadProofType,
    QuorumNotMet,
    MerkleMismatch,
}

/// A decoded Pyth price.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PriceFeed {
    pub feed_id: [u8; 32],
    pub price: i64,
    pub conf: u64,
    pub expo: i32,
    pub publish_time: i64,
}

struct Reader<'a> {
    b: &'a [u8],
    o: usize,
}
impl<'a> Reader<'a> {
    fn new(b: &'a [u8]) -> Self {
        Reader { b, o: 0 }
    }
    fn take(&mut self, n: usize) -> Result<&'a [u8], VaaError> {
        let s = self.b.get(self.o..self.o + n).ok_or(VaaError::Truncated)?;
        self.o += n;
        Ok(s)
    }
    fn u8(&mut self) -> Result<u8, VaaError> {
        Ok(self.take(1)?[0])
    }
    fn u16(&mut self) -> Result<u16, VaaError> {
        let s = self.take(2)?;
        Ok(u16::from_be_bytes([s[0], s[1]]))
    }
    fn u32(&mut self) -> Result<u32, VaaError> {
        let s = self.take(4)?;
        Ok(u32::from_be_bytes([s[0], s[1], s[2], s[3]]))
    }
    fn i64(&mut self) -> Result<i64, VaaError> {
        let s = self.take(8)?;
        Ok(i64::from_be_bytes(s.try_into().unwrap()))
    }
    fn u64(&mut self) -> Result<u64, VaaError> {
        let s = self.take(8)?;
        Ok(u64::from_be_bytes(s.try_into().unwrap()))
    }
}

fn keccak(data: &[&[u8]]) -> [u8; 32] {
    let mut k = Keccak::v256();
    for d in data {
        k.update(d);
    }
    let mut out = [0u8; 32];
    k.finalize(&mut out);
    out
}

/// Recover the 20-byte Ethereum address that signed `digest32` with a 65-byte [r||s||v] sig.
fn ecrecover(digest32: &[u8; 32], sig65: &[u8]) -> Option<[u8; 20]> {
    let recid = RecoveryId::from_byte(sig65[64].checked_sub(27).unwrap_or(sig65[64]))?;
    let signature = Signature::from_slice(&sig65[..64]).ok()?;
    let vk = VerifyingKey::recover_from_prehash(digest32, &signature, recid).ok()?;
    let pt = vk.to_encoded_point(false);
    let pub_xy = &pt.as_bytes()[1..]; // drop 0x04 prefix, 64 bytes
    let h = keccak(&[pub_xy]);
    let mut addr = [0u8; 20];
    addr.copy_from_slice(&h[12..]);
    Some(addr)
}

/// A parsed Wormhole VAA: the guardian signatures and the signed body.
pub struct Vaa<'a> {
    pub guardian_set_index: u32,
    pub signatures: alloc_vec::Vec<(u8, [u8; 65])>,
    pub body: &'a [u8],
}

mod alloc_vec {
    pub use std::vec::Vec;
}

/// Parse a Wormhole VAA (version 1).
pub fn parse_vaa(vaa: &[u8]) -> Result<Vaa<'_>, VaaError> {
    let mut r = Reader::new(vaa);
    let _version = r.u8()?;
    let guardian_set_index = r.u32()?;
    let n = r.u8()? as usize;
    let mut signatures = std::vec::Vec::with_capacity(n);
    for _ in 0..n {
        let idx = r.u8()?;
        let mut sig = [0u8; 65];
        sig.copy_from_slice(r.take(65)?);
        signatures.push((idx, sig));
    }
    let body = &vaa[r.o..];
    Ok(Vaa { guardian_set_index, signatures, body })
}

/// Verify ≥QUORUM guardian signatures over the VAA body against a guardian set.
/// The signed digest is the *double* keccak of the body (Wormhole convention).
pub fn verify_guardian_signatures(vaa: &Vaa, guardians: &[[u8; 20]]) -> Result<(), VaaError> {
    let body_hash = keccak(&[&keccak(&[vaa.body])]);
    let mut valid = 0usize;
    let mut last_idx: i32 = -1;
    for (idx, sig) in &vaa.signatures {
        // indices must be strictly increasing (no double-counting a guardian)
        if (*idx as i32) <= last_idx {
            continue;
        }
        let g = match guardians.get(*idx as usize) {
            Some(g) => g,
            None => continue,
        };
        if let Some(addr) = ecrecover(&body_hash, sig) {
            if &addr == g {
                valid += 1;
                last_idx = *idx as i32;
            }
        }
    }
    if valid >= QUORUM {
        Ok(())
    } else {
        Err(VaaError::QuorumNotMet)
    }
}

/// Pyth accumulator update: the VAA (signs a Merkle root) + price messages with Merkle proofs.
pub struct AccumulatorUpdate<'a> {
    pub vaa: &'a [u8],
    /// Each price update: (message bytes, Merkle proof as a list of 20-byte sibling hashes).
    pub updates: std::vec::Vec<(&'a [u8], std::vec::Vec<[u8; 20]>)>,
}

/// Parse the "PNAU" accumulator update format Hermes serves.
pub fn parse_accumulator(update: &[u8]) -> Result<AccumulatorUpdate<'_>, VaaError> {
    let mut r = Reader::new(update);
    if r.take(4)? != [0x50, 0x4e, 0x41, 0x55] {
        return Err(VaaError::BadMagic); // "PNAU"
    }
    let _major = r.u8()?;
    let _minor = r.u8()?;
    let trailing = r.u8()? as usize;
    r.take(trailing)?; // skip trailing header
    let proof_type = r.u8()?;
    if proof_type != 0 {
        return Err(VaaError::BadProofType); // 0 = WormholeMerkle
    }
    let vaa_len = r.u16()? as usize;
    let vaa = r.take(vaa_len)?;
    let num = r.u8()? as usize;
    let mut updates = std::vec::Vec::with_capacity(num);
    for _ in 0..num {
        let msg_len = r.u16()? as usize;
        let msg = r.take(msg_len)?;
        let proof_len = r.u8()? as usize;
        let mut proof = std::vec::Vec::with_capacity(proof_len);
        for _ in 0..proof_len {
            let mut h = [0u8; 20];
            h.copy_from_slice(r.take(20)?);
            proof.push(h);
        }
        updates.push((msg, proof));
    }
    Ok(AccumulatorUpdate { vaa, updates })
}

/// Extract the 20-byte Pyth Merkle root from a verified VAA body's payload.
/// Body: timestamp(4) nonce(4) emitterChain(2) emitterAddr(32) sequence(8) consistency(1) payload.
/// Payload ("AUWV"): magic(4) updateType(1) slot(8) ringSize(4) root(20).
pub fn merkle_root_from_vaa_body(body: &[u8]) -> Result<[u8; 20], VaaError> {
    let mut r = Reader::new(body);
    r.take(4 + 4 + 2 + 32 + 8 + 1)?; // skip to payload
    if r.take(4)? != [0x41, 0x55, 0x57, 0x56] {
        return Err(VaaError::BadMagic); // "AUWV"
    }
    let _update_type = r.u8()?;
    let _slot = r.u64()?;
    let _ring_size = r.u32()?;
    let mut root = [0u8; 20];
    root.copy_from_slice(r.take(20)?);
    Ok(root)
}

/// Verify a price message's Merkle inclusion in `root` (Pyth keccak160 tree:
/// leaf = keccak(0x00 || msg)[..20]; node = keccak(0x01 || min||max)[..20]).
pub fn verify_merkle(msg: &[u8], proof: &[[u8; 20]], root: &[u8; 20]) -> Result<(), VaaError> {
    let h = keccak(&[&[0x00], msg]);
    let mut cur = [0u8; 20];
    cur.copy_from_slice(&h[..20]);
    for sib in proof {
        let (a, b) = if cur <= *sib { (cur, *sib) } else { (*sib, cur) };
        let hn = keccak(&[&[0x01], &a, &b]);
        cur.copy_from_slice(&hn[..20]);
    }
    if &cur == root {
        Ok(())
    } else {
        Err(VaaError::MerkleMismatch)
    }
}

/// Decode a Pyth price-feed message (type 0).
pub fn parse_price_message(msg: &[u8]) -> Result<PriceFeed, VaaError> {
    let mut r = Reader::new(msg);
    let _msg_type = r.u8()?; // 0 = PriceFeed
    let mut feed_id = [0u8; 32];
    feed_id.copy_from_slice(r.take(32)?);
    let price = r.i64()?;
    let conf = r.u64()?;
    let expo = r.u32()? as i32;
    let publish_time = r.i64()?;
    Ok(PriceFeed { feed_id, price, conf, expo, publish_time })
}

/// End-to-end: parse the Hermes update, verify guardian quorum over the signed Merkle root,
/// verify each price's inclusion, and return the proven prices.
pub fn verify_update(update: &[u8], guardians: &[[u8; 20]]) -> Result<std::vec::Vec<PriceFeed>, VaaError> {
    let acc = parse_accumulator(update)?;
    let vaa = parse_vaa(acc.vaa)?;
    verify_guardian_signatures(&vaa, guardians)?;
    let root = merkle_root_from_vaa_body(vaa.body)?;
    let mut feeds = std::vec::Vec::new();
    for (msg, proof) in &acc.updates {
        verify_merkle(msg, proof, &root)?;
        feeds.push(parse_price_message(msg)?);
    }
    Ok(feeds)
}

const fn hexaddr(s: &[u8; 40]) -> [u8; 20] {
    let mut out = [0u8; 20];
    let mut i = 0;
    while i < 20 {
        out[i] = (hexval(s[i * 2]) << 4) | hexval(s[i * 2 + 1]);
        i += 1;
    }
    out
}
const fn hexval(c: u8) -> u8 {
    match c {
        b'0'..=b'9' => c - b'0',
        b'a'..=b'f' => c - b'a' + 10,
        b'A'..=b'F' => c - b'A' + 10,
        _ => 0,
    }
}
