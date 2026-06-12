// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Minimal view surface of BuktiAttestation this allocator depends on.
interface IBuktiAttestationScore {
    function getSharpeMilli(address wallet) external view returns (int64 sharpeMilli, bool exists);
}

/// @title BuktiAllocator — capital routed by ZK-proven skill, not by claims
/// @notice An index/allocator vault that splits a deposit across candidate agents weighted by
///         their *zk-proven* risk-adjusted score (read from BuktiAttestation). Agents below the
///         gate — or with a net-losing (negative) proven score — receive ZERO. This is the
///         on-chain analog of an institutional index (cf. Mantle's MI4), but constituent
///         eligibility and weight are a Groth16 proof of skill, not a committee or a pitch deck.
///
/// @dev Pull-payment design: `allocate` only *credits* recipients; they `withdraw` themselves,
///      so no untrusted external call happens during allocation (reentrancy-safe). The score is
///      only writable in BuktiAttestation after a real on-chain proof, so capital here physically
///      cannot flow to an unproven or cherry-picked track record.
contract BuktiAllocator {
    IBuktiAttestationScore public immutable attestation;

    /// @notice Minimum proven score (Sharpe*1000) required to receive any allocation.
    int64 public immutable minSharpeMilli;

    /// @notice Withdrawable balance credited to each recipient.
    mapping(address => uint256) public credited;

    /// @notice Total ever allocated through this contract (telemetry).
    uint256 public totalAllocated;

    event Allocated(address indexed from, uint256 amount, uint256 eligible, uint256 candidates);
    event Credited(address indexed recipient, uint256 amount, int64 sharpeMilli);
    event Withdrawn(address indexed recipient, uint256 amount);

    error NoCandidates();
    error NoEligibleCandidates();
    error NothingToWithdraw();
    error TransferFailed();

    constructor(address _attestation, int64 _minSharpeMilli) {
        attestation = IBuktiAttestationScore(_attestation);
        minSharpeMilli = _minSharpeMilli;
    }

    /// @notice The per-candidate weight: the proven score if it clears the gate, else 0.
    ///         Negative/net-losing scores are below any non-negative gate, so they weight 0.
    function _weight(address c) internal view returns (uint256) {
        (int64 s, bool exists) = attestation.getSharpeMilli(c);
        if (!exists || s < minSharpeMilli || s <= 0) return 0;
        return uint256(uint64(s));
    }

    /// @notice Preview how `amount` would split across `candidates` — pure on-chain math, no
    ///         state change. Lets a frontend show the routing before any funds move.
    /// @return weights   each candidate's proven-score weight (0 if ineligible)
    /// @return amounts   the wei each candidate would receive
    /// @return eligible  number of candidates that clear the gate
    function previewAllocation(address[] calldata candidates, uint256 amount)
        external
        view
        returns (uint256[] memory weights, uint256[] memory amounts, uint256 eligible)
    {
        uint256 n = candidates.length;
        weights = new uint256[](n);
        amounts = new uint256[](n);
        uint256 totalWeight;
        for (uint256 i = 0; i < n; i++) {
            uint256 w = _weight(candidates[i]);
            weights[i] = w;
            if (w > 0) {
                totalWeight += w;
                eligible++;
            }
        }
        if (totalWeight == 0) return (weights, amounts, 0);
        for (uint256 i = 0; i < n; i++) {
            amounts[i] = (amount * weights[i]) / totalWeight;
        }
    }

    /// @notice Allocate `msg.value` across `candidates`, weighted by proven score. Ineligible
    ///         candidates (below gate / net-losing / unproven) get nothing. Rounding dust is
    ///         credited to the largest-weight recipient so the full deposit is always routed.
    function allocate(address[] calldata candidates) external payable {
        uint256 n = candidates.length;
        if (n == 0) revert NoCandidates();

        uint256 totalWeight;
        uint256 topIdx;
        uint256 topWeight;
        uint256[] memory w = new uint256[](n);
        for (uint256 i = 0; i < n; i++) {
            uint256 wi = _weight(candidates[i]);
            w[i] = wi;
            totalWeight += wi;
            if (wi > topWeight) {
                topWeight = wi;
                topIdx = i;
            }
        }
        if (totalWeight == 0) revert NoEligibleCandidates();

        uint256 distributed;
        uint256 eligible;
        for (uint256 i = 0; i < n; i++) {
            if (w[i] == 0) continue;
            eligible++;
            uint256 share = (msg.value * w[i]) / totalWeight;
            if (share > 0) {
                credited[candidates[i]] += share;
                distributed += share;
                (int64 s,) = attestation.getSharpeMilli(candidates[i]);
                emit Credited(candidates[i], share, s);
            }
        }
        // Route rounding dust to the highest-conviction (top-weight) recipient.
        uint256 dust = msg.value - distributed;
        if (dust > 0) credited[candidates[topIdx]] += dust;

        totalAllocated += msg.value;
        emit Allocated(msg.sender, msg.value, eligible, n);
    }

    /// @notice Withdraw the caller's credited allocation (pull payment).
    function withdraw() external {
        uint256 amount = credited[msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        credited[msg.sender] = 0;
        (bool ok,) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Withdrawn(msg.sender, amount);
    }
}
