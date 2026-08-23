// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Test} from "forge-std/Test.sol";

import {WarehouseFactory} from "../src/WarehouseFactory.sol";
import {IWarehouseFactory} from "../src/interfaces/IWarehouseFactory.sol";

/// @notice Shared helpers for Chainventory Forge tests.
abstract contract BaseTest is Test {
    WarehouseFactory internal factory;
    IWarehouseFactory internal factoryIface;

    address internal recorder = address(0xBEEF);
    address internal owner1;
    uint256 internal owner1Key = 0x1111;
    address internal owner2;
    uint256 internal owner2Key = 0x2222;
    address internal stranger = address(0x3333);

    string internal constant DOMAIN_NAME = "Chainventory";
    string internal constant DOMAIN_VERSION = "1";

    // EIP-712 typehash matching the factory's DeploymentAuthorization struct.
    bytes32 internal constant DEPLOYMENT_AUTH_TYPEHASH = keccak256(
        "DeploymentAuthorization(address owner,bytes32 warehouseCodeHash,uint256 deploymentNonce,uint256 expiry)"
    );

    function setUp() public virtual {
        owner1 = vm.addr(owner1Key);
        owner2 = vm.addr(owner2Key);
        factory = new WarehouseFactory(recorder);
        factoryIface = IWarehouseFactory(address(factory));
    }

    /// @dev Constructs the EIP-712 digest the factory will verify.
    function deploymentDigest(
        address owner_,
        bytes32 warehouseCodeHash_,
        uint256 nonce_,
        uint256 expiry_,
        uint256 chainId_,
        address factory_
    ) internal pure returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                DEPLOYMENT_AUTH_TYPEHASH,
                owner_,
                warehouseCodeHash_,
                nonce_,
                expiry_
            )
        );
        bytes32 domainSeparator = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes(DOMAIN_NAME)),
                keccak256(bytes(DOMAIN_VERSION)),
                chainId_,
                factory_
            )
        );
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
    }

function signDeployment(
        uint256 privateKey,
        address owner_,
        bytes32 warehouseCodeHash_,
        uint256 nonce_,
        uint256 expiry_,
        uint256 chainId_,
        address factory_
    ) internal view returns (bytes memory) {
        bytes32 digest = deploymentDigest(
            owner_, warehouseCodeHash_, nonce_, expiry_, chainId_, factory_
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);
        return abi.encodePacked(r, s, v);
    }

    function buildAuth(
        address owner_,
        bytes32 codeHash_,
        uint256 nonce_,
        uint256 expiry_
    ) internal pure returns (IWarehouseFactory.DeploymentAuthorization memory) {
        return IWarehouseFactory.DeploymentAuthorization({
            owner: owner_,
            warehouseCodeHash: codeHash_,
            deploymentNonce: nonce_,
            expiry: expiry_
        });
    }
}
