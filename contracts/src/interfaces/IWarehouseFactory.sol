// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {IWarehouse} from "./IWarehouse.sol";

/// @title IWarehouseFactory
/// @notice Factory for immutable warehouse contracts (Chainventory v1).
/// @dev Enforces EIP-712 deployment authorization, on-chain deploymentNonce,
///      and one active warehouse per owner (ARSITEKTUR §5, PRD §8).
interface IWarehouseFactory {
    /// @notice EIP-712 typed data used to authorize a warehouse deployment.
    struct DeploymentAuthorization {
        address owner;
        bytes32 warehouseCodeHash;
        uint256 deploymentNonce;
        uint256 expiry;
    }

    /// @notice Emitted when a warehouse is deployed.
    event WarehouseDeployed(
        address indexed owner,
        address indexed warehouse,
        bytes32 indexed warehouseCodeHash,
        uint256 deploymentNonce
    );

    /// @notice Deploy a warehouse after verifying the owner's EIP-712 signature.
    /// @dev Reverts on wrong nonce, expired expiry, wrong chain/factory
    ///      (domain separator), duplicate active warehouse, or bad signature.
    function deployWarehouse(
        DeploymentAuthorization calldata auth,
        bytes calldata signature
    ) external returns (address warehouse);

    /// @notice Current deployment nonce for an owner address.
    function deploymentNonce(address owner) external view returns (uint256);

    /// @notice Active warehouse per owner (zero address if none).
    function activeWarehouse(address owner) external view returns (address);

    /// @notice Whether an owner already has an active warehouse.
    function hasActiveWarehouse(address owner) external view returns (bool);

    /// @notice The Proof Recorder (treasury) that will own recording on all warehouses.
    function proofRecorder() external view returns (address);

    /// @notice Ownership transfer callback from a deployed warehouse.
    /// @dev Callable only by a warehouse deployed by this factory; keeps the
    ///      one-active-warehouse map in sync with on-chain ownership.
    function onOwnershipTransfer(address previousOwner, address newOwner) external;
}