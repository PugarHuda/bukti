//! Print the verification key (vkey) for the Bukti program. This bytes32 is set in
//! the on-chain attestation contract so it only accepts proofs of *this* exact program.

use sp1_sdk::{blocking::MockProver, blocking::Prover, include_elf, Elf, HashableKey, ProvingKey};

const BUKTI_ELF: Elf = include_elf!("bukti-program");

fn main() {
    let prover = MockProver::new();
    let pk = prover.setup(BUKTI_ELF).expect("failed to setup elf");
    println!("{}", pk.verifying_key().bytes32());
}
