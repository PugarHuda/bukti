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

    function _out(address wallet, int64 sharpeMilli) internal pure returns (BuktiOutput memory) {
        return BuktiOutput({
            wallet: wallet,
            anchorBlockHash: bytes32(uint256(0xBEEF)),
            windowStart: 1_717_200_000,
            windowEnd: 1_717_545_600,
            numTrades: 5,
            sharpeMilli: sharpeMilli,
            maxDrawdownBps: 4000,
            roiBps: 280,
            volumeUsdE6: 5_000_000_000
        });
    }

    function _batch1(address wallet, int64 sharpeMilli) internal pure returns (bytes memory) {
        BuktiOutput[] memory outs = new BuktiOutput[](1);
        outs[0] = _out(wallet, sharpeMilli);
        return abi.encode(outs);
    }

    function test_submitBatchAndRead() public {
        BuktiOutput[] memory outs = new BuktiOutput[](3);
        outs[0] = _out(AGENT, 630);
        outs[1] = _out(address(0xA2), -250);
        outs[2] = _out(address(0xA3), 1500);
        attest.submitBatchAttestation(abi.encode(outs), ""); // mock verifier: empty proof

        (int64 s1, bool e1) = attest.getSharpeMilli(AGENT);
        (int64 s2, bool e2) = attest.getSharpeMilli(address(0xA2));
        (int64 s3, bool e3) = attest.getSharpeMilli(address(0xA3));
        assertTrue(e1 && e2 && e3);
        assertEq(s1, int64(630));
        assertEq(s2, int64(-250));
        assertEq(s3, int64(1500));

        BuktiAttestation.Attestation memory a = attest.getAttestation(AGENT);
        assertEq(a.numTrades, 5);
        assertEq(a.attester, address(this));
    }

    /// Cross-language compatibility: this hex is the EXACT publicValues committed by the
    /// Rust zkVM guest (2-wallet sample batch, `cargo run --bin bukti -- --execute`).
    /// If alloy's abi.encode(Vec<BuktiOutput>) ever drifts from Solidity's
    /// abi.decode(..., (BuktiOutput[])), this test breaks.
    function test_zkvmBatchEncodingDecodesExactly() public {
        bytes memory pv =
            hex"000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000020000000000000000000000001111111111111111111111111111111111111111000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000665bb60000000000000000000000000000000000000000000000000000000000665faa80000000000000000000000000000000000000000000000000000000000000000300000000000000000000000000000000000000000000000000000000000002150000000000000000000000000000000000000000000000000000000000000162000000000000000000000000000000000000000000000000000000000000037900000000000000000000000000000000000000000000000000000000896382400000000000000000000000002222222222222222222222222222222222222222000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000665bb60000000000000000000000000000000000000000000000000000000000665faa800000000000000000000000000000000000000000000000000000000000000003000000000000000000000000000000000000000000000000000000000000021500000000000000000000000000000000000000000000000000000000000001620000000000000000000000000000000000000000000000000000000000000379000000000000000000000000000000000000000000000000000000019c2a86c0";
        attest.submitBatchAttestation(pv, "");

        (int64 s1, bool e1) = attest.getSharpeMilli(AGENT);
        assertTrue(e1);
        assertEq(s1, int64(533));
        BuktiAttestation.Attestation memory a1 = attest.getAttestation(AGENT);
        assertEq(a1.maxDrawdownBps, 354);
        assertEq(a1.roiBps, int64(889));
        assertEq(a1.volumeUsdE6, 2_305_000_000);
        assertEq(a1.numTrades, 3);

        (int64 s2, bool e2) =
            attest.getSharpeMilli(address(0x2222222222222222222222222222222222222222));
        assertTrue(e2);
        assertEq(s2, int64(533));
        BuktiAttestation.Attestation memory a2 =
            attest.getAttestation(address(0x2222222222222222222222222222222222222222));
        assertEq(a2.volumeUsdE6, 6_915_000_000);
    }

    function test_unknownWalletHasNoAttestation() public view {
        assertFalse(attest.hasAttestation(address(0xdead)));
        (, bool exists) = attest.getSharpeMilli(address(0xdead));
        assertFalse(exists);
    }

    function test_gatedVaultApprovesOnlyAboveThreshold() public {
        GatedVault vault = new GatedVault(address(attest), int64(500));

        attest.submitBatchAttestation(_batch1(AGENT, 630), "");
        vault.approveAgent(AGENT);
        assertTrue(vault.approvedAgent(AGENT));

        address weak = address(0x2222222222222222222222222222222222222222);
        attest.submitBatchAttestation(_batch1(weak, 300), "");
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

        address atLine = address(0x3333333333333333333333333333333333333333);
        attest.submitBatchAttestation(_batch1(atLine, 500), "");
        vault.approveAgent(atLine);
        assertTrue(vault.approvedAgent(atLine));

        address below = address(0x4444444444444444444444444444444444444444);
        attest.submitBatchAttestation(_batch1(below, 499), "");
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
        attest.submitBatchAttestation(_batch1(AGENT, 100), "");
        attest.submitBatchAttestation(_batch1(AGENT, 900), "");
        (int64 sharpe, bool exists) = attest.getSharpeMilli(AGENT);
        assertTrue(exists);
        assertEq(sharpe, int64(900));
    }

    function test_negativeScoreStoredFaithfully() public {
        attest.submitBatchAttestation(_batch1(AGENT, -1316), "");
        (int64 sharpe,) = attest.getSharpeMilli(AGENT);
        assertEq(sharpe, int64(-1316));
    }

    function test_malformedPublicValuesReverts() public {
        bytes memory garbage = hex"deadbeef";
        vm.expectRevert();
        attest.submitBatchAttestation(garbage, "");
    }

    function test_invalidProofRejectedByVerifier() public {
        bytes memory pv = _batch1(AGENT, 630);
        vm.expectRevert();
        attest.submitBatchAttestation(pv, hex"01");
        assertFalse(attest.hasAttestation(AGENT));
    }

    function test_emptyBatchIsNoop() public {
        BuktiOutput[] memory outs = new BuktiOutput[](0);
        attest.submitBatchAttestation(abi.encode(outs), "");
        assertFalse(attest.hasAttestation(AGENT));
    }

    function test_eventEmittedPerWalletInBatch() public {
        BuktiOutput[] memory outs = new BuktiOutput[](2);
        outs[0] = _out(AGENT, 630);
        outs[1] = _out(address(0xA2), -100);

        vm.expectEmit(true, true, false, true);
        emit BuktiAttestation.AttestationSubmitted(
            AGENT, address(this), 630, 4000, 280, 5_000_000_000, bytes32(uint256(0xBEEF))
        );
        vm.expectEmit(true, true, false, true);
        emit BuktiAttestation.AttestationSubmitted(
            address(0xA2), address(this), -100, 4000, 280, 5_000_000_000, bytes32(uint256(0xBEEF))
        );
        attest.submitBatchAttestation(abi.encode(outs), "");
    }
}
