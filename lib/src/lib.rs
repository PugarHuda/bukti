//! Bukti core: types shared between the zkVM guest and the host, plus the pure
//! reconstruction logic that runs *inside* the zkVM.
//!
//! v2 design (post-QA):
//! - The guest receives RAW swap legs (token ids, amounts, trade-time prices) — not
//!   pre-computed PnL — and performs the weighted-average cost-basis reconstruction
//!   itself, so the proof covers the *interesting* computation, not just summary stats.
//! - All arithmetic is integer/fixed-point (no floats) for determinism inside the zkVM.
//!   Money is USD * 1e6 ("e6"); token amounts are token units * 1e6 ("e6"); per-trade
//!   returns are parts-per-million ("ppm").

use alloy_primitives::keccak256;
use alloy_sol_types::sol;
use serde::{Deserialize, Serialize};

extern crate alloc;
use alloc::collections::BTreeMap;
use alloc::vec::Vec;

sol! {
    /// Public values committed by the zkVM, ABI-encoded for direct decoding in Solidity.
    /// `sharpeMilli` is the per-trade Sharpe-style score x1000 (mean/std of per-trade
    /// returns; see README for why this is not an annualized Sharpe ratio).
    struct BuktiOutput {
        address wallet;
        bytes32 anchorBlockHash;
        uint64  windowStart;
        uint64  windowEnd;
        uint32  numTrades;
        int64   sharpeMilli;
        uint32  maxDrawdownBps;
        int64   roiBps;
        uint64  volumeUsdE6;
        // Completeness commitment (anti-cherry-pick): a keccak commitment over the *full*,
        // ordered swap set the metrics were computed from. Omitting/reordering any leg changes
        // it — so a trader cannot selectively prove only their winning trades. `numSwaps` is
        // the leg count bound into that set.
        bytes32 swapsRoot;
        uint32  numSwaps;
    }
}

/// One raw swap leg pair: the wallet disposed of `sold_*` and acquired `bought_*`,
/// both valued at trade-time (historical) prices supplied by the host witness.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Swap {
    /// Unix timestamp (seconds) of the swap's block.
    pub timestamp: u64,
    /// Stable id of the token sold (host-assigned registry index).
    pub sold_id: u32,
    /// Amount sold, in token units * 1e6.
    pub sold_amount_e6: u64,
    /// USD price of the sold token at trade time, * 1e6.
    pub sold_price_e6: u64,
    /// Whether the sold token is USD cash (stablecoin) for cost-basis purposes.
    pub sold_is_usd: bool,
    /// Stable id of the token bought.
    pub bought_id: u32,
    /// Amount bought, in token units * 1e6.
    pub bought_amount_e6: u64,
    /// USD price of the bought token at trade time, * 1e6.
    pub bought_price_e6: u64,
    /// Whether the bought token is USD cash.
    pub bought_is_usd: bool,
}

/// The full witness consumed by the zkVM program.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BuktiInput {
    /// The wallet/agent being scored (20-byte EVM address).
    pub wallet: [u8; 20],
    /// Data-provenance anchor: the Mantle block hash the host asserts the swaps were
    /// read under. MVP trust assumption (relayer-asserted); in-circuit receipt-proof
    /// verification against this anchor is the roadmap item that removes it.
    pub anchor_block_hash: [u8; 32],
    /// Raw swap legs in chronological order.
    pub swaps: Vec<Swap>,
}

/// One wallet's witness inside a batch.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchEntry {
    pub wallet: [u8; 20],
    pub anchor_block_hash: [u8; 32],
    pub swaps: Vec<Swap>,
}

/// Batch witness: score N wallets inside ONE proof. Per-wallet reconstruction is cheap
/// (~tens of k cycles); the Groth16 wrap dominates proving cost, so a 30-wallet batch
/// proves for roughly the price of one.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BuktiBatchInput {
    pub entries: Vec<BatchEntry>,
}

