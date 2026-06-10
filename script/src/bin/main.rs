//! Bukti host: execute the in-circuit reconstruction (fast, no proof) or generate
//! a core proof and verify it.
//!
//! ```shell
//! RUST_LOG=info cargo run --release -- --execute
//! RUST_LOG=info cargo run --release -- --execute --input swaps.json
//! RUST_LOG=info cargo run --release -- --prove
//! ```

use alloy_sol_types::SolType;
use clap::Parser;
use bukti_lib::{compute_metrics_from_swaps, BuktiInput, BuktiOutput, Swap};
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

    /// Optional JSON file with the witness (wallet, anchor_block_hash, swaps).
    /// When omitted, a built-in sample swap series is used.
    #[arg(long)]
    input: Option<PathBuf>,
}

/// Sample: a TOK/USD round-trip series with varying prices (so PnL and the score are
/// non-trivial). Buys at $100, $110; sells at $120, $95, $130.
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
            buy(1_717_200_000, 10_000_000, 100_000_000),  // buy 10 @ $100
            sell(1_717_286_400, 5_000_000, 120_000_000),  // sell 5 @ $120 -> +$100
            buy(1_717_372_800, 10_000_000, 110_000_000),  // buy 10 @ $110
            sell(1_717_459_200, 7_000_000, 95_000_000),   // sell 7 @ $95  -> loss
            sell(1_717_545_600, 8_000_000, 130_000_000),  // sell 8 @ $130 -> gain
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

    let input: BuktiInput = match &args.input {
        Some(path) => {
            let raw = std::fs::read_to_string(path).expect("failed to read input file");
            serde_json::from_str(&raw).expect("failed to parse input JSON")
        }
        None => sample_input(),
    };

    let client = ProverClient::from_env();

    let mut stdin = SP1Stdin::new();
    stdin.write(&input);

    println!("Scoring wallet 0x{}", hex::encode(input.wallet));
    println!("Swap legs: {}", input.swaps.len());

    if args.execute {
        let (output, report) = client.execute(BUKTI_ELF, stdin).run().unwrap();
        println!("Program executed successfully.");

        let decoded = BuktiOutput::abi_decode(output.as_slice()).unwrap();
        print_metrics(&decoded);

        // Cross-check the in-circuit result against a plain host computation.
        let host = compute_metrics_from_swaps(&input.swaps);
        assert_eq!(decoded.numTrades, host.num_trades);
        assert_eq!(decoded.sharpeMilli, host.sharpe_milli);
        assert_eq!(decoded.maxDrawdownBps, host.max_drawdown_bps);
        assert_eq!(decoded.roiBps, host.roi_bps);
        assert_eq!(decoded.volumeUsdE6, host.volume_usd_e6);
        println!("In-circuit reconstruction matches host computation. \u{2713}");
        println!("Number of cycles: {}", report.total_instruction_count());
        // ABI-encoded public values, ready for submitAttestation(publicValues, proof).
        println!("publicValues: 0x{}", hex::encode(output.as_slice()));
    } else {
        let pk = client.setup(BUKTI_ELF).expect("failed to setup elf");
        let proof = client.prove(&pk, stdin).run().expect("failed to generate proof");
        println!("Successfully generated proof!");
        client
            .verify(&proof, pk.verifying_key(), None)
            .expect("failed to verify proof");
        println!("Successfully verified proof!");
    }
}

fn print_metrics(o: &BuktiOutput) {
    println!("--- Bukti attestation (public values) ---");
    println!("wallet           : {}", o.wallet);
    println!("anchorBlockHash  : {}", o.anchorBlockHash);
    println!("window           : {} -> {}", o.windowStart, o.windowEnd);
    println!("realized trades  : {}", o.numTrades);
    println!("score (x1000)    : {} ({:.3})", o.sharpeMilli, o.sharpeMilli as f64 / 1_000.0);
    println!("maxDrawdown      : {:.2}%", o.maxDrawdownBps as f64 / 100.0);
    println!("ROI              : {:.2}%", o.roiBps as f64 / 100.0);
    println!("volume (USD)     : {:.2}", o.volumeUsdE6 as f64 / 1_000_000.0);
}
