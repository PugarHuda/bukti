// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {SP1MockVerifier} from "@sp1-contracts/SP1MockVerifier.sol";
import {BuktiFullProof, FullOutput} from "../src/BuktiFullProof.sol";

contract BuktiFullProofTest is Test {
    SP1MockVerifier verifier;
    BuktiFullProof full;
    bytes32 constant VKEY = bytes32(uint256(0xABCD));
    bytes32 constant BH = bytes32(uint256(0xB10C));

    function setUp() public {
        verifier = new SP1MockVerifier();
        full = new BuktiFullProof(address(verifier), VKEY);
    }

    function _out(uint32 n, uint64 vol) internal pure returns (bytes memory) {
        return abi.encode(FullOutput({ numSwaps: n, totalVolumeUsdE6: vol, firstBlockHash: BH, allIncluded: true }));
    }

    function test_submitAndStore() public {
        full.submitFullProof(_out(3, 303200), "");
        (uint32 n, uint64 vol, bytes32 bh, bool ok) = full.latest();
        assertEq(n, 3);
        assertEq(vol, 303200);
        assertEq(bh, BH);
        assertTrue(ok);
        assertEq(full.proofCount(), 1);
    }

    function test_emits() public {
        vm.expectEmit(false, false, false, true);
        emit BuktiFullProof.FullProofVerified(3, 303200, BH);
        full.submitFullProof(_out(3, 303200), "");
    }

    function test_countIncrements() public {
        full.submitFullProof(_out(2, 100), "");
        full.submitFullProof(_out(5, 500), "");
        assertEq(full.proofCount(), 2);
        (uint32 n,,,) = full.latest();
        assertEq(n, 5);
    }

    function test_setVerifierOnlyOwner() public {
        SP1MockVerifier v2 = new SP1MockVerifier();
        full.setVerifier(address(v2), bytes32(uint256(0x1234)));
        assertEq(full.verifier(), address(v2));
        vm.prank(address(0xdead));
        vm.expectRevert(BuktiFullProof.NotOwner.selector);
        full.setVerifier(address(0), bytes32(0));
    }
}