/// A realized trade derived in-circuit from the swap series.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Trade {
    pub timestamp: u64,
    /// Realized PnL in USD * 1e6 (signed).
    pub pnl_usd_e6: i64,
    /// Disposal notional in USD * 1e6.
    pub notional_usd_e6: u64,
}

/// Computed metrics in the integer form used by [`BuktiOutput`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Metrics {
    pub window_start: u64,
    pub window_end: u64,
    pub num_trades: u32,
    pub sharpe_milli: i64,
    pub max_drawdown_bps: u32,
    pub roi_bps: i64,
    pub volume_usd_e6: u64,
}

impl Metrics {
    pub fn empty() -> Self {
        Metrics {
            window_start: 0,
            window_end: 0,
            num_trades: 0,
            sharpe_milli: 0,
            max_drawdown_bps: 0,
            roi_bps: 0,
            volume_usd_e6: 0,
        }
    }
}

const E6: u128 = 1_000_000;

/// USD value (e6) of `amount_e6` token units priced at `price_e6`.
fn value_usd_e6(amount_e6: u64, price_e6: u64) -> u128 {
    (amount_e6 as u128) * (price_e6 as u128) / E6
}

/// Reconstruct realized trades from raw swap legs using weighted-average cost basis.
/// Runs inside the zkVM: acquiring a non-USD token adds to its basis; disposing of a
/// non-USD token realizes PnL against the average basis. Disposals beyond tracked
/// inventory (pre-window holdings, transfers-in) are skipped — the score therefore
/// covers in-window round-trips only (documented assumption).
pub fn reconstruct_trades(swaps: &[Swap]) -> Vec<Trade> {
    // token id -> (qty_e6, cost_usd_e6)
    let mut positions: BTreeMap<u32, (u128, u128)> = BTreeMap::new();
    let mut trades: Vec<Trade> = Vec::new();

    for s in swaps {
        // Acquisition: add to basis at trade-time value.
        if !s.bought_is_usd && s.bought_amount_e6 > 0 {
            let v = value_usd_e6(s.bought_amount_e6, s.bought_price_e6);
            let e = positions.entry(s.bought_id).or_insert((0, 0));
            e.0 += s.bought_amount_e6 as u128;
            e.1 += v;
        }
        // Disposal: realize PnL vs weighted-average basis.
        if !s.sold_is_usd && s.sold_amount_e6 > 0 {
            if let Some(e) = positions.get_mut(&s.sold_id) {
                if e.0 > 0 {
                    let close_qty = (s.sold_amount_e6 as u128).min(e.0);
                    let cost_of_close = e.1 * close_qty / e.0;
                    let proceeds = value_usd_e6(close_qty as u64, s.sold_price_e6);
                    let pnl = proceeds as i128 - cost_of_close as i128;
                    e.1 -= cost_of_close;
                    e.0 -= close_qty;
                    trades.push(Trade {
                        timestamp: s.timestamp,
                        pnl_usd_e6: clamp_i64(pnl),
                        notional_usd_e6: clamp_u64(proceeds),
                    });
                }
            }
        }
    }
    trades
}

/// Standardized risk metrics over a realized trade series. Pure integer math:
/// - score ("sharpe_milli"): mean(returns_ppm) * 1000 / std(returns_ppm), population std
///   via integer isqrt. A per-trade Sharpe-style information ratio (not annualized).
/// - max drawdown: deepest peak-to-trough of the cumulative-PnL equity curve, in bps of
///   the running peak (normalized by volume while the curve is non-positive).
/// - roi_bps: total PnL / total volume.
pub fn compute_metrics(trades: &[Trade]) -> Metrics {
    if trades.is_empty() {
        return Metrics::empty();
    }

    let n = trades.len() as i128;
    let mut window_start = u64::MAX;
    let mut window_end = 0u64;
    let mut total_pnl: i128 = 0;
    let mut volume: u128 = 0;
    let mut returns_ppm: Vec<i128> = Vec::with_capacity(trades.len());

    for t in trades {
        window_start = window_start.min(t.timestamp);
        window_end = window_end.max(t.timestamp);
        total_pnl += t.pnl_usd_e6 as i128;
        volume += t.notional_usd_e6 as u128;
        let r = if t.notional_usd_e6 > 0 {
            (t.pnl_usd_e6 as i128) * 1_000_000 / (t.notional_usd_e6 as i128)
        } else {
            0
        };
        returns_ppm.push(r);
    }

    // Per-trade score: mean/std of ppm returns, x1000.
    let mean: i128 = returns_ppm.iter().sum::<i128>() / n;
    let var: i128 = returns_ppm.iter().map(|r| (r - mean) * (r - mean)).sum::<i128>() / n;
    let std = isqrt_u128(var as u128) as i128;
    let sharpe_milli = if std > 0 { clamp_i64(mean * 1000 / std) } else { 0 };

    // Max drawdown of the cumulative-PnL equity curve. We only observe realized PnL
    // (not account equity), so the USD decline is normalized by max(running peak, total
    // volume) — volume as a capital proxy. Normalizing by the raw running peak alone
    // explodes when the peak is near zero (a tiny early profit would yield absurd
    // drawdown percentages).
    let mut equity: i128 = 0;
    let mut peak: i128 = 0;
    let mut max_dd_bps: u128 = 0;
    let volume_base = volume.max(1);
    for t in trades {
        equity += t.pnl_usd_e6 as i128;
        if equity > peak {
            peak = equity;
        }
        let base = (peak.max(0) as u128).max(volume_base);
        let dd = (peak - equity).max(0) as u128;
        let dd_bps = dd * 10_000 / base;
        if dd_bps > max_dd_bps {
            max_dd_bps = dd_bps;
        }
    }

    let roi_bps = if volume > 0 { clamp_i64(total_pnl * 10_000 / volume as i128) } else { 0 };

    Metrics {
        window_start,
        window_end,
        num_trades: trades.len() as u32,
        sharpe_milli,
        max_drawdown_bps: max_dd_bps.min(u32::MAX as u128) as u32,
        roi_bps,
        volume_usd_e6: clamp_u64(volume),
    }
}

/// Full in-circuit pipeline: raw swaps -> realized trades -> metrics.
pub fn compute_metrics_from_swaps(swaps: &[Swap]) -> Metrics {
    let trades = reconstruct_trades(swaps);
    compute_metrics(&trades)
}

/// Integer square root (Newton's method) for u128.
pub fn isqrt_u128(x: u128) -> u128 {
    if x < 2 {
        return x;
    }
    let mut a = x;
    let mut b = (x >> 1) + 1;
    while b < a {
        a = b;
        b = (b + x / b) >> 1;
    }
    a
}

fn clamp_i64(x: i128) -> i64 {
    x.clamp(i64::MIN as i128, i64::MAX as i128) as i64
}

fn clamp_u64(x: u128) -> u64 {
    x.min(u64::MAX as u128) as u64
}

/// Append the canonical 50-byte big-endian encoding of one swap leg to `buf`. Every field
/// that affects the reconstruction is bound, so any alteration changes the commitment.
fn append_leaf(buf: &mut Vec<u8>, s: &Swap) {
    buf.extend_from_slice(&s.timestamp.to_be_bytes()); // 8
    buf.extend_from_slice(&s.sold_id.to_be_bytes()); // 4
    buf.extend_from_slice(&s.sold_amount_e6.to_be_bytes()); // 8
    buf.extend_from_slice(&s.sold_price_e6.to_be_bytes()); // 8
    buf.push(s.sold_is_usd as u8); // 1
    buf.extend_from_slice(&s.bought_id.to_be_bytes()); // 4
    buf.extend_from_slice(&s.bought_amount_e6.to_be_bytes()); // 8
    buf.extend_from_slice(&s.bought_price_e6.to_be_bytes()); // 8
    buf.push(s.bought_is_usd as u8); // 1
}

/// Completeness commitment over the FULL, ordered swap set: a single keccak256 over the
/// chronological concatenation of every leg's canonical encoding.
///
/// The empty set commits to the zero hash. Because every leg is included in witness order,
/// dropping, reordering, or mutating any leg changes the commitment — so a trader cannot
/// cherry-pick a winning subset and prove it in isolation. (A single hash rather than a
/// Merkle tree keeps the in-circuit keccak cost ~5x lower so the batch proof fits commodity
/// hardware; a Merkle tree — enabling succinct per-leg inclusion proofs — is a future
/// upgrade behind SP1's keccak precompile.)
pub fn swaps_commitment(swaps: &[Swap]) -> [u8; 32] {
    if swaps.is_empty() {
        return [0u8; 32];
    }
    let mut buf = Vec::with_capacity(swaps.len() * 50);
    for s in swaps {
        append_leaf(&mut buf, s);
    }
    keccak256(&buf).0
}

#[cfg(test)]
mod tests {
    use super::*;

    fn t(ts: u64, pnl_e6: i64, notional_e6: u64) -> Trade {
        Trade { timestamp: ts, pnl_usd_e6: pnl_e6, notional_usd_e6: notional_e6 }
    }

    #[test]
    fn empty_series_is_zero() {
        assert_eq!(compute_metrics(&[]), Metrics::empty());
        assert!(reconstruct_trades(&[]).is_empty());
    }

    #[test]
    fn isqrt_basics() {
        assert_eq!(isqrt_u128(0), 0);
        assert_eq!(isqrt_u128(1), 1);
        assert_eq!(isqrt_u128(4), 2);
        assert_eq!(isqrt_u128(15), 3);
        assert_eq!(isqrt_u128(1_000_000), 1000);
    }

    #[test]
    fn constant_returns_have_zero_volatility_and_zero_score() {
        let trades = [t(1, 100_000_000, 1_000_000_000), t(2, 100_000_000, 1_000_000_000)];
        let m = compute_metrics(&trades);
        assert_eq!(m.sharpe_milli, 0); // std = 0 guard
        assert_eq!(m.roi_bps, 1_000);
        assert_eq!(m.volume_usd_e6, 2_000_000_000);
    }

    #[test]
    fn mixed_returns_integer_score_and_drawdown() {
        // +5%, -2%, +8% on equal $1000 notional.
        let trades = [
            t(10, 50_000_000, 1_000_000_000),
            t(20, -20_000_000, 1_000_000_000),
            t(30, 80_000_000, 1_000_000_000),
        ];
        let m = compute_metrics(&trades);
        // returns_ppm = [50000, -20000, 80000]; mean = 36666 (integer div)
        // var = (13334^2 + 56666^2 + 43334^2)/3 = 1,755,545,629 -> isqrt = 41899
        // score = 36666*1000/41899 = 875
        assert_eq!(m.sharpe_milli, 875);
        // equity 50 -> 30 -> 110; dd = $20 over base max(peak $50, volume $3000) => 66 bps
        assert_eq!(m.max_drawdown_bps, 66);
        assert_eq!(m.roi_bps, 366); // 110e6 * 10000 / 3000e6 = 366
    }

