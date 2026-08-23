// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {BaseTest} from "./Base.t.sol";
import {Warehouse} from "../src/Warehouse.sol";
import {IWarehouse} from "../src/interfaces/IWarehouse.sol";

/// @notice Warehouse contract tests: proof idempotency, access control,
///         ownership transfer + factory sync.
contract WarehouseTest is BaseTest {
    Warehouse internal warehouse;

    bytes32 internal constant PROOF_ID = keccak256("proof-1");
    bytes32 internal constant HASH = keccak256("payload-hash");

    function setUp() public override {
        super.setUp();

        // Deploy a warehouse for owner1 via the factory with a valid signature.
        uint256 expiry = block.timestamp + 1 hours;
        bytes memory sig = signDeployment(
            owner1Key, owner1, keccak256("code-1"), 0, expiry, block.chainid, address(factory)
        );
        address wh = factory.deployWarehouse(
            buildAuth(owner1, keccak256("code-1"), 0, expiry), sig
        );
        warehouse = Warehouse(wh);
    }

    // ------------------------------------------------------------------ proof

    function test_ActorCanRecordProof() public {
        vm.prank(owner1);
        warehouse.recordProof(PROOF_ID, HASH, owner1, "STOCK_IN", block.timestamp, "0x");
        assertTrue(warehouse.isProofRecorded(PROOF_ID));
    }

    function test_ProofIdempotent_revertsOnDuplicate() public {
        vm.startPrank(owner1);
        warehouse.recordProof(PROOF_ID, HASH, owner1, "STOCK_IN", block.timestamp, "0x");
        vm.expectRevert(bytes("Warehouse: proof already recorded"));
        warehouse.recordProof(PROOF_ID, HASH, owner1, "STOCK_IN", block.timestamp, "0x");
        vm.stopPrank();
    }

    function test_EmptyProofId_reverts() public {
        vm.prank(owner1);
        vm.expectRevert(bytes("Warehouse: empty proofId"));
        warehouse.recordProof(bytes32(0), HASH, owner1, "STOCK_IN", block.timestamp, "0x");
    }

    function test_CallerCannotSpoofActor() public {
        vm.prank(stranger);
        vm.expectRevert(bytes("Warehouse: actor must be caller"));
        warehouse.recordProof(PROOF_ID, HASH, owner1, "STOCK_IN", block.timestamp, "0x");
    }

    // ------------------------------------------------------------- ownership

    function test_OwnerCanTransferOwnership_andFactorySyncs() public {
        vm.prank(owner1);
        warehouse.transferOwnership(owner2);

        assertEq(warehouse.owner(), owner2);
        assertEq(factory.activeWarehouse(owner1), address(0));
        assertEq(factory.activeWarehouse(owner2), address(warehouse));
    }

    function test_NonOwnerCannotTransferOwnership() public {
        vm.prank(stranger);
        vm.expectRevert(bytes("Warehouse: not owner"));
        warehouse.transferOwnership(owner2);
    }

    function test_ZeroNewOwner_reverts() public {
        vm.prank(owner1);
        vm.expectRevert(bytes("Warehouse: zero new owner"));
        warehouse.transferOwnership(address(0));
    }

    function test_TransferToOwnerWithActiveWarehouse_reverts() public {
        // owner2 deploys their own warehouse.
        uint256 expiry = block.timestamp + 1 hours;
        bytes memory sig = signDeployment(
            owner2Key, owner2, keccak256("code-2"), 0, expiry, block.chainid, address(factory)
        );
        factory.deployWarehouse(buildAuth(owner2, keccak256("code-2"), 0, expiry), sig);

        vm.prank(owner1);
        vm.expectRevert(bytes("Factory: new owner has active warehouse"));
        warehouse.transferOwnership(owner2);
    }

    // ------------------------------------------------------------- immutables

    function test_ImmutableValuesAreSet() public view {
        assertEq(warehouse.proofRecorder(), recorder);
        assertEq(warehouse.factory(), address(factory));
        assertEq(warehouse.owner(), owner1);
    }

    function test_RecorderCannotChange() public view {
        // No setter exists; recording from a different address must fail even
        // if the contract had a function — it does not, so this confirms the
        // immutable storage slot returns the deployment-time value.
        assertEq(warehouse.proofRecorder(), recorder);
    }
}
