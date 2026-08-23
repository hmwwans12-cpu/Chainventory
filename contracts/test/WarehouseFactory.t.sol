// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {BaseTest} from "./Base.t.sol";
import {Warehouse} from "../src/Warehouse.sol";

/// @notice Factory tests: EIP-712 signature, nonce, expiry, chain/factory
///         mismatch, one-active-warehouse, access control.
contract WarehouseFactoryTest is BaseTest {
    bytes32 internal constant CODE_1 = keccak256("code-1");
    bytes32 internal constant CODE_2 = keccak256("code-2");

    // ------------------------------------------------------------ success

    function test_DeployHappyPath() public {
        uint256 expiry = block.timestamp + 1 hours;
        bytes memory sig = signDeployment(
            owner1Key, owner1, CODE_1, 0, expiry, block.chainid, address(factory)
        );

        address wh = factory.deployWarehouse(buildAuth(owner1, CODE_1, 0, expiry), sig);

        assertTrue(wh != address(0));
        assertEq(factory.activeWarehouse(owner1), wh);
        assertEq(factory.hasActiveWarehouse(owner1), true);
        assertEq(factory.deploymentNonce(owner1), 1);
        assertEq(Warehouse(wh).owner(), owner1);
        assertEq(Warehouse(wh).proofRecorder(), recorder);
    }

    function test_NonceIncrementsPerOwner() public {
        uint256 expiry = block.timestamp + 1 hours;

        // owner1: nonce 0 -> 1.
        bytes memory sig1 = signDeployment(
            owner1Key, owner1, CODE_1, 0, expiry, block.chainid, address(factory)
        );
        factory.deployWarehouse(buildAuth(owner1, CODE_1, 0, expiry), sig1);
        assertEq(factory.deploymentNonce(owner1), 1);

        // owner2: independent nonce 0 -> 1.
        bytes memory sig2 = signDeployment(
            owner2Key, owner2, CODE_2, 0, expiry, block.chainid, address(factory)
        );
        factory.deployWarehouse(buildAuth(owner2, CODE_2, 0, expiry), sig2);
        assertEq(factory.deploymentNonce(owner2), 1);
    }

    // --------------------------------------------------------- EIP-712 checks

    function test_WrongSignature_reverts() public {
        uint256 expiry = block.timestamp + 1 hours;
        // Signature by owner2 while auth.owner is owner1.
        bytes memory sig = signDeployment(
            owner2Key, owner1, CODE_1, 0, expiry, block.chainid, address(factory)
        );
        vm.expectRevert(bytes("Factory: invalid signature"));
        factory.deployWarehouse(buildAuth(owner1, CODE_1, 0, expiry), sig);
    }

    function test_ExpiredAuthorization_reverts() public {
        uint256 past = block.timestamp - 1;
        bytes memory sig = signDeployment(
            owner1Key, owner1, CODE_1, 0, past, block.chainid, address(factory)
        );
        vm.expectRevert(bytes("Factory: expired"));
        factory.deployWarehouse(buildAuth(owner1, CODE_1, 0, past), sig);
    }

    function test_StaleNonce_reverts() public {
        uint256 expiry = block.timestamp + 1 hours;

        bytes memory sig1 = signDeployment(
            owner1Key, owner1, CODE_1, 0, expiry, block.chainid, address(factory)
        );
        factory.deployWarehouse(buildAuth(owner1, CODE_1, 0, expiry), sig1);

        // Replay with the consumed nonce 0.
        vm.expectRevert(bytes("Factory: stale nonce"));
        factory.deployWarehouse(buildAuth(owner1, CODE_2, 0, expiry), sig1);
    }

    function test_WrongChainId_reverts() public {
        uint256 expiry = block.timestamp + 1 hours;
        bytes memory sig = signDeployment(
            owner1Key, owner1, CODE_1, 0, expiry, 999999, address(factory)
        );
        vm.expectRevert(bytes("Factory: invalid signature"));
        factory.deployWarehouse(buildAuth(owner1, CODE_1, 0, expiry), sig);
    }

    function test_WrongFactoryAddress_reverts() public {
        uint256 expiry = block.timestamp + 1 hours;
        bytes memory sig = signDeployment(
            owner1Key, owner1, CODE_1, 0, expiry, block.chainid, address(0xDEAD)
        );
        vm.expectRevert(bytes("Factory: invalid signature"));
        factory.deployWarehouse(buildAuth(owner1, CODE_1, 0, expiry), sig);
    }

    function test_ReplayWithDifferentCodeHash_butSameNonce_reverts() public {
        uint256 expiry = block.timestamp + 1 hours;
        bytes memory sig = signDeployment(
            owner1Key, owner1, CODE_1, 0, expiry, block.chainid, address(factory)
        );
        factory.deployWarehouse(buildAuth(owner1, CODE_1, 0, expiry), sig);

        // Same nonce, different code hash — must fail (nonce is consumed).
        vm.expectRevert(bytes("Factory: stale nonce"));
        factory.deployWarehouse(buildAuth(owner1, CODE_2, 0, expiry), sig);
    }

    // ------------------------------------------------- one-active-warehouse

    function test_SecondDeploymentForSameOwner_reverts() public {
        uint256 expiry = block.timestamp + 1 hours;

        bytes memory sig1 = signDeployment(
            owner1Key, owner1, CODE_1, 0, expiry, block.chainid, address(factory)
        );
        factory.deployWarehouse(buildAuth(owner1, CODE_1, 0, expiry), sig1);

        bytes memory sig2 = signDeployment(
            owner1Key, owner1, CODE_2, 1, expiry, block.chainid, address(factory)
        );
        vm.expectRevert(bytes("Factory: owner has active warehouse"));
        factory.deployWarehouse(buildAuth(owner1, CODE_2, 1, expiry), sig2);
    }

    // ------------------------------------------------------------- recorder

    function test_ProofRecorderIsImmutable() public view {
        assertEq(factory.proofRecorder(), recorder);
    }

    function test_OnlyActiveWarehouseCanCallOnOwnershipTransfer() public {
        vm.expectRevert(bytes("Factory: not active warehouse"));
        factory.onOwnershipTransfer(owner1, owner2);
    }
}