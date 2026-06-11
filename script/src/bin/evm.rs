//! Generate an EVM-compatible (Groth16 / PLONK) Bukti BATCH proof and write a Solidity
//! fixture. One proof attests the whole leaderboard.
//!
//! ```shell
//! RUST_LOG=info cargo run --release --bin evm -- --system groth16 --input batch.json
//! ```

use alloy_sol_types::SolValue;
use bukti_lib::{BatchEntry, BuktiBatchInput, BuktiOutput, Swap};
use clap::{Parser, ValueEnum};
use serde::{Deserialize, Serialize};
use sp1_sdk::{
    blocking::{ProveRequest, Prover, ProverClient},
    include_elf, Elf, HashableKey, ProvingKey, SP1ProofWithPublicValues, SP1Stdin,
    SP1VerifyingKey,
};
use std::path::PathBuf;

const BUKTI_ELF: Elf = include_elf!("bukti-program");

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct EVMArgs {
    /// Optional JSON batch witness file; uses a built-in 2-wallet sample when omitted.
    #[arg(long)]
    input: Option<PathBuf>,
    #[arg(long, value_enum, default_value = "groth16")]
    system: ProofSystem,
}

#[derive(Copy, Clone, PartialEq, Eq, PartialOrd, Ord, ValueEnum, Debug)]
enum ProofSystem {
    Plonk,
    Groth16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SP1BuktiBatchFixture {
    wallets: Vec<String>,
    scores_milli: Vec<i64>,
    vkey: String,
    public_values: String,
    proof: String,
}

fn sample_swaps(scale: u64) -> Vec<Swap> {
    let buy = |ts: u64, qty_e6: u64, px_e6: u64| Swap {
        timestamp: ts,
        sold_id: 0,
        sold_amount_e6: (qty_e6 as u128 * px_e6 as u128 / 1_000_000) as u64,
        sold_price_e6: 1_000_000,
        sold_is_usd: true,
        bought_id: 1,
        bought_amount_e6: qty_e6,
        bought_price_e6: px_e6,
        bought_is_usd: false,
    };
    let sell = |ts: u64, qty_e6: u64, px_e6: u64| Swap {
        timestamp: ts,
        sold_id: 1,
        sold_amount_e6: qty_e6,
        sold_price_e6: px_e6,
        sold_is_usd: false,
        bought_id: 0,
        bought_amount_e6: (qty_e6 as u128 * px_e6 as u128 / 1_000_000) as u64,
        bought_price_e6: 1_000_000,
        bought_is_usd: true,
    };
    vec![
        buy(1_717_200_000, 10_000_000 * scale, 100_000_000),
        sell(1_717_286_400, 5_000_000 * scale, 120_000_000),
        buy(1_717_372_800, 10_000_000 * scale, 110_000_000),
        sell(1_717_459_200, 7_000_000 * scale, 95_000_000),
        sell(1_717_545_600, 8_000_000 * scale, 130_000_000),
    ]
}

fn sample_input() -> BuktiBatchInput {
    BuktiBatchInput {
        entries: vec![
            BatchEntry { wallet: [0x11u8; 20], anchor_block_hash: [0u8; 32], swaps: sample_swaps(1) },
            BatchEntry { wallet: [0x22u8; 20], anchor_block_hash: [0u8; 32], swaps: sample_swaps(3) },
        ],
    }
}

fn main() {
    sp1_sdk::utils::setup_logger();
    dotenv::dotenv().ok();

    let args = EVMArgs::parse();

    let input: BuktiBatchInput = match &args.input {
        Some(path) => serde_json::from_str(
            &std::fs::read_to_string(path).expect("failed to read input file"),
        )
        .expect("failed to parse input JSON"),
        None => sample_input(),
    };

    let client = ProverClient::from_env();
    let pk = client.setup(BUKTI_ELF).expect("failed to setup elf");

    let mut stdin = SP1Stdin::new();
    stdin.write(&input);

    println!("Proof System: {:?} | batch: {} wallets", args.system, input.entries.len());

    let proof = match args.system {
        ProofSystem::Plonk => client.prove(&pk, stdin).plonk().run(),
        ProofSystem::Groth16 => client.prove(&pk, stdin).groth16().run(),
    }
    .expect("failed to generate proof");

    create_proof_fixture(&proof, pk.verifying_key(), args.system);
}

fn create_proof_fixture(
    proof: &SP1ProofWithPublicValues,
    vk: &SP1VerifyingKey,
    system: ProofSystem,
) {
    let bytes = proof.public_values.as_slice();
    let outputs: Vec<BuktiOutput> = Vec::<BuktiOutput>::abi_decode(bytes).unwrap();

    let fixture = SP1BuktiBatchFixture {
        wallets: outputs.iter().map(|o| o.wallet.to_string()).collect(),
        scores_milli: outputs.iter().map(|o| o.sharpeMilli).collect(),
        vkey: vk.bytes32().to_string(),
        public_values: format!("0x{}", hex::encode(bytes)),
        proof: format!("0x{}", hex::encode(proof.bytes())),
    };

    println!("Verification Key: {}", fixture.vkey);
    println!("Wallets in batch: {}", fixture.wallets.len());

    let fixture_path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../contracts/src/fixtures");
    std::fs::create_dir_all(&fixture_path).expect("failed to create fixture path");
    std::fs::write(
        fixture_path.join(format!("{:?}-fixture.json", system).to_lowercase()),
        serde_json::to_string_pretty(&fixture).unwrap(),
    )
    .expect("failed to write fixture");
}
