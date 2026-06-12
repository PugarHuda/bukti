// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {BuktiValidator} from "../src/BuktiValidator.sol";
import {ReferenceValidationRegistry} from "../src/ReferenceValidationRegistry.sol";

/// @notice Deploys the ERC-8004 ZK-validator bridge: BuktiValidator + a reference
///         Validation Registry it answers to. The validator reads zkVM-proven scores
///         from an existing BuktiAttestation and writes 0–100 validation responses.
///
/// Env vars:
/// - BUKTI_ATTESTATION : address of the deployed BuktiAttestation (the proven-score source)
/// - VALIDATION_REGISTRY : optional. If unset (0x0), a ReferenceValidationRegistry is deployed
///                         so the bridge is verifiable on testnet; on mainnet, pass Mantle's
///                         canonical ERC-8004 Validation Registry address.
///
/// Run:
///   forge script script/DeployValidator.s.sol --rpc-url $MANTLE_SEPOLIA_RPC \
///     --private-key $PRIVATE_KEY --broadcast --legacy
contract DeployValidator is Script {
    function run() external {
        address attestation = vm.envAddress("BUKTI_ATTESTATION");
        address registry = vm.envOr("VALIDATION_REGISTRY", address(0));

        vm.startBroadcast();

        if (registry == address(0)) {
            registry = address(new ReferenceValidationRegistry());
            console.log("Deployed ReferenceValidationRegistry:", registry);
        }

        BuktiValidator validator = new BuktiValidator(attestation, registry);
        console.log("BuktiValidator:", address(validator));

        vm.stopBroadcast();

        console.log("--- Bukti ERC-8004 validator ---");
        console.log("attestation:", attestation);
        console.log("registry:", registry);
    }
}
