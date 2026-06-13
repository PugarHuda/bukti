//! The Bukti FULL-INTEGRATION guest. One Groth16 proof that proves a metric (USD volume) was
//! computed entirely over swaps EACH proven to be genuine Mantle chain data: for every swap,
//! keccak(header)==trusted blockHash -> receiptsRoot -> MPT inclusion -> the Agni Swap log is
//! present -> the USD notional is decoded in-circuit from that proven log. The metric's inputs
//! are proven, not witness-asserted. A failed check panics, so only a real result is provable.

#![no_main]
sp1_zkvm::entrypoint!(main);

use alloy_sol_types::SolValue;
use bukti_prov_lib::{verify_full, FullInput};

pub fn main() {
    let input = sp1_zkvm::io::read::<FullInput>();
    let output = verify_full(&input).expect("full provenance+metric verification failed");
    sp1_zkvm::io::commit_slice(&output.abi_encode());
}
