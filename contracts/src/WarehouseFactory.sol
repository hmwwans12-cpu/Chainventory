// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {IWarehouseFactory} from "./interfaces/IWarehouseFactory.sol";
import {Warehouse} from "./Warehouse.sol";

/// @title WarehouseFactory
/// @notice Deploys immutable Warehouse contracts (Chainventory v1).
/// @dev v1 immutable. EIP-712 authorization (name/version/chainId/factory bound
///      via domain separator), on-chain `deploymentNonce` per owner, and one
///      active warehouse per owner. Treasury is Proof Recorder only.
contract WarehouseFactory is IWarehouseFactory, EIP712("Chainventory", "1"), ReentrancyGuard {
    /// EIP-712 typehash for the deployment authorization struct.
    bytes32 private constant _DEPLOYMENT_AUTHORIZATION_TYPEHASH = keccak256(
        "DeploymentAuthorization(address owner,bytes32 warehouseCodeHash,uint256 deploymentNonce,uint256 expiry)"
    );

    address public immutable override proofRecorder;

    mapping(address owner => uint256 nonce) public override deploymentNonce;
    mapping(address owner => address warehouse) public override activeWarehouse;

    /// @param recorder_ The Proof Recorder (treasury). Immutable for v1.
    constructor(address recorder_) {
        require(recorder_ != address(0), "Factory: zero recorder");
        proofRecorder = recorder_;
    }

    /// @inheritdoc IWarehouseFactory
    function hasActiveWarehouse(address owner) public view override returns (bool) {
        return activeWarehouse[owner] != address(0);
    }

    /// @inheritdoc IWarehouseFactory
    function deployWarehouse(
        DeploymentAuthorization calldata auth,
        bytes calldata signature
    ) external override nonReentrant returns (address warehouse) {
        require(auth.owner != address(0), "Factory: zero owner");
        require(auth.deploymentNonce == deploymentNonce[auth.owner], "Factory: stale nonce");
        require(auth.expiry >= block.timestamp, "Factory: expired");
        require(!hasActiveWarehouse(auth.owner), "Factory: owner has active warehouse");

        // EIP-712 digest binds chainId + this factory (domain separator).
        bytes32 digest = _hashTypedDataV4(
            keccak256(
                abi.encode(
                    _DEPLOYMENT_AUTHORIZATION_TYPEHASH,
                    auth.owner,
                    auth.warehouseCodeHash,
                    auth.deploymentNonce,
                    auth.expiry
                )
            )
        );

        address signer = ECDSA.recover(digest, signature);
        require(signer == auth.owner, "Factory: invalid signature");

        warehouse = address(new Warehouse(address(this), auth.owner, proofRecorder));
        activeWarehouse[auth.owner] = warehouse;
        deploymentNonce[auth.owner] += 1;

        emit WarehouseDeployed(
            auth.owner,
            warehouse,
            auth.warehouseCodeHash,
            auth.deploymentNonce
        );
    }

    /// @notice Ownership transfer callback, callable ONLY by a warehouse
    ///         deployed by this factory. Keeps the one-active-warehouse map in
    ///         sync with on-chain ownership (ARSITEKTUR §4.4, §5).
    function onOwnershipTransfer(
        address previousOwner,
        address newOwner
    ) external {
        address warehouse = activeWarehouse[previousOwner];
        require(msg.sender == warehouse, "Factory: not active warehouse");
        require(newOwner != address(0), "Factory: zero new owner");
        require(newOwner != previousOwner, "Factory: same owner");
        require(!hasActiveWarehouse(newOwner), "Factory: new owner has active warehouse");

        activeWarehouse[previousOwner] = address(0);
        activeWarehouse[newOwner] = warehouse;
    }
}