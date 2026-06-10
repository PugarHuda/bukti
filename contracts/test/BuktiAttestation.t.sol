// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {SP1MockVerifier} from "@sp1-contracts/SP1MockVerifier.sol";
import {BuktiAttestation, BuktiOutput} from "../src/BuktiAttestation.sol";
import {GatedVault} from "../src/GatedVault.sol";

contract BuktiAttestationTest is Test {
    SP1MockVerifier verifier;
    BuktiAttestation attest;

    address constant AGENT = address(0x1111111111111111111111111111111111111111);
    bytes32 constant VKEY = bytes32(uint256(0xABCD));

    function setUp() public {
        verifier = new SP1MockVerifier();
        attest = new BuktiAttestation(address(verifier), VKEY);
    }

    function _encode(address wallet, int64 sharpeMilli) internal pure returns (bytes memory) {
        return abi.encode(
            BuktiOutput({
                wallet: wallet,
                anchorBlockHash: bytes32(uint256(0xBEEF)),
                windowStart: 1_717_200_000,
                windowEnd: 1_717_545_600,
                numTrades: 5,
                sharpeMilli: sharpeMilli,
                maxDrawdownBps: 4000,
                roiBps: 280,
                volumeUsdE6: 5_000_000_000
            })
        );
    }

    function test_submitAndReadAttestation() public {
        bytes memory pv = _encode(AGENT, 630);
        attest.submitAttestation(pv, ""); // mock verifier requires empty proof

        assertTrue(attest.hasAttestation(AGENT));
        (int64 sharpe, bool exists) = attest.getSharpeMilli(AGENT);
        assertTrue(exists);
        assertEq(sharpe, int64(630));

        BuktiAttestation.Attestation memory a = attest.getAttestation(AGENT);
        assertEq(a.numTrades, 5);
        assertEq(a.maxDrawdownBps, 4000);
        assertEq(a.roiBps, int64(280));
        assertEq(a.volumeUsdE6, 5_000_000_000);
        assertEq(a.attester, address(this));
    }

    function test_unknownWalletHasNoAttestation() public view {
        assertFalse(attest.hasAttestation(address(0xdead)));
        (, bool exists) = attest.getSharpeMilli(address(0xdead));
        assertFalse(exists);
    }

    function test_gatedVaultApprovesOnlyAboveThreshold() public {
        // threshold Sharpe 0.5 (= 500 milli)
        GatedVault vault = new GatedVault(address(attest), int64(500));

        // Agent with Sharpe 0.63 -> approved.
        attest.submitAttestation(_encode(AGENT, 630), "");
        vault.approveAgent(AGENT);
        assertTrue(vault.approvedAgent(AGENT));

        // Agent with Sharpe 0.30 -> rejected.
        address weak = address(0x2222222222222222222222222222222222222222);
        attest.submitAttestation(_encode(weak, 300), "");
        vm.expectRevert();
        vault.approveAgent(weak);
        assertFalse(vault.approvedAgent(weak));
    }

    function test_ownerCanRotateVerifier() public {
        SP1MockVerifier v2 = new SP1MockVerifier();
        bytes32 newVkey = bytes32(uint256(0x1234));
        attest.setVerifier(address(v2), newVkey);
        assertEq(attest.verifier(), address(v2));
        assertEq(attest.buktiProgramVKey(), newVkey);
    }

    function test_nonOwnerCannotRotateVerifier() public {
        vm.prank(address(0xdead));
        vm.expectRevert(BuktiAttestation.NotOwner.selector);
        attest.setVerifier(address(0), bytes32(0));
    }
}