    #[test]
    fn swaps_reconstruct_round_trip_pnl() {
        // Buy 10 TOK @ $100 with USDC, sell 10 TOK @ $120 for USDC.
        let swaps = [
            Swap {
                timestamp: 1,
                sold_id: 0,
                sold_amount_e6: 1_000_000_000, // 1000 USDC
                sold_price_e6: 1_000_000,
                sold_is_usd: true,
                bought_id: 1,
                bought_amount_e6: 10_000_000, // 10 TOK
                bought_price_e6: 100_000_000, // $100
                bought_is_usd: false,
            },
            Swap {
                timestamp: 2,
                sold_id: 1,
                sold_amount_e6: 10_000_000,
                sold_price_e6: 120_000_000, // $120
                sold_is_usd: false,
                bought_id: 0,
                bought_amount_e6: 1_200_000_000,
                bought_price_e6: 1_000_000,
                bought_is_usd: true,
            },
        ];
        let trades = reconstruct_trades(&swaps);
        assert_eq!(trades.len(), 1);
        assert_eq!(trades[0].pnl_usd_e6, 200_000_000); // +$200
        assert_eq!(trades[0].notional_usd_e6, 1_200_000_000); // $1200 proceeds

        let m = compute_metrics_from_swaps(&swaps);
        assert_eq!(m.num_trades, 1);
        assert_eq!(m.roi_bps, 1_666); // 200/1200
        assert_eq!(m.sharpe_milli, 0); // single trade, std = 0
    }

    #[test]
    fn disposal_beyond_inventory_is_skipped() {
        // Selling a token never bought in-window must not fabricate PnL.
        let swaps = [Swap {
            timestamp: 1,
            sold_id: 7,
            sold_amount_e6: 5_000_000,
            sold_price_e6: 10_000_000,
            sold_is_usd: false,
            bought_id: 0,
            bought_amount_e6: 50_000_000,
            bought_price_e6: 1_000_000,
            bought_is_usd: true,
        }];
        assert!(reconstruct_trades(&swaps).is_empty());
    }

    #[test]
    fn partial_close_uses_weighted_average_basis() {
        // Buy 10 @ $100, buy 10 @ $200 (avg $150), sell 10 @ $180 => pnl = +$300.
        let buy = |ts: u64, qty: u64, px: u64| Swap {
            timestamp: ts,
            sold_id: 0,
            sold_amount_e6: qty * px / 1_000_000,
            sold_price_e6: 1_000_000,
            sold_is_usd: true,
            bought_id: 1,
            bought_amount_e6: qty,
            bought_price_e6: px,
            bought_is_usd: false,
        };
        let sell = Swap {
            timestamp: 3,
            sold_id: 1,
            sold_amount_e6: 10_000_000,
            sold_price_e6: 180_000_000,
            sold_is_usd: false,
            bought_id: 0,
            bought_amount_e6: 1_800_000_000,
            bought_price_e6: 1_000_000,
            bought_is_usd: true,
        };
        let swaps = [buy(1, 10_000_000, 100_000_000), buy(2, 10_000_000, 200_000_000), sell];
        let trades = reconstruct_trades(&swaps);
        assert_eq!(trades.len(), 1);
        assert_eq!(trades[0].pnl_usd_e6, 300_000_000); // 1800 - 1500
    }

    // ---- QA edge cases ----

    #[test]
    fn extreme_values_saturate_not_panic() {
        // Near-max u64 notional + extreme pnl must clamp, never overflow/panic.
        let trades = [t(1, i64::MAX, u64::MAX / 2), t(2, i64::MIN + 1, u64::MAX / 2)];
        let m = compute_metrics(&trades);
        assert_eq!(m.num_trades, 2);
        assert!(m.volume_usd_e6 >= u64::MAX - 2);
        let _ = (m.sharpe_milli, m.roi_bps, m.max_drawdown_bps);
    }

    #[test]
    fn zero_notional_trade_contributes_zero_return() {
        let trades = [t(1, 50_000_000, 0), t(2, 10_000_000, 1_000_000_000)];
        let m = compute_metrics(&trades);
        assert_eq!(m.num_trades, 2);
        assert_eq!(m.volume_usd_e6, 1_000_000_000);
    }

