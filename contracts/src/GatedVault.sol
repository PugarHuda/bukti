// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Minimal interface Bukti consumers depend on.
interface IBuktiAttestation {
    function getSharpeMilli(address wallet) external view returns (int64 sharpeMilli, bool exists);
}

/// @title GatedVault
/// @notice A toy consumer demonstrating Bukti composability: it only approves an
///         agent to manage capital if that agent has a Bukti attestation with a
///         verified Sharpe ratio at or above a minimum threshold. This is the "capital
///         routed by proven track record, not self-reported screenshots" use case.
contract GatedVault {
    IBuktiAttestation public immutable bukti;

    /// @notice Minimum verified Sharpe (x1000) required for approval. e.g. 500 = Sharpe 0.5.
    int64 public immutable minSharpeMilli;

    mapping(address => bool) public approvedAgent;

    event AgentApproved(address indexed agent, int64 sharpeMilli);

    error NoAttestation();
    error SharpeBelowThreshold(int64 sharpeMilli, int64 required);

    constructor(address _bukti, int64 _minSharpeMilli) {
        bukti = IBuktiAttestation(_bukti);
        minSharpeMilli = _minSharpeMilli;
    }

    /// @notice Approve an agent iff its verified Bukti Sharpe clears the threshold.
    function approveAgent(address agent) external {
        (int64 sharpeMilli, bool exists) = bukti.getSharpeMilli(agent);
        if (!exists) revert NoAttestation();
        if (sharpeMilli < minSharpeMilli) revert SharpeBelowThreshold(sharpeMilli, minSharpeMilli);
        approvedAgent[agent] = true;
        emit AgentApproved(agent, sharpeMilli);
    }
}
