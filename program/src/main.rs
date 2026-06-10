//! The Bukti zkVM guest.
//!
//! v2: reads RAW swap legs (token ids, amounts, trade-time prices) and performs the
//! weighted-average cost-basis reconstruction *inside the circuit* — realized trades,
//! then Sharpe-style score / max drawdown / ROI / volume — so the proof covers the
//! reconstruction itself, not just summary statistics over pre-cooked numbers.

#![no_main]
sp1_zkvm::entrypoint!(main);

use alloy_sol_types::{private::FixedBytes, SolType};
use bukti_lib::{compute_metrics_from_swaps, BuktiInput, BuktiOutput};

pub fn main() {
    // Read the witness (deserialized via serde from the prover's stdin).
    let input = sp1_zkvm::io::read::<BuktiInput>();

    // Full in-circuit pipeline: raw swaps -> realized trades -> integer metrics.
    let m = compute_metrics_from_swaps(&input.swaps);

    let out = BuktiOutput {
        wallet: input.wallet.into(),
        anchorBlockHash: FixedBytes::<32>::from(input.anchor_block_hash),
        windowStart: m.window_start,
        windowEnd: m.window_end,
        numTrades: m.num_trades,
        sharpeMilli: m.sharpe_milli,
        maxDrawdownBps: m.max_drawdown_bps,
        roiBps: m.roi_bps,
        volumeUsdE6: m.volume_usd_e6,
    };

    let bytes = BuktiOutput::abi_encode(&out);
    sp1_zkvm::io::commit_slice(&bytes);
}