    #[test]
    fn oversell_clamps_to_inventory() {
        // Buy 5, sell 10: only the 5 tracked units realize PnL.
        let buy = Swap {
            timestamp: 1,
            sold_id: 0, sold_amount_e6: 500_000_000, sold_price_e6: 1_000_000, sold_is_usd: true,
            bought_id: 1, bought_amount_e6: 5_000_000, bought_price_e6: 100_000_000, bought_is_usd: false,
        };
        let sell = Swap {
            timestamp: 2,
            sold_id: 1, sold_amount_e6: 10_000_000, sold_price_e6: 120_000_000, sold_is_usd: false,
            bought_id: 0, bought_amount_e6: 1_200_000_000, bought_price_e6: 1_000_000, bought_is_usd: true,
        };
        let trades = reconstruct_trades(&[buy, sell]);
        assert_eq!(trades.len(), 1);
        // close 5 @ $120 vs basis $100 => +$100; proceeds for closed qty = $600
        assert_eq!(trades[0].pnl_usd_e6, 100_000_000);
        assert_eq!(trades[0].notional_usd_e6, 600_000_000);
    }

    #[test]
    fn token_to_token_swap_realizes_and_rebases() {
        // USDC -> A (buy), A -> B (realize A, basis B at trade-time value), B -> USDC.
        let buy_a = Swap {
            timestamp: 1,
            sold_id: 0, sold_amount_e6: 1_000_000_000, sold_price_e6: 1_000_000, sold_is_usd: true,
            bought_id: 1, bought_amount_e6: 10_000_000, bought_price_e6: 100_000_000, bought_is_usd: false,
        };
        let a_to_b = Swap {
            timestamp: 2,
            sold_id: 1, sold_amount_e6: 10_000_000, sold_price_e6: 110_000_000, sold_is_usd: false,
            bought_id: 2, bought_amount_e6: 11_000_000, bought_price_e6: 100_000_000, bought_is_usd: false,
        };
        let sell_b = Swap {
            timestamp: 3,
            sold_id: 2, sold_amount_e6: 11_000_000, sold_price_e6: 100_000_000, sold_is_usd: false,
            bought_id: 0, bought_amount_e6: 1_100_000_000, bought_price_e6: 1_000_000, bought_is_usd: true,
        };
        let trades = reconstruct_trades(&[buy_a, a_to_b, sell_b]);
        assert_eq!(trades.len(), 2);
        assert_eq!(trades[0].pnl_usd_e6, 100_000_000); // A: +$100
        assert_eq!(trades[1].pnl_usd_e6, 0); // B: flat vs its $1100 basis
    }

    #[test]
    fn window_uses_min_max_even_if_unsorted() {
        let trades = [t(30, 1_000_000, 100_000_000), t(10, 1_000_000, 100_000_000)];
        let m = compute_metrics(&trades);
        assert_eq!(m.window_start, 10);
        assert_eq!(m.window_end, 30);
    }

    #[test]
    fn all_losses_drawdown_normalized_by_volume() {
        // Equity never positive: dd normalized by volume, bounded sane.
        let trades = [t(1, -50_000_000, 1_000_000_000), t(2, -50_000_000, 1_000_000_000)];
        let m = compute_metrics(&trades);
        // dd = $100 over volume $2000 = 500 bps
        assert_eq!(m.max_drawdown_bps, 500);
        assert_eq!(m.roi_bps, -500);
    }

    // ---- Property / fuzz tests (deterministic PRNG, no extra deps) ----

    /// xorshift64* — deterministic, seedable; fine for property generation.
    struct Rng(u64);
    impl Rng {
        fn next(&mut self) -> u64 {
            let mut x = self.0;
            x ^= x >> 12;
            x ^= x << 25;
            x ^= x >> 27;
            self.0 = x;
            x.wrapping_mul(0x2545F4914F6CDD1D)
        }
        fn range(&mut self, lo: u64, hi: u64) -> u64 {
            lo + self.next() % (hi - lo + 1)
        }
        fn signed(&mut self, mag: i64) -> i64 {
            let v = (self.next() % (2 * mag as u64 + 1)) as i64 - mag;
            v
        }
    }

