// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title ReferenceValidationRegistry
/// @notice A minimal, faithful stand-in for ERC-8004's Validation Registry, used to
///         demonstrate `BuktiValidator` end-to-end on Mantle Sepolia. It records the
///         responses a validator writes, exactly as the canonical registry would.
///
/// @dev On Mantle mainnet, `BuktiValidator` repoints (via `setRegistry`) at Mantle's own
///      canonical ERC-8004 Validation Registry — the interface (`validationResponse`) is
///      the same. This contract exists only so the bridge is verifiable on testnet today,
///      independent of the canonical registry's published address.
contract ReferenceValidationRegistry {
    struct Response {
        address validator;
        uint8 response;
        uint64 at;
        bool exists;
    }

    mapping(bytes32 => Response) public responses;

    event ValidationResponded(bytes32 indexed dataHash, address indexed validator, uint8 response);

    /// @notice ERC-8004 Validation Registry surface: a validator writes its 0–100 verdict.
    function validationResponse(bytes32 dataHash, uint8 response) external {
        responses[dataHash] =
            Response({validator: msg.sender, response: response, at: uint64(block.timestamp), exists: true});
        emit ValidationResponded(dataHash, msg.sender, response);
    }

    /// @notice Read back a recorded validation verdict.
    function getResponse(bytes32 dataHash) external view returns (address validator, uint8 response, bool exists) {
        Response storage r = responses[dataHash];
        return (r.validator, r.response, r.exists);
    }
}
