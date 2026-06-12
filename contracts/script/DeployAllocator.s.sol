// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {BuktiAllocator} from "../src/BuktiAllocator.sol";

/// @notice Deploys BuktiAllocator — capital routed by ZK-proven score.
///
/// Env vars:
/// - BUKTI_ATTESTATION : address of the deployed BuktiAttestation (the proven-score source)
/// - MIN_SHARPE_MILLI  : int64 gate (default 500 = Sharpe 0.5)
///
/// Run:
///   forge script script/DeployAllocator.s.sol --rpc-url $MANTLE_SEPOLIA_RPC \
///     --private-key $PRIVATE_KEY --broadcast --legacy
contract DeployAllocator is Script {
    function run() external {
        address attestation = vm.envAddress("BUKTI_ATTESTATION");
        int256 gate = vm.envOr("MIN_SHARPE_MILLI", int256(500));

        vm.startBroadcast();
        BuktiAllocator alloc = new BuktiAllocator(attestation, int64(gate));
        vm.stopBroadcast();

        console.log("BuktiAllocator:", address(alloc));
        console.log("attestation:", attestation);
        console.log("gate (sharpeMilli):");
        console.logInt(gate);
    }
}
