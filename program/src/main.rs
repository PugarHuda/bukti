//! The Bukti zkVM guest (batch).
//!
//! Reads a `BuktiBatchInput` (N wallets, each with raw swap legs at trade-time prices),
//! performs the weighted-average cost-basis reconstruction and risk metrics for EVERY
//! wallet inside the circuit, and commits the results as an ABI-encoded `BuktiOutput[]`.
//! One Groth16 proof therefore attests a whole leaderboard.

#![no_main]
sp1_zkvm::entrypoint!(main);

use alloy_sol_types::{private::FixedBytes, SolValue};
use bukti_lib::{compute_metrics_from_swaps, swaps_commitment, BuktiBatchInput, BuktiOutput};

pub fn main() {
    let input = sp1_zkvm::io::read::<BuktiBatchInput>();

    let mut outputs: Vec<BuktiOutput> = Vec::with_capacity(input.entries.len());
    for e in &input.entries {
        let m = compute_metrics_from_swaps(&e.swaps);
        // Completeness commitment: bind the proof to the FULL, ordered swap set in-circuit.
        let root = swaps_commitment(&e.swaps);
        outputs.push(BuktiOutput {
            wallet: e.wallet.into(),
            anchorBlockHash: FixedBytes::<32>::from(e.anchor_block_hash),
            windowStart: m.window_start,
            windowEnd: m.window_end,
            numTrades: m.num_trades,
            sharpeMilli: m.sharpe_milli,
            maxDrawdownBps: m.max_drawdown_bps,
            roiBps: m.roi_bps,
            volumeUsdE6: m.volume_usd_e6,
            swapsRoot: FixedBytes::<32>::from(root),
            numSwaps: e.swaps.len() as u32,
        });
    }

    // abi.encode(BuktiOutput[]) — decoded on-chain via abi.decode(pv, (BuktiOutput[])).
    let bytes = outputs.abi_encode();
    sp1_zkvm::io::commit_slice(&bytes);
}