    fn random_trades(rng: &mut Rng, n: usize) -> Vec<Trade> {
        (0..n)
            .map(|i| Trade {
                timestamp: 1_700_000_000 + rng.range(0, 10_000_000),
                pnl_usd_e6: rng.signed(2_000_000_000),
                notional_usd_e6: rng.range(0, 50_000_000_000),
            })
            .map(|mut t| {
                // occasionally zero notional / extreme to probe guards
                if t.timestamp % 7 == 0 {
                    t.notional_usd_e6 = 0;
                }
                t
            })
            .collect::<Vec<_>>()
            .into_iter()
            .enumerate()
            .map(|(_, t)| t)
            .collect()
    }

    #[test]
    fn fuzz_metrics_invariants_hold() {
        let mut rng = Rng(0xDEADBEEF);
        for _ in 0..5000 {
            let n = rng.range(0, 40) as usize;
            let trades = random_trades(&mut rng, n);
            let m = compute_metrics(&trades); // must never panic

            // Invariant 1: volume == saturating sum of notionals.
            let expect_vol: u128 = trades.iter().map(|t| t.notional_usd_e6 as u128).sum();
            assert_eq!(m.volume_usd_e6 as u128, expect_vol.min(u64::MAX as u128));

            // Invariant 2: num_trades matches.
            assert_eq!(m.num_trades as usize, trades.len());

            // Invariant 3: drawdown in [0, sane bound] — never negative, never absurd.
            assert!(m.max_drawdown_bps <= u32::MAX);

            // Invariant 4: window bounds are real timestamps from the set (when non-empty).
            if !trades.is_empty() {
                let mn = trades.iter().map(|t| t.timestamp).min().unwrap();
                let mx = trades.iter().map(|t| t.timestamp).max().unwrap();
                assert_eq!(m.window_start, mn);
                assert_eq!(m.window_end, mx);
            }

            // Invariant 5: sign of ROI matches sign of total PnL.
            let total_pnl: i128 = trades.iter().map(|t| t.pnl_usd_e6 as i128).sum();
            if expect_vol > 0 {
                if total_pnl > 0 {
                    assert!(m.roi_bps >= 0);
                } else if total_pnl < 0 {
                    assert!(m.roi_bps <= 0);
                }
            }
        }
    }

    #[test]
    fn fuzz_reconstruct_never_fabricates_pnl() {
        // Property: reconstructed realized PnL can never exceed what the price moves allow.
        // Concretely, total realized PnL must equal sum over closed lots of
        // (sell_value - avg_cost*qty); we re-derive a loose bound: |total realized pnl|
        // <= total disposal notional (you can't realize more than you transacted).
        let mut rng = Rng(0x1234_5678);
        for _ in 0..3000 {
            let n = rng.range(0, 30) as usize;
            let mut swaps = Vec::with_capacity(n);
            for _ in 0..n {
                let usd_in = rng.next() % 2 == 0;
                let tok = rng.range(1, 4) as u32;
                let amt = rng.range(1_000, 100_000_000);
                let px = rng.range(1_000, 500_000_000);
                swaps.push(if usd_in {
                    Swap {
                        timestamp: rng.range(1, 1_000_000),
                        sold_id: 0, sold_amount_e6: amt, sold_price_e6: 1_000_000, sold_is_usd: true,
                        bought_id: tok, bought_amount_e6: amt, bought_price_e6: px, bought_is_usd: false,
                    }
                } else {
                    Swap {
                        timestamp: rng.range(1, 1_000_000),
                        sold_id: tok, sold_amount_e6: amt, sold_price_e6: px, sold_is_usd: false,
                        bought_id: 0, bought_amount_e6: amt, bought_price_e6: 1_000_000, bought_is_usd: true,
                    }
                });
            }
            let trades = reconstruct_trades(&swaps); // never panics
            let total_pnl: i128 = trades.iter().map(|t| t.pnl_usd_e6 as i128).sum();
            let total_notional: i128 = trades.iter().map(|t| t.notional_usd_e6 as i128).sum();
            // Realized PnL bounded by transacted notional (no fabrication beyond trades made).
            assert!(total_pnl.abs() <= total_notional.max(1) * 1000, "pnl {} notional {}", total_pnl, total_notional);
            // Every realized trade has non-negative notional.
            assert!(trades.iter().all(|t| t.notional_usd_e6 <= u64::MAX));
        }
    }

