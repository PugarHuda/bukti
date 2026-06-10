//! Generate an EVM-compatible (Groth16 / PLONK) Bukti proof and write a Solidity
//! test fixture. The Groth16 wrap is heavy; on an 8 GB machine generate it via the
//! Succinct Prover Network (set `SP1_PROVER=network` + `NETWORK_PRIVATE_KEY` in .env)
//! rather than locally.
//!
//! ```shell
//! RUST_LOG=info cargo run --release --bin evm -- --system groth16
//! ```

use alloy_sol_types::SolType;
use clap::{Parser, ValueEnum};
use bukti_lib::{BuktiInput, BuktiOutput, Swap};
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
    /// Optional JSON witness file; uses a built-in sample when omitted.
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

/// Solidity test fixture for verifying Bukti proofs on-chain.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SP1BuktiFixture {
    wallet: String,
    sharpe_milli: i64,
    max_drawdown_bps: u32,
    roi_bps: i64,
    volume_usd_e6: u64,
    vkey: String,
    public_values: String,
    proof: String,
}

fn sample_input() -> BuktiInput {
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
    BuktiInput {
        wallet: [0x11u8; 20],
        anchor_block_hash: [0u8; 32],
        swaps: vec![
            buy(1_717_200_000, 10_000_000, 100_000_000),
            sell(1_717_286_400, 5_000_000, 120_000_000),
            buy(1_717_372_800, 10_000_000, 110_000_000),
            sell(1_717_459_200, 7_000_000, 95_000_000),
            sell(1_717_545_600, 8_000_000, 130_000_000),
        ],
    }
}

fn main() {
    sp1_sdk::utils::setup_logger();
    dotenv::dotenv().ok();

    let args = EVMArgs::parse();

    let input: BuktiInput = match &args.input {
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

    println!("Proof System: {:?}", args.system);

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
    let o = BuktiOutput::abi_decode(bytes).unwrap();

    let fixture = SP1BuktiFixture {
        wallet: o.wallet.to_string(),
        sharpe_milli: o.sharpeMilli,
        max_drawdown_bps: o.maxDrawdownBps,
        roi_bps: o.roiBps,
        volume_usd_e6: o.volumeUsdE6,
        vkey: vk.bytes32().to_string(),
        public_values: format!("0x{}", hex::encode(bytes)),
        proof: format!("0x{}", hex::encode(proof.bytes())),
    };

    println!("Verification Key: {}", fixture.vkey);
    println!("Public Values: {}", fixture.public_values);
    println!("Proof Bytes: {}", fixture.proof);

    let fixture_path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../contracts/src/fixtures");
    std::fs::create_dir_all(&fixture_path).expect("failed to create fixture path");
    std::fs::write(
        fixture_path.join(format!("{:?}-fixture.json", system).to_lowercase()),
        serde_json::to_string_pretty(&fixture).unwrap(),
    )
    .expect("failed to write fixture");
}
