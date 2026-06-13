//! Verifies the in-circuit MPT log-inclusion logic against a REAL Mantle proof
//! (testdata/inclusion.json, produced by `indexer/src/log-inclusion.ts`): a real Agni Swap
//! log, its receipt's MPT path, and the block's receiptsRoot. Proves the guest-side verifier
//! resolves the path to the exact receipt and finds the swap log — and rejects tampering.

use mantle_log_proof::*;
use serde_json::Value;

fn h(s: &str) -> Vec<u8> {
    hex::decode(s.trim_start_matches("0x")).unwrap()
}

struct Fix {
    root: [u8; 32],
    proof: Vec<Vec<u8>>,
    key: Vec<u8>,
    leaf: Vec<u8>,
    addr: [u8; 20],
    topic0: [u8; 32],
}

fn load() -> Fix {
    let j: Value = serde_json::from_str(&std::fs::read_to_string("testdata/inclusion.json").unwrap()).unwrap();
    let mut root = [0u8; 32];
    root.copy_from_slice(&h(j["receiptsRoot"].as_str().unwrap()));
    let proof: Vec<Vec<u8>> = j["proof"].as_array().unwrap().iter().map(|n| h(n.as_str().unwrap())).collect();
    let mut addr = [0u8; 20];
    addr.copy_from_slice(&h(j["swapLog"]["address"].as_str().unwrap()));
    let mut topic0 = [0u8; 32];
    topic0.copy_from_slice(&h(j["swapLog"]["topic0"].as_str().unwrap()));
    Fix {
        root,
        proof,
        key: h(j["key"].as_str().unwrap()),
        leaf: h(j["leaf"].as_str().unwrap()),
        addr,
        topic0,
    }
}

fn refs(v: &[Vec<u8>]) -> Vec<&[u8]> {
    v.iter().map(|x| x.as_slice()).collect()
}

#[test]
fn inclusion_resolves_to_the_exact_receipt() {
    let f = load();
    let leaf = verify_inclusion(&f.root, &refs(&f.proof), &f.key).expect("path resolves");
    assert_eq!(leaf.as_slice(), f.leaf.as_slice(), "resolved leaf == the real receipt");
}

#[test]
fn proven_receipt_contains_the_agni_swap_log() {
    let f = load();
    let leaf = verify_inclusion(&f.root, &refs(&f.proof), &f.key).unwrap();
    assert!(
        receipt_has_log(leaf.as_slice(), &f.addr, &f.topic0).unwrap(),
        "the proven receipt contains the Agni Swap log"
    );
}

#[test]
fn tampered_root_is_rejected() {
    let f = load();
    let mut bad = f.root;
    bad[0] ^= 0xff;
    assert!(matches!(
        verify_inclusion(&bad, &refs(&f.proof), &f.key),
        Err(ProofError::NodeHashMismatch)
    ));
}

#[test]
fn tampered_proof_node_is_rejected() {
    let f = load();
    let mut proof = f.proof.clone();
    let last = proof.len() - 1;
    let n = proof[last].len();
    proof[last][n / 2] ^= 0xff; // flip a byte in the leaf node
    let r = verify_inclusion(&f.root, &refs(&proof), &f.key);
    assert!(r.is_err(), "a mutated proof node must not verify");
}

#[test]
fn wrong_key_does_not_resolve_to_the_swap_receipt() {
    let f = load();
    // key for a different tx index (0x05) must not resolve to our receipt
    let other = vec![0x05u8];
    match verify_inclusion(&f.root, &refs(&f.proof), &other) {
        Ok(leaf) => assert_ne!(leaf.as_slice(), f.leaf.as_slice()),
        Err(_) => {}
    }
}
