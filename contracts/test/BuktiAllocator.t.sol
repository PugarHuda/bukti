// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {SP1MockVerifier} from "@sp1-contracts/SP1MockVerifier.sol";
import {BuktiAttestation, BuktiOutput} from "../src/BuktiAttestation.sol";
import {BuktiAllocator} from "../src/BuktiAllocator.sol";

contract BuktiAllocatorTest is Test {
    SP1MockVerifier verifier;
    BuktiAttestation attest;
    BuktiAllocator alloc;

    // proof champion, mid, gate-boundary, losing, unproven
    address constant CHAMP = address(0x48F1);
    address constant MID = address(0x0A85);
    address constant LOSER = address(0x4CF8);
    address constant UNPROVEN = address(0xBEEF);
    bytes32 constant VKEY = bytes32(uint256(0xABCD));

    function setUp() public {
        verifier = new SP1MockVerifier();
        attest = new BuktiAttestation(address(verifier), VKEY);
        alloc = new BuktiAllocator(address(attest), 500); // gate 0.5

        BuktiOutput[] memory outs = new BuktiOutput[](3);
        outs[0] = _out(CHAMP, 4265);
        outs[1] = _out(MID, 949);
        outs[2] = _out(LOSER, -1316);
        attest.submitBatchAttestation(abi.encode(outs), "");
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

    function _cands() internal pure returns (address[] memory a) {
        a = new address[](4);
        a[0] = CHAMP;
        a[1] = MID;
        a[2] = LOSER;
        a[3] = UNPROVEN;
    }

    // ---- preview ----

    function test_preview_weightsByProvenScore() public view {
        uint256 pot = 10 ether;
        uint256 totalW = 4265 + 949;
        (uint256[] memory w, uint256[] memory amts, uint256 eligible) = alloc.previewAllocation(_cands(), pot);
        assertEq(eligible, 2); // CHAMP + MID; LOSER and UNPROVEN are 0
        assertEq(w[0], 4265);
        assertEq(w[1], 949);
        assertEq(w[2], 0); // losing trader weight 0
        assertEq(w[3], 0); // unproven weight 0
        // champion gets 4265/(4265+949) of the pot
        assertEq(amts[0], (pot * 4265) / totalW);
        assertEq(amts[1], (pot * 949) / totalW);
        assertEq(amts[2], 0);
        assertEq(amts[3], 0);
    }

    function test_preview_zeroWhenNoneEligible() public view {
        address[] memory only = new address[](2);
        only[0] = LOSER;
        only[1] = UNPROVEN;
        (, , uint256 eligible) = alloc.previewAllocation(only, 1 ether);
        assertEq(eligible, 0);
    }

    // ---- allocate ----

    function test_allocate_routesByProvenScore_loserGetsZero() public {
        alloc.allocate{value: 10 ether}(_cands());

        uint256 champShare = alloc.credited(CHAMP);
        uint256 midShare = alloc.credited(MID);
        assertEq(alloc.credited(LOSER), 0, "losing trader must get zero");
        assertEq(alloc.credited(UNPROVEN), 0, "unproven must get zero");
        assertGt(champShare, midShare, "champion outweighs mid");
        // full deposit routed (dust to top weight)
        assertEq(champShare + midShare, 10 ether);
        assertEq(alloc.totalAllocated(), 10 ether);
    }

    function test_allocate_dustToTopWeight() public {
        // an amount that doesn't divide evenly leaves dust → must go to CHAMP (top weight)
        uint256 amt = 10 ether + 7 wei;
        uint256 totalW = 4265 + 949;
        alloc.allocate{value: amt}(_cands());
        uint256 base = (amt * 4265) / totalW; // integer division (amt is a runtime uint256)
        // champion >= its base share (received the dust too)
        assertGe(alloc.credited(CHAMP), base);
        assertEq(alloc.credited(CHAMP) + alloc.credited(MID), amt);
    }

    function test_allocate_revertsWhenNoneEligible() public {
        address[] memory only = new address[](2);
        only[0] = LOSER;
        only[1] = UNPROVEN;
        vm.expectRevert(BuktiAllocator.NoEligibleCandidates.selector);
        alloc.allocate{value: 1 ether}(only);
    }

    function test_allocate_revertsOnEmpty() public {
        address[] memory none = new address[](0);
        vm.expectRevert(BuktiAllocator.NoCandidates.selector);
        alloc.allocate{value: 1 ether}(none);
    }

    // ---- withdraw (pull payment) ----

    function test_withdraw_recipientPullsShare() public {
        alloc.allocate{value: 10 ether}(_cands());
        uint256 champShare = alloc.credited(CHAMP);

        vm.deal(address(alloc), champShare); // ensure contract funded (it is, from allocate)
        uint256 balBefore = CHAMP.balance;
        vm.prank(CHAMP);
        alloc.withdraw();
        assertEq(CHAMP.balance, balBefore + champShare);
        assertEq(alloc.credited(CHAMP), 0);
    }

    function test_withdraw_revertsWhenNothing() public {
        vm.prank(UNPROVEN);
        vm.expectRevert(BuktiAllocator.NothingToWithdraw.selector);
        alloc.withdraw();
    }

    function test_allocate_accumulatesAcrossDeposits() public {
        alloc.allocate{value: 4 ether}(_cands());
        uint256 afterFirst = alloc.credited(CHAMP);
        alloc.allocate{value: 6 ether}(_cands());
        assertGt(alloc.credited(CHAMP), afterFirst);
        assertEq(alloc.totalAllocated(), 10 ether);
    }
}