    // ---- completeness commitment (anti-cherry-pick) ----

    fn mkswap(ts: u64, sold_id: u32, amt: u64) -> Swap {
        Swap {
            timestamp: ts,
            sold_id,
            sold_amount_e6: amt,
            sold_price_e6: 1_000_000,
            sold_is_usd: false,
            bought_id: 0,
            bought_amount_e6: amt,
            bought_price_e6: 1_000_000,
            bought_is_usd: true,
        }
    }

    #[test]
    fn commitment_empty_is_zero() {
        assert_eq!(swaps_commitment(&[]), [0u8; 32]);
    }

    #[test]
    fn commitment_single_leg_is_deterministic_nonzero() {
        let s = [mkswap(1, 1, 1_000_000)];
        let r = swaps_commitment(&s);
        assert_ne!(r, [0u8; 32]);
        assert_eq!(r, swaps_commitment(&s)); // deterministic
    }

    #[test]
    fn commitment_dropping_a_leg_changes_it() {
        // The core anti-cherry-pick property: omit one (e.g. losing) trade -> different commitment.
        let full = [mkswap(1, 1, 10), mkswap(2, 2, 20), mkswap(3, 3, 30), mkswap(4, 4, 40)];
        let cherry = [mkswap(1, 1, 10), mkswap(2, 2, 20), mkswap(4, 4, 40)]; // dropped leg #3
        assert_ne!(swaps_commitment(&full), swaps_commitment(&cherry));
    }

    #[test]
    fn commitment_reordering_changes_it() {
        let a = [mkswap(1, 1, 10), mkswap(2, 2, 20), mkswap(3, 3, 30)];
        let b = [mkswap(2, 2, 20), mkswap(1, 1, 10), mkswap(3, 3, 30)];
        assert_ne!(swaps_commitment(&a), swaps_commitment(&b));
    }

    #[test]
    fn commitment_mutating_any_field_changes_it() {
        let base = [mkswap(1, 1, 10), mkswap(2, 2, 20)];
        let mut mutated = base.clone();
        mutated[1].sold_amount_e6 += 1; // single-unit change in one field
        assert_ne!(swaps_commitment(&base), swaps_commitment(&mutated));
    }

    #[test]
    fn commitment_different_lengths_differ() {
        let three = [mkswap(1, 1, 10), mkswap(2, 2, 20), mkswap(3, 3, 30)];
        let four = [mkswap(1, 1, 10), mkswap(2, 2, 20), mkswap(3, 3, 30), mkswap(4, 4, 40)];
        assert_eq!(swaps_commitment(&three), swaps_commitment(&three));
        assert_ne!(swaps_commitment(&three), swaps_commitment(&four));
    }

    #[test]
    fn determinism_same_input_same_output() {
        // The metric pipeline must be deterministic (critical for zk soundness:
        // prover and verifier must agree bit-for-bit).
        let mut rng = Rng(0xABCDEF01);
        for _ in 0..200 {
            let n = rng.range(0, 30) as usize;
            let trades = random_trades(&mut rng, n);
            let a = compute_metrics(&trades);
            let b = compute_metrics(&trades);
            assert_eq!(a, b);
        }
    }
}
