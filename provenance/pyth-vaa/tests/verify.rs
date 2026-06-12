//! Verifies the Pyth VAA core against a REAL accumulator update fetched from Hermes
//! (testdata/eth-update.json). Proves the parser + guardian-signature verification +
//! Merkle inclusion + price decode reproduce exactly what Hermes reports — i.e. the price
//! is cryptographically the one Wormhole's guardians signed, decoded in-circuit-compatible code.

use pyth_vaa_verify::*;
use serde_json::Value;

fn fixture() -> (Vec<u8>, i64, i32, i64) {
    let raw = std::fs::read_to_string("testdata/eth-update.json").expect("fixture");
    let j: Value = serde_json::from_str(&raw).unwrap();
    let hexs = j["updateHex"].as_str().unwrap();
    let bytes = hex::decode(hexs).unwrap();
    let price: i64 = j["price"].as_str().unwrap().parse().unwrap();
    let expo: i32 = j["expo"].as_i64().unwrap() as i32;
    let pt: i64 = j["publishTime"].as_i64().unwrap();
    (bytes, price, expo, pt)
}

#[test]
fn parses_accumulator_and_vaa_set_index_is_4() {
    let (bytes, _, _, _) = fixture();
    let acc = parse_accumulator(&bytes).expect("PNAU parse");
    assert!(!acc.updates.is_empty());
    let vaa = parse_vaa(acc.vaa).expect("VAA parse");
    assert_eq!(vaa.guardian_set_index, 4, "Hermes signs with guardian set 4");
    assert!(vaa.signatures.len() >= QUORUM, "at least quorum signatures present");
}

#[test]
fn verifies_real_guardian_quorum() {
    let (bytes, _, _, _) = fixture();
    let acc = parse_accumulator(&bytes).unwrap();
    let vaa = parse_vaa(acc.vaa).unwrap();
    // The heart of it: ≥13 real Wormhole guardians signed this price's Merkle root.
    verify_guardian_signatures(&vaa, &GUARDIAN_SET_4).expect("guardian quorum verifies");
}

#[test]
fn rejects_tampered_body() {
    let (bytes, _, _, _) = fixture();
    let acc = parse_accumulator(&bytes).unwrap();
    let mut vaa_bytes = acc.vaa.to_vec();
    // flip a byte in the body (after the signature section) -> quorum must fail
    let last = vaa_bytes.len() - 1;
    vaa_bytes[last] ^= 0xff;
    let vaa = parse_vaa(&vaa_bytes).unwrap();
    assert_eq!(
        verify_guardian_signatures(&vaa, &GUARDIAN_SET_4),
        Err(VaaError::QuorumNotMet),
        "tampered body must break the guardian signatures"
    );
}

#[test]
fn end_to_end_proves_the_hermes_price() {
    let (bytes, price, expo, pt) = fixture();
    let feeds = verify_update(&bytes, &GUARDIAN_SET_4).expect("full verification");
    assert_eq!(feeds.len(), 1);
    let f = &feeds[0];
    // The decoded, guardian-signed, Merkle-proven price equals what Hermes reported.
    assert_eq!(f.price, price);
    assert_eq!(f.expo, expo);
    assert_eq!(f.publish_time, pt);
}
