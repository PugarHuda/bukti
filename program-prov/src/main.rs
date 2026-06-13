//! The Bukti PROVENANCE guest. Proves, in-circuit, that a real Mantle swap log is genuine
//! chain data: keccak(header)==trusted block hash -> receiptsRoot -> MPT inclusion -> the
//! receipt contains the Agni Swap log. Commits the proven statement as ABI-encoded
//! `ProvenanceOutput`. A failed check panics, so the only provable statement is a real swap.

#![no_main]
sp1_zkvm::entrypoint!(main);

use alloy_sol_types::SolValue;
use bukti_prov_lib::{verify_provenance, ProvenanceInput};

pub fn main() {
    let input = sp1_zkvm::io::read::<ProvenanceInput>();
    let output = verify_provenance(&input).expect("provenance verification failed");
    sp1_zkvm::io::commit_slice(&output.abi_encode());
}
