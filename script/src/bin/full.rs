//! Bukti FULL-integration host: prove a USD-volume metric over swaps EACH proven to be genuine
//! Mantle chain data — in one Groth16 proof.
//!   cargo run --release --bin full -- --execute
//!   cargo run --release --bin full -- --prove
use alloy_sol_types::SolValue;
use bukti_prov_lib::{verify_full, FullInput, FullOutput, ProvenanceInput};
use clap::Parser;
use serde_json::Value;
use sp1_sdk::{
    blocking::{ProveRequest, Prover, ProverClient},
    include_elf, Elf, HashableKey, ProvingKey, SP1ProofWithPublicValues, SP1Stdin, SP1VerifyingKey,
};
use std::path::PathBuf;

const FULL_ELF: Elf = include_elf!("bukti-program-full");

#[derive(Parser, Debug)]
struct Args {
    #[arg(long)]
    execute: bool,
    #[arg(long)]
    prove: bool,
    #[arg(long, default_value = "../provenance/log-proof/testdata/full-input.json")]
    input: String,
}

fn hx(s: &str) -> Vec<u8> {
    hex::decode(s.trim_start_matches("0x")).expect("hex")
}
fn arr32(s: &str) -> [u8; 32] {
    let mut b = [0u8; 32];
    b.copy_from_slice(&hx(s));
    b
}
fn arr20(s: &str) -> [u8; 20] {
    let mut b = [0u8; 20];
    b.copy_from_slice(&hx(s));
    b
}

fn load(path: &str) -> FullInput {
    let j: Value = serde_json::from_str(&std::fs::read_to_string(path).expect("read")).expect("json");
    let swaps = j["swaps"]
        .as_array()
        .unwrap()
        .iter()
        .map(|s| ProvenanceInput {
            block_hash: arr32(s["blockHash"].as_str().unwrap()),
            header_rlp: hx(s["headerRlp"].as_str().unwrap()),
            proof: s["proof"].as_array().unwrap().iter().map(|n| hx(n.as_str().unwrap())).collect(),
            key: hx(s["key"].as_str().unwrap()),
            pool: arr20(s["pool"].as_str().unwrap()),
            topic0: arr32(s["topic0"].as_str().unwrap()),
        })
        .collect();
    FullInput { swaps }
}

fn main() {
    sp1_sdk::utils::setup_logger();
    dotenv::dotenv().ok();
    let args = Args::parse();
    let input = load(&args.input);
    let host = verify_full(&input).expect("host full verification failed");
    println!("host: {} swaps proven, total volume ${:.2}", host.numSwaps, host.totalVolumeUsdE6 as f64 / 1e6);

    let client = ProverClient::from_env();
    let mut stdin = SP1Stdin::new();
    stdin.write(&input);

    if args.execute {
        let (output, report) = client.execute(FULL_ELF, stdin).run().unwrap();
        let d = FullOutput::abi_decode(output.as_slice()).unwrap();
        assert_eq!(output.as_slice(), host.abi_encode().as_slice(), "in-circuit == host");
        println!("In-circuit metric over PROVEN chain data matches host. \u{2713}");
        println!("  numSwaps {} · totalVolumeUsdE6 {} · allIncluded {}", d.numSwaps, d.totalVolumeUsdE6, d.allIncluded);
        println!("Number of cycles: {}", report.total_instruction_count());
        println!("publicValues: 0x{}", hex::encode(output.as_slice()));
    } else {
        let pk = client.setup(FULL_ELF).expect("setup");
        let proof = client.prove(&pk, stdin).groth16().run().expect("prove");
        let bytes = proof.public_values.as_slice();
        let d = FullOutput::abi_decode(bytes).unwrap();
        write_fixture(proof.bytes(), bytes, pk.verifying_key(), d.numSwaps, d.totalVolumeUsdE6);
    }
}

#[derive(serde::Serialize)]
struct FullFixture {
    num_swaps: u32,
    total_volume_usd_e6: u64,
    vkey: String,
    public_values: String,
    proof: String,
}

fn write_fixture(proof: Vec<u8>, pv: &[u8], vk: &SP1VerifyingKey, num: u32, vol: u64) {
    let f = FullFixture {
        num_swaps: num,
        total_volume_usd_e6: vol,
        vkey: vk.bytes32().to_string(),
        public_values: format!("0x{}", hex::encode(pv)),
        proof: format!("0x{}", hex::encode(proof)),
    };
    println!("Verification Key: {}", f.vkey);
    println!("Proven: {} swaps, ${:.2} volume — all genuine chain data", num, vol as f64 / 1e6);
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../contracts/src/fixtures");
    std::fs::create_dir_all(&path).unwrap();
    std::fs::write(path.join("groth16-full-fixture.json"), serde_json::to_string_pretty(&f).unwrap()).unwrap();
    println!("wrote contracts/src/fixtures/groth16-full-fixture.json");
}
