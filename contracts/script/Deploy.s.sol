// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {BuktiAttestation} from "../src/BuktiAttestation.sol";
import {GatedVault} from "../src/GatedVault.sol";
import {SP1MockVerifier} from "@sp1-contracts/SP1MockVerifier.sol";

/// @notice Deploys the Bukti stack to Mantle Sepolia (or any EVM chain).
///
/// Env vars:
/// - BUKTI_VKEY   : bytes32 program verification key (from `cargo run --bin vkey`)
/// - SP1_VERIFIER       : address of an SP1 verifier. If unset (0x0), a SP1MockVerifier is
///                        deployed so the on-chain flow is demonstrable before the real
///                        Groth16 verifier (matching the SP1 SDK version) is wired in.
/// - MIN_SHARPE_MILLI   : int64 threshold for the GatedVault demo (default 500 = Sharpe 0.5)
///
/// Run:
///   forge script script/Deploy.s.sol --rpc-url $MANTLE_SEPOLIA_RPC \
///     --private-key $PRIVATE_KEY --broadcast --legacy
contract Deploy is Script {
    function run() external {
        bytes32 vkey = vm.envBytes32("BUKTI_VKEY");
        address verifier = vm.envOr("SP1_VERIFIER", address(0));
        int256 minSharpe = vm.envOr("MIN_SHARPE_MILLI", int256(500));

        vm.startBroadcast();

        if (verifier == address(0)) {
            verifier = address(new SP1MockVerifier());
            console.log("Deployed SP1MockVerifier (placeholder):", verifier);
        }

        BuktiAttestation attest = new BuktiAttestation(verifier, vkey);
        console.log("BuktiAttestation:", address(attest));

        GatedVault vault = new GatedVault(address(attest), int64(minSharpe));
        console.log("GatedVault:", address(vault));

        vm.stopBroadcast();

        console.log("--- Bukti deployment ---");
        console.log("verifier:", verifier);
        console.logBytes32(vkey);
    }
}
