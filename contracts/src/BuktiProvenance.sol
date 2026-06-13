// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ISP1Verifier} from "@sp1-contracts/ISP1Verifier.sol";

/// @notice Public values committed by the Bukti provenance guest. Order/types MUST match
///         `ProvenanceOutput` in `prov-lib`.
struct ProvenanceOutput {
    bytes32 blockHash;
    bytes32 receiptsRoot;
    address pool;
    bytes32 topic0;
    uint32 txIndex;
    bool included;
}

/// @title BuktiProvenance — on-chain proof that a Mantle swap log is real chain data
/// @notice Verifies an SP1 Groth16 proof that a DEX Swap log is included in a Mantle block:
///         keccak(header)==blockHash → receiptsRoot → MPT inclusion → the receipt contains the
///         pool's Swap log. This closes the data-provenance half of Bukti's trust boundary —
///         the swaps a score is built from are proven genuine, not relayer-asserted.
/// @dev The trusted `blockHash` is independently checkable on-chain via EIP-2935 (live on
///      Mantle/Arsia): a consumer reads the historical block hash from the system contract and
///      confirms it equals the `blockHash` this proof attests.
contract BuktiProvenance {
    address public verifier;
    bytes32 public provProgramVKey;
    address public owner;

    /// @notice Recorded proven inclusions, keyed by keccak(blockHash, txIndex).
    mapping(bytes32 => ProvenanceOutput) private _proven;

    event SwapProven(
        bytes32 indexed blockHash, address indexed pool, bytes32 topic0, uint32 txIndex, bytes32 receiptsRoot
    );
    event VerifierUpdated(address verifier, bytes32 vkey);

    error NotOwner();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address _verifier, bytes32 _vkey) {
        verifier = _verifier;
        provProgramVKey = _vkey;
        owner = msg.sender;
    }

    /// @notice Verify a provenance proof and record the proven swap-log inclusion.
    function submitProvenance(bytes calldata publicValues, bytes calldata proofBytes) external {
        ISP1Verifier(verifier).verifyProof(provProgramVKey, publicValues, proofBytes);
        ProvenanceOutput memory o = abi.decode(publicValues, (ProvenanceOutput));
        _proven[keccak256(abi.encodePacked(o.blockHash, o.txIndex))] = o;
        emit SwapProven(o.blockHash, o.pool, o.topic0, o.txIndex, o.receiptsRoot);
    }

    /// @notice Read a proven inclusion by (blockHash, txIndex).
    function getProven(bytes32 blockHash, uint32 txIndex) external view returns (ProvenanceOutput memory) {
        return _proven[keccak256(abi.encodePacked(blockHash, txIndex))];
    }

    function setVerifier(address _verifier, bytes32 _vkey) external onlyOwner {
        verifier = _verifier;
        provProgramVKey = _vkey;
        emit VerifierUpdated(_verifier, _vkey);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        owner = newOwner;
    }
}
