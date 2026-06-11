//! Bukti host (batch): execute the in-circuit reconstruction for N wallets (fast, no
//! proof) or generate a core proof and verify it.
//!
//! ```shell
//! RUST_LOG=info cargo run --release -- --execute                       # built-in sample
//! RUST_LOG=info cargo run --release -- --execute --input batch.json    # real batch witness
//! ```

use alloy_sol_types::SolValue;
use bukti_lib::{compute_metrics_from_swaps, BatchEntry, BuktiBatchInput, BuktiOutput, Swap};
use clap::Parser;
use sp1_sdk::{
    blocking::{ProveRequest, Prover, ProverClient},
    include_elf, Elf, ProvingKey, SP1Stdin,
};
use std::path::PathBuf;

/// The ELF for the Bukti zkVM program.
const BUKTI_ELF: Elf = include_elf!("bukti-program");

#[derive(Parser, Debug)]
#[command(author, version, about, long_about = None)]
struct Args {
    #[arg(long)]
    execute: bool,

    #[arg(long)]
    prove: bool,

    /// Optional JSON file with the BATCH witness ({ entries: [{wallet, anchor_block_hash, swaps}] }).
    /// When omitted, a built-in 2-wallet sample batch is used.
    #[arg(long)]
    input: Option<PathBuf>,
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

    let args = Args::parse();
    if args.execute == args.prove {
        eprintln!("Error: specify exactly one of --execute or --prove");
        std::process::exit(1);
    }

    let input: BuktiBatchInput = match &args.input {
        Some(path) => {
            let raw = std::fs::read_to_string(path).expect("failed to read input file");
            serde_json::from_str(&raw).expect("failed to parse input JSON")
        }
        None => sample_input(),
    };

    let client = ProverClient::from_env();

    let mut stdin = SP1Stdin::new();
    stdin.write(&input);

    println!("Batch size: {} wallet(s)", input.entries.len());

    if args.execute {
        let (output, report) = client.execute(BUKTI_ELF, stdin).run().unwrap();
        println!("Program executed successfully.");

        let decoded: Vec<BuktiOutput> = Vec::<BuktiOutput>::abi_decode(output.as_slice()).unwrap();
        println!("--- Bukti batch attestation ({} wallets) ---", decoded.len());
        for o in &decoded {
            println!(
                "{} | trades {:>3} | score {:>8.3} | dd {:>7.2}% | roi {:>7.2}% | vol ${:>12.2}",
                o.wallet,
                o.numTrades,
                o.sharpeMilli as f64 / 1_000.0,
                o.maxDrawdownBps as f64 / 100.0,
                o.roiBps as f64 / 100.0,
                o.volumeUsdE6 as f64 / 1_000_000.0
            );
        }

        // Cross-check every wallet against a plain host computation.
        for (o, e) in decoded.iter().zip(input.entries.iter()) {
            let host = compute_metrics_from_swaps(&e.swaps);
            assert_eq!(o.numTrades, host.num_trades);
            assert_eq!(o.sharpeMilli, host.sharpe_milli);
            assert_eq!(o.maxDrawdownBps, host.max_drawdown_bps);
            assert_eq!(o.roiBps, host.roi_bps);
            assert_eq!(o.volumeUsdE6, host.volume_usd_e6);
        }
        println!("In-circuit batch reconstruction matches host computation. \u{2713}");
        println!("Number of cycles: {}", report.total_instruction_count());
        println!("publicValues: 0x{}", hex::encode(output.as_slice()));
    } else {
        let pk = client.setup(BUKTI_ELF).expect("failed to setup elf");
        let proof = client.prove(&pk, stdin).run().expect("failed to generate proof");
        println!("Successfully generated proof!");
        client
            .verify(&proof, pk.verifying_key(), None)
            .expect("failed to verify proof!");
        println!("Successfully verified proof!");
    }
}
