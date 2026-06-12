// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {SP1MockVerifier} from "@sp1-contracts/SP1MockVerifier.sol";
import {BuktiAttestation, BuktiOutput} from "../src/BuktiAttestation.sol";
import {BuktiValidator, IValidationRegistry} from "../src/BuktiValidator.sol";

/// @notice Records the last validationResponse so the test can assert the bridge forwarded it.
contract MockValidationRegistry is IValidationRegistry {
    bytes32 public lastDataHash;
    uint8 public lastResponse;
    uint256 public calls;

    function validationResponse(bytes32 dataHash, uint8 response) external {
        lastDataHash = dataHash;
        lastResponse = response;
        calls++;
    }
}

contract BuktiValidatorTest is Test {
    SP1MockVerifier verifier;
    BuktiAttestation attest;
    MockValidationRegistry registry;
    BuktiValidator validator;

    address constant AGENT = address(0x1111111111111111111111111111111111111111);
    address constant LOSER = address(0x2222222222222222222222222222222222222222);
    address constant UNKNOWN = address(0x3333333333333333333333333333333333333333);
    bytes32 constant VKEY = bytes32(uint256(0xABCD));
    bytes32 constant DATA = bytes32(uint256(0xDA7A));

    function setUp() public {
        verifier = new SP1MockVerifier();
        attest = new BuktiAttestation(address(verifier), VKEY);
        registry = new MockValidationRegistry();
        validator = new BuktiValidator(address(attest), address(registry));
    }

    function _attest(address wallet, int64 sharpeMilli) internal {
        BuktiOutput[] memory outs = new BuktiOutput[](1);
        outs[0] = BuktiOutput({
            wallet: wallet,
            anchorBlockHash: bytes32(uint256(0xBEEF)),
            windowStart: 1_717_200_000,
            windowEnd: 1_717_545_600,
            numTrades: 5,
            sharpeMilli: sharpeMilli,
            maxDrawdownBps: 4000,
            roiBps: 280,
            volumeUsdE6: 5_000_000_000,
            swapsRoot: keccak256(abi.encode("swaps", wallet, sharpeMilli)),
            numSwaps: 11
        });
        attest.submitBatchAttestation(abi.encode(outs), "");
    }

    // ---- pure mapping ----

    function test_scoreToResponse_floorsNegativeAtZero() public view {
        assertEq(validator.scoreToResponse(-1316), 0);
        assertEq(validator.scoreToResponse(0), 0);
    }

    function test_scoreToResponse_saturatesAtHundred() public view {
        assertEq(validator.scoreToResponse(5000), 100);
        assertEq(validator.scoreToResponse(9999), 100);
    }

    function test_scoreToResponse_linearMidrange() public view {
        // 2500 milli (Sharpe 2.5) -> 50
        assertEq(validator.scoreToResponse(2500), 50);
        // 4265 milli (the cohort proof champion) -> 85
        assertEq(validator.scoreToResponse(4265), 85);
        // 500 milli (the GatedVault gate) -> 10
        assertEq(validator.scoreToResponse(500), 10);
    }

    function testFuzz_scoreToResponse_inRange(int64 s) public view {
        uint8 r = validator.scoreToResponse(s);
        assertLe(r, 100);
        if (s <= 0) assertEq(r, 0);
        if (s >= 5000) assertEq(r, 100);
    }

    // ---- validationScore view ----

    function test_validationScore_reflectsAttestation() public {
        _attest(AGENT, 4265);
        (uint8 r, bool proven) = validator.validationScore(AGENT);
        assertTrue(proven);
        assertEq(r, 85);
    }

    function test_validationScore_unknownIsUnproven() public view {
        (uint8 r, bool proven) = validator.validationScore(UNKNOWN);
        assertFalse(proven);
        assertEq(r, 0);
    }

    // ---- respondToValidation bridge ----

    function test_respond_forwardsToRegistry() public {
        _attest(AGENT, 4265);
        uint8 r = validator.respondToValidation(DATA, AGENT);
        assertEq(r, 85);
        assertEq(registry.calls(), 1);
        assertEq(registry.lastDataHash(), DATA);
        assertEq(registry.lastResponse(), 85);
    }

    function test_respond_losingAgentScoresZeroButStillResponds() public {
        _attest(LOSER, -1316);
        uint8 r = validator.respondToValidation(DATA, LOSER);
        assertEq(r, 0);
        assertEq(registry.lastResponse(), 0);
        assertEq(registry.calls(), 1);
    }

    function test_respond_revertsWithoutProof() public {
        vm.expectRevert(abi.encodeWithSelector(BuktiValidator.NoProvenAttestation.selector, UNKNOWN));
        validator.respondToValidation(DATA, UNKNOWN);
        assertEq(registry.calls(), 0);
    }

    function test_respond_emitsValidated() public {
        _attest(AGENT, 2500);
        vm.expectEmit(true, true, false, true);
        emit BuktiValidator.Validated(AGENT, DATA, 50, 2500);
        validator.respondToValidation(DATA, AGENT);
    }

    // ---- ownership ----

    function test_setRegistry_onlyOwner() public {
        MockValidationRegistry r2 = new MockValidationRegistry();
        validator.setRegistry(address(r2));
        assertEq(address(validator.registry()), address(r2));

        vm.prank(address(0xDEAD));
        vm.expectRevert(BuktiValidator.NotOwner.selector);
        validator.setRegistry(address(registry));
    }

    function test_respond_usesUpdatedRegistry() public {
        _attest(AGENT, 5000);
        MockValidationRegistry r2 = new MockValidationRegistry();
        validator.setRegistry(address(r2));
        validator.respondToValidation(DATA, AGENT);
        assertEq(r2.calls(), 1);
        assertEq(r2.lastResponse(), 100);
        assertEq(registry.calls(), 0); // old registry untouched
    }
}
