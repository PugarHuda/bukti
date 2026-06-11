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

    // ---- QA edge cases ----

    function test_vaultBoundary_exactThresholdApproved_oneBelowRejected() public {
        GatedVault vault = new GatedVault(address(attest), int64(500));

        // Exactly at threshold (500 >= 500) -> approved.
        address atLine = address(0x3333333333333333333333333333333333333333);
        attest.submitAttestation(_encode(atLine, 500), "");
        vault.approveAgent(atLine);
        assertTrue(vault.approvedAgent(atLine));

        // One below threshold -> rejected with typed error.
        address below = address(0x4444444444444444444444444444444444444444);
        attest.submitAttestation(_encode(below, 499), "");
        vm.expectRevert(
            abi.encodeWithSelector(GatedVault.SharpeBelowThreshold.selector, int64(499), int64(500))
        );
        vault.approveAgent(below);
    }

    function test_vaultRejectsAgentWithoutAttestation() public {
        GatedVault vault = new GatedVault(address(attest), int64(500));
        vm.expectRevert(GatedVault.NoAttestation.selector);
        vault.approveAgent(address(0xbadbad));
    }

    function test_resubmissionOverwritesLatestAttestation() public {
        attest.submitAttestation(_encode(AGENT, 100), "");
        attest.submitAttestation(_encode(AGENT, 900), "");
        (int64 sharpe, bool exists) = attest.getSharpeMilli(AGENT);
        assertTrue(exists);
        assertEq(sharpe, int64(900)); // latest wins
    }

    function test_negativeScoreStoredFaithfully() public {
        attest.submitAttestation(_encode(AGENT, -1316), "");
        (int64 sharpe,) = attest.getSharpeMilli(AGENT);
        assertEq(sharpe, int64(-1316));
    }

    function test_malformedPublicValuesReverts() public {
        bytes memory garbage = hex"deadbeef";
        vm.expectRevert();
        attest.submitAttestation(garbage, "");
    }

    function test_invalidProofRejectedByVerifier() public {
        // SP1MockVerifier asserts proofBytes.length == 0; non-empty proof must revert.
        bytes memory pv = _encode(AGENT, 630);
        vm.expectRevert();
        attest.submitAttestation(pv, hex"01");
        assertFalse(attest.hasAttestation(AGENT));
    }

    function test_eventEmittedWithCorrectFields() public {
        bytes memory pv = _encode(AGENT, 630);
        vm.expectEmit(true, true, false, true);
        emit BuktiAttestation.AttestationSubmitted(
            AGENT, address(this), 630, 4000, 280, 5_000_000_000, bytes32(uint256(0xBEEF))
        );
        attest.submitAttestation(pv, "");
    }
}
