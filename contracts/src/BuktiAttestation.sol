// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ISP1Verifier} from "@sp1-contracts/ISP1Verifier.sol";

/// @notice Public values committed by the Bukti zkVM program. Field order and
///         types MUST match `BuktiOutput` in the Rust `lib` crate exactly.
struct BuktiOutput {
    address wallet;
    bytes32 anchorBlockHash;
    uint64 windowStart;
    uint64 windowEnd;
    uint32 numTrades;
    int64 sharpeMilli;
    uint32 maxDrawdownBps;
    int64 roiBps;
    uint64 volumeUsdE6;
    // Completeness commitment (anti-cherry-pick): a keccak commitment over the FULL ordered
    // swap set the metrics were computed from, plus its leg count. Dropping/reordering any leg
    // changes the commitment, so a trader cannot prove only a winning subset.
    bytes32 swapsRoot;
    uint32 numSwaps;
}

/// @title Bukti Attestation Registry
/// @notice The composable on-chain primitive at the heart of Bukti. It verifies an
///         SP1 zero-knowledge proof that a wallet's risk-adjusted trading metrics
///         (Sharpe / max drawdown / ROI / volume) were correctly reconstructed from its
///         raw on-chain trade series, then stores the result so any other protocol
///         (vaults, lending, copy-trading) can gate capital by *proven* performance.
///
/// @dev Trust boundary: the zk proof makes the *computation* (trades -> metrics)
///      trustless and verifiable. Data provenance is anchored to a Mantle block hash
///      (`anchorBlockHash`); fully trustless arbitrary-history input requires an on-chain
///      block-hash accumulator (a documented roadmap item, not in the MVP).
contract BuktiAttestation {
    /// @notice Stored, verified performance record for a wallet/agent.
    struct Attestation {
        bytes32 anchorBlockHash;
        uint64 windowStart;
        uint64 windowEnd;
        uint32 numTrades;
        int64 sharpeMilli; // Sharpe * 1000
        uint32 maxDrawdownBps; // basis points
        int64 roiBps; // basis points
        uint64 volumeUsdE6; // USD * 1e6
        bytes32 swapsRoot; // completeness commitment (keccak of full ordered swap set)
        uint32 numSwaps; // swap legs bound into swapsRoot
        uint64 attestedAt; // block.timestamp of submission
        address attester; // who submitted the proof (relayer)
        bool exists;
    }

    /// @notice The SP1 verifier contract (a specific SP1Verifier or the SP1VerifierGateway).
    ///         On Mantle this is self-deployed from succinctlabs/sp1-contracts.
    address public verifier;

    /// @notice The verification key of the Bukti program; only proofs of *this* exact
    ///         program are accepted.
    bytes32 public buktiProgramVKey;

    /// @notice Contract owner, able to rotate the verifier/vkey (e.g. after a program change).
    address public owner;

    /// @notice Latest verified attestation per wallet.
    mapping(address => Attestation) private _attestations;

    event AttestationSubmitted(
        address indexed wallet,
        address indexed attester,
        int64 sharpeMilli,
        uint32 maxDrawdownBps,
        int64 roiBps,
        uint64 volumeUsdE6,
        bytes32 anchorBlockHash
    );
    event VerifierUpdated(address verifier, bytes32 vkey);

    error NotOwner();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address _verifier, bytes32 _vkey) {
        verifier = _verifier;
        buktiProgramVKey = _vkey;
        owner = msg.sender;
    }

    /// @notice Verify ONE SP1 proof attesting a whole batch of wallets, and record every
    ///         attestation. The zkVM commits `abi.encode(BuktiOutput[])`, so one Groth16
    ///         proof carries an entire leaderboard.
    /// @param publicValues ABI-encoded `BuktiOutput[]` committed by the zkVM.
    /// @param proofBytes   The SP1 (Groth16) proof.
    function submitBatchAttestation(bytes calldata publicValues, bytes calldata proofBytes)
        external
    {
        // Reverts if the proof is invalid for this program + these public values.
        ISP1Verifier(verifier).verifyProof(buktiProgramVKey, publicValues, proofBytes);

        BuktiOutput[] memory outs = abi.decode(publicValues, (BuktiOutput[]));

        for (uint256 i = 0; i < outs.length; i++) {
            BuktiOutput memory o = outs[i];
            _attestations[o.wallet] = Attestation({
                anchorBlockHash: o.anchorBlockHash,
                windowStart: o.windowStart,
                windowEnd: o.windowEnd,
                numTrades: o.numTrades,
                sharpeMilli: o.sharpeMilli,
                maxDrawdownBps: o.maxDrawdownBps,
                roiBps: o.roiBps,
                volumeUsdE6: o.volumeUsdE6,
                swapsRoot: o.swapsRoot,
                numSwaps: o.numSwaps,
                attestedAt: uint64(block.timestamp),
                attester: msg.sender,
                exists: true
            });

            emit AttestationSubmitted(
                o.wallet,
                msg.sender,
                o.sharpeMilli,
                o.maxDrawdownBps,
                o.roiBps,
                o.volumeUsdE6,
                o.anchorBlockHash
            );
        }
    }

    /// @notice Full attestation for a wallet.
    function getAttestation(address wallet) external view returns (Attestation memory) {
        return _attestations[wallet];
    }

    /// @notice Composable accessor: a wallet's verified Sharpe (x1000) and whether it exists.
    /// @dev This is what consumer protocols (e.g. GatedVault) read.
    function getSharpeMilli(address wallet) external view returns (int64 sharpeMilli, bool exists) {
        Attestation storage a = _attestations[wallet];
        return (a.sharpeMilli, a.exists);
    }

    /// @notice Whether a wallet has any verified attestation.
    function hasAttestation(address wallet) external view returns (bool) {
        return _attestations[wallet].exists;
    }

    /// @notice Completeness commitment for a wallet: the keccak commitment over the FULL swap
    ///         set the score was computed over, and the number of legs bound into it. A consumer
    ///         can recompute it from the public witness and confirm no leg was cherry-picked.
    function getCompleteness(address wallet)
        external
        view
        returns (bytes32 swapsRoot, uint32 numSwaps, bool exists)
    {
        Attestation storage a = _attestations[wallet];
        return (a.swapsRoot, a.numSwaps, a.exists);
    }

    /// @notice Owner: rotate the verifier and/or program vkey.
    function setVerifier(address _verifier, bytes32 _vkey) external onlyOwner {
        verifier = _verifier;
        buktiProgramVKey = _vkey;
        emit VerifierUpdated(_verifier, _vkey);
    }

    /// @notice Owner: transfer ownership.
    function transferOwnership(address newOwner) external onlyOwner {
        owner = newOwner;
    }
}
