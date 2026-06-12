// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Minimal view surface of BuktiAttestation that this validator depends on.
interface IBuktiAttestation {
    function getSharpeMilli(address wallet) external view returns (int64 sharpeMilli, bool exists);
}

/// @notice Minimal subset of the ERC-8004 Validation Registry that Mantle deployed.
/// @dev The registry is specified for "cryptographic proof of work via stake-secured or
///      ZK-based mechanisms" and ships empty. A registered validator answers a
///      `validationRequest` by writing a 0–100 `response` via `validationResponse`.
interface IValidationRegistry {
    function validationResponse(bytes32 dataHash, uint8 response) external;
}

/// @title BuktiValidator — the ZK validator for ERC-8004's Validation Registry
/// @notice Bridges Bukti's zkVM-proven, on-chain trading attestations into ERC-8004's
///         Validation Registry. Where the Reputation Registry stores a *claimed* score,
///         this contract answers a validation request with a number that is only writable
///         once a real Groth16 proof of the metric reconstruction has been verified on-chain
///         in BuktiAttestation. It is the "ZK-based mechanism" the registry was specified for.
///
/// @dev Trust boundary is inherited from BuktiAttestation: the proof makes the computation
///      (raw trades -> Sharpe/PnL) trustless; this contract only *translates* an already-proven
///      score into the registry's 0–100 response scale and forwards it. It holds no funds and
///      stores no metrics of its own — a thin, auditable adapter.
contract BuktiValidator {
    /// @notice The Bukti attestation registry holding zkVM-proven scores.
    IBuktiAttestation public immutable attestation;

    /// @notice The ERC-8004 Validation Registry this validator answers to (Mantle-deployed).
    IValidationRegistry public registry;

    /// @notice Owner, able to point at a (re)deployed registry.
    address public owner;

    /// @notice Proven score (Sharpe*1000) that maps to the maximum 0–100 response.
    ///         A per-trade information ratio of +5.0 is an exceptional, capped ceiling.
    int64 public constant SCORE_CEILING_MILLI = 5000;

    event Validated(address indexed agentWallet, bytes32 indexed dataHash, uint8 response, int64 sharpeMilli);
    event RegistryUpdated(address registry);

    error NotOwner();
    error NoProvenAttestation(address agentWallet);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address _attestation, address _registry) {
        attestation = IBuktiAttestation(_attestation);
        registry = IValidationRegistry(_registry);
        owner = msg.sender;
    }

    /// @notice Pure, on-chain-readable mapping from a proven Sharpe*1000 score to ERC-8004's
    ///         0–100 validation scale. Negative (net-losing) scores floor at 0; +5.0 and above
    ///         saturate at 100; the range in between is linear.
    /// @return response The 0–100 validation response.
    function scoreToResponse(int64 sharpeMilli) public pure returns (uint8 response) {
        if (sharpeMilli <= 0) return 0;
        if (sharpeMilli >= SCORE_CEILING_MILLI) return 100;
        // 0 < sharpeMilli < 5000  ->  0 < response < 100, integer-scaled.
        return uint8(uint64(int64(sharpeMilli) * 100 / SCORE_CEILING_MILLI));
    }

    /// @notice The 0–100 validation response Bukti would give for a wallet, plus whether a
    ///         proven attestation exists. Lets any contract read the validator verdict directly.
    function validationScore(address agentWallet) public view returns (uint8 response, bool proven) {
        (int64 sharpeMilli, bool exists) = attestation.getSharpeMilli(agentWallet);
        return (scoreToResponse(sharpeMilli), exists);
    }

    /// @notice Answer an ERC-8004 validation request for `agentWallet` by forwarding Bukti's
    ///         proven score as the registry response. Reverts unless a zkVM-proven attestation
    ///         exists — you cannot get a Bukti validation without a real proof on-chain first.
    /// @param dataHash    The ERC-8004 request data hash being validated.
    /// @param agentWallet The wallet/agent whose proven Bukti score answers the request.
    function respondToValidation(bytes32 dataHash, address agentWallet) external returns (uint8 response) {
        (int64 sharpeMilli, bool exists) = attestation.getSharpeMilli(agentWallet);
        if (!exists) revert NoProvenAttestation(agentWallet);

        response = scoreToResponse(sharpeMilli);
        registry.validationResponse(dataHash, response);
        emit Validated(agentWallet, dataHash, response, sharpeMilli);
    }

    /// @notice Owner: repoint at a (re)deployed Validation Registry.
    function setRegistry(address _registry) external onlyOwner {
        registry = IValidationRegistry(_registry);
        emit RegistryUpdated(_registry);
    }

    /// @notice Owner: transfer ownership.
    function transferOwnership(address newOwner) external onlyOwner {
        owner = newOwner;
    }
}
