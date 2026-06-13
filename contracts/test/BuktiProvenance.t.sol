// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {SP1MockVerifier} from "@sp1-contracts/SP1MockVerifier.sol";
import {BuktiProvenance, ProvenanceOutput} from "../src/BuktiProvenance.sol";

contract BuktiProvenanceTest is Test {
    SP1MockVerifier verifier;
    BuktiProvenance prov;

    bytes32 constant VKEY = bytes32(uint256(0xABCD));
    bytes32 constant BLOCKHASH = bytes32(uint256(0xB10C));
    address constant POOL = 0x54169896d28dec0FFABE3B16f90f71323774949f;
    bytes32 constant TOPIC0 = 0x19b47279256b2a23a1665c810c8d55a1758940ee09377d4f8d26497a3577dc83;

    function setUp() public {
        verifier = new SP1MockVerifier();
        prov = new BuktiProvenance(address(verifier), VKEY);
    }

    function _out(uint32 txIndex) internal pure returns (ProvenanceOutput memory) {
        return ProvenanceOutput({
            blockHash: BLOCKHASH,
            receiptsRoot: bytes32(uint256(0xECEE)),
            pool: POOL,
            topic0: TOPIC0,
            txIndex: txIndex,
            included: true
        });
    }

    function test_submitAndRead() public {
        prov.submitProvenance(abi.encode(_out(1)), "");
        ProvenanceOutput memory got = prov.getProven(BLOCKHASH, 1);
        assertTrue(got.included);
        assertEq(got.pool, POOL);
        assertEq(got.topic0, TOPIC0);
        assertEq(got.txIndex, 1);
        assertEq(got.receiptsRoot, bytes32(uint256(0xECEE)));
    }

    function test_emitsSwapProven() public {
        vm.expectEmit(true, true, false, true);
        emit BuktiProvenance.SwapProven(BLOCKHASH, POOL, TOPIC0, 1, bytes32(uint256(0xECEE)));
        prov.submitProvenance(abi.encode(_out(1)), "");
    }

    function test_distinctTxIndexStoredSeparately() public {
        prov.submitProvenance(abi.encode(_out(1)), "");
        prov.submitProvenance(abi.encode(_out(2)), "");
        assertEq(prov.getProven(BLOCKHASH, 1).txIndex, 1);
        assertEq(prov.getProven(BLOCKHASH, 2).txIndex, 2);
    }

    function test_unknownIsEmpty() public view {
        ProvenanceOutput memory got = prov.getProven(BLOCKHASH, 99);
        assertFalse(got.included);
        assertEq(got.pool, address(0));
    }

    function test_setVerifierOnlyOwner() public {
        SP1MockVerifier v2 = new SP1MockVerifier();
        prov.setVerifier(address(v2), bytes32(uint256(0x1234)));
        assertEq(prov.verifier(), address(v2));
        vm.prank(address(0xdead));
        vm.expectRevert(BuktiProvenance.NotOwner.selector);
        prov.setVerifier(address(0), bytes32(0));
    }
}
