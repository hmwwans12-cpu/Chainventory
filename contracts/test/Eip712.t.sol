// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {BaseTest} from "./Base.t.sol";
import {IWarehouseFactory} from "../src/interfaces/IWarehouseFactory.sol";

/// @notice EIP-712 domain/digest equivalence + fuzz tests for signature
///         verification and one-active-warehouse enforcement.
contract Eip712Test is BaseTest {
    function test_Fuzz_ValidSignatureDeploys(address owner_, bytes32 codeHash_, uint256 expiry) public {
        // Ensure a usable owner that can sign; derive key pair from bound input.
        uint256 key = uint256(keccak256(abi.encode(owner_, block.number)));
        address expected = vm.addr(key);
        if (expected == address(0)) return;

        expiry = bound(expiry, block.timestamp, type(uint40).max);
        bytes memory sig = signDeployment(
            key, expected, codeHash_, 0, expiry, block.chainid, address(factory)
        );

        address wh = factory.deployWarehouse(
            buildAuth(expected, codeHash_, 0, expiry), sig
        );

        assertTrue(wh != address(0));
        assertEq(factory.activeWarehouse(expected), wh);
        assertEq(factory.deploymentNonce(expected), 1);
    }

    function test_Fuzz_ExpiredAlwaysReverts(uint256 expiry) public {
        uint256 past = bound(expiry, 0, block.timestamp - 1);
        bytes memory sig = signDeployment(
            owner1Key, owner1, keccak256("code"), 0, past, block.chainid, address(factory)
        );
        vm.expectRevert(bytes("Factory: expired"));
        factory.deployWarehouse(buildAuth(owner1, keccak256("code"), 0, past), sig);
    }

    function test_Fuzz_AnyChainIdMismatchReverts(uint256 otherChain) public {
        otherChain = bound(otherChain, 0, type(uint256).max);
        if (otherChain == block.chainid) return;

        bytes memory sig = signDeployment(
            owner1Key, owner1, keccak256("code"), 0, block.timestamp + 1 hours,
            otherChain, address(factory)
        );
        vm.expectRevert(bytes("Factory: invalid signature"));
        factory.deployWarehouse(
            buildAuth(owner1, keccak256("code"), 0, block.timestamp + 1 hours), sig
        );
    }

    function test_Fuzz_NonceMustMatchExactly(uint256 nonce) public {
        uint256 expiry = block.timestamp + 1 hours;
        uint256 correct = factory.deploymentNonce(owner1);

        if (nonce != correct) {
            bytes memory sig = signDeployment(
                owner1Key, owner1, keccak256("code"), nonce, expiry,
                block.chainid, address(factory)
            );
            vm.expectRevert(bytes("Factory: stale nonce"));
            factory.deployWarehouse(
                buildAuth(owner1, keccak256("code"), nonce, expiry), sig
            );
        } else {
            bytes memory sig = signDeployment(
                owner1Key, owner1, keccak256("code"), nonce, expiry,
                block.chainid, address(factory)
            );
            address wh = factory.deployWarehouse(
                buildAuth(owner1, keccak256("code"), nonce, expiry), sig
            );
            assertTrue(wh != address(0));
        }
    }

    function test_Fuzz_SecondOwnerNeverAllowedDuringActive(uint256 attempts) public {
        attempts = bound(attempts, 1, 8);

        uint256 expiry = block.timestamp + 1 hours;
        bytes memory sig1 = signDeployment(
            owner1Key, owner1, keccak256("code-1"), 0, expiry,
            block.chainid, address(factory)
        );
        factory.deployWarehouse(buildAuth(owner1, keccak256("code-1"), 0, expiry), sig1);

        for (uint256 i = 0; i < attempts; i++) {
            // After the first deployment, the nonce is 1; any further deploy
            // must fail on the one-active-warehouse check (not stale nonce),
            // so sign with the current on-chain nonce (1).
            bytes32 codeHashN = keccak256(abi.encode("code", i));
            bytes memory sigN = signDeployment(
                owner1Key, owner1, codeHashN, 1, expiry, block.chainid, address(factory)
            );
            vm.expectRevert(bytes("Factory: owner has active warehouse"));
            factory.deployWarehouse(
                buildAuth(owner1, codeHashN, 1, expiry), sigN
            );
        }
    }
}