// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ISP1Verifier} from "@sp1-contracts/ISP1Verifier.sol";

/// @notice Public values from the full-integration guest. Order/types MUST match `FullOutput`
///         in `prov-lib`.
struct FullOutput {
    uint32 numSwaps;
    uint64 totalVolumeUsdE6;
    bytes32 firstBlockHash;
    bool allIncluded;
}

/// @title BuktiFullProof — a metric proven over genuine chain data, end-to-end, in one proof
/// @notice Verifies a single SP1 Groth16 proof that a USD-volume metric was computed entirely
///         over swaps EACH proven to be real Mantle chain data (header → receiptsRoot → MPT
///         inclusion → Swap log → notional decoded in-circuit). This closes the last gap: the
///         metric's *inputs* are proven, not relayer-asserted. The trust boundary is shut.
/// @dev The `firstBlockHash` is independently checkable on-chain via EIP-2935 (live on Mantle).
contract BuktiFullProof {
    address public verifier;
    bytes32 public programVKey;
    address public owner;

    FullOutput public latest;
    uint256 public proofCount;

    event FullProofVerified(uint32 numSwaps, uint64 totalVolumeUsdE6, bytes32 firstBlockHash);
    event VerifierUpdated(address verifier, bytes32 vkey);

    error NotOwner();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address _verifier, bytes32 _vkey) {
        verifier = _verifier;
        programVKey = _vkey;
        owner = msg.sender;
    }

    /// @notice Verify a full-integration proof and record the proven, chain-authentic metric.
    function submitFullProof(bytes calldata publicValues, bytes calldata proofBytes) external {
        ISP1Verifier(verifier).verifyProof(programVKey, publicValues, proofBytes);
        FullOutput memory o = abi.decode(publicValues, (FullOutput));
        latest = o;
        proofCount++;
        emit FullProofVerified(o.numSwaps, o.totalVolumeUsdE6, o.firstBlockHash);
    }

    function setVerifier(address _verifier, bytes32 _vkey) external onlyOwner {
        verifier = _verifier;
        programVKey = _vkey;
        emit VerifierUpdated(_verifier, _vkey);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        owner = newOwner;
    }
}
