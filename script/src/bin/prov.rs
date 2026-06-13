//! Bukti PROVENANCE host: prove (in-circuit) that a real Mantle swap log is genuine chain data.
//!
//! ```shell
//! RUST_LOG=info cargo run --release --bin prov -- --execute   # in-circuit==host, cycle count
//! RUST_LOG=info cargo run --release --bin prov -- --prove     # real Groth16 + Solidity fixture
//! ```
use alloy_sol_types::SolValue;
use bukti_prov_lib::{verify_provenance, ProvenanceInput, ProvenanceOutput};
use clap::Parser;
use serde_json::Value;
use sp1_sdk::{
    blocking::{ProveRequest, Prover, ProverClient},
    include_elf, Elf, HashableKey, ProvingKey, SP1ProofWithPublicValues, SP1Stdin, SP1VerifyingKey,
};
use std::path::PathBuf;

const PROV_ELF: Elf = include_elf!("bukti-program-prov");

#[derive(Parser, Debug)]
struct Args {
    #[arg(long)]
    execute: bool,
    #[arg(long)]
    prove: bool,
    #[arg(long, default_value = "../provenance/log-proof/testdata/inclusion.json")]
    input: String,
}

fn hx(s: &str) -> Vec<u8> {
    hex::decode(s.trim_start_matches("0x")).expect("hex")
}

fn load_input(path: &str) -> ProvenanceInput {
    let j: Value = serde_json::from_str(&std::fs::read_to_string(path).expect("read fixture")).expect("json");
    let mut block_hash = [0u8; 32];
    block_hash.copy_from_slice(&hx(j["blockHash"].as_str().unwrap()));
    let mut pool = [0u8; 20];
    pool.copy_from_slice(&hx(j["swapLog"]["address"].as_str().unwrap()));
    let mut topic0 = [0u8; 32];
    topic0.copy_from_slice(&hx(j["swapLog"]["topic0"].as_str().unwrap()));
    ProvenanceInput {
        block_hash,
        header_rlp: hx(j["headerRlp"].as_str().unwrap()),
        proof: j["proof"].as_array().unwrap().iter().map(|n| hx(n.as_str().unwrap())).collect(),
        key: hx(j["key"].as_str().unwrap()),
        pool,
        topic0,
    }
}

fn main() {
    sp1_sdk::utils::setup_logger();
    dotenv::dotenv().ok();
    let args = Args::parse();

    let input = load_input(&args.input);
    let host = verify_provenance(&input).expect("host provenance failed — bad fixture");
    println!(
        "host: swap log proven in block (txIndex {}), pool 0x{}",
        host.txIndex,
        hex::encode(input.pool)
    );

    let client = ProverClient::from_env();
    let mut stdin = SP1Stdin::new();
    stdin.write(&input);

    if args.execute {
        let (output, report) = client.execute(PROV_ELF, stdin).run().unwrap();
        let decoded = ProvenanceOutput::abi_decode(output.as_slice()).unwrap();
        assert_eq!(decoded.included, true);
        assert_eq!(decoded.txIndex, host.txIndex);
        assert_eq!(output.as_slice(), host.abi_encode().as_slice(), "in-circuit == host");
        println!("In-circuit provenance verification matches host. \u{2713}");
        println!("  included: {} | txIndex: {} | pool: {}", decoded.included, decoded.txIndex, decoded.pool);
        println!("Number of cycles: {}", report.total_instruction_count());
        println!("publicValues: 0x{}", hex::encode(output.as_slice()));
    } else {
        let pk = client.setup(PROV_ELF).expect("setup");
        let proof = client.prove(&pk, stdin).groth16().run().expect("prove");
        write_fixture(&proof, pk.verifying_key());
    }
}

#[derive(serde::Serialize)]
struct ProvFixture {
    block_hash: String,
    tx_index: u32,
    vkey: String,
    public_values: String,
    proof: String,
}

fn write_fixture(proof: &SP1ProofWithPublicValues, vk: &SP1VerifyingKey) {
    let bytes = proof.public_values.as_slice();
    let out = ProvenanceOutput::abi_decode(bytes).unwrap();
    let fixture = ProvFixture {
        block_hash: format!("0x{}", hex::encode(out.blockHash)),
        tx_index: out.txIndex,
        vkey: vk.bytes32().to_string(),
        public_values: format!("0x{}", hex::encode(bytes)),
        proof: format!("0x{}", hex::encode(proof.bytes())),
    };
    println!("Verification Key: {}", fixture.vkey);
    println!("Proven swap in block {} (txIndex {})", fixture.block_hash, fixture.tx_index);
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../contracts/src/fixtures");
    std::fs::create_dir_all(&path).unwrap();
    std::fs::write(path.join("groth16-prov-fixture.json"), serde_json::to_string_pretty(&fixture).unwrap()).unwrap();
    println!("wrote contracts/src/fixtures/groth16-prov-fixture.json");
}
