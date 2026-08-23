// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {IWarehouse} from "./interfaces/IWarehouse.sol";
import {IWarehouseFactory} from "./interfaces/IWarehouseFactory.sol";

/// @title Warehouse
/// @notice Minimal immutable warehouse contract (Chainventory v1).
/// @dev v2 is immutable. Proofs are paid for by the acting member wallet;
///      membership remains enforced by the BFF before it creates an intent.
///      The contract enforces that a caller can only record a proof for itself.
contract Warehouse is IWarehouse {
    address public immutable override factory;
    address public immutable override proofRecorder;

    address public override owner;

    mapping(bytes32 proofId => Proof) private _proofs;

    modifier onlyOwner() {
        require(msg.sender == owner, "Warehouse: not owner");
        _;
    }

    /// @param factory_ The factory that deployed this contract.
    /// @param owner_   The owning wallet (application user's primary wallet).
    /// @param recorder_ Retained as deployment metadata for v1 compatibility.
    /// Treasury is no longer used for stock movement proofs in v2.
    constructor(address factory_, address owner_, address recorder_) {
        require(factory_ != address(0), "Warehouse: zero factory");
        require(owner_ != address(0), "Warehouse: zero owner");
        require(recorder_ != address(0), "Warehouse: zero recorder");

        factory = factory_;
        owner = owner_;
        proofRecorder = recorder_;
    }

    /// @inheritdoc IWarehouse
    function recordProof(
        bytes32 proofId,
        bytes32 payloadHash,
        address actor,
        string calldata eventType,
        uint256 timestamp,
        bytes calldata txMetadata
    ) external override {
        require(proofId != bytes32(0), "Warehouse: empty proofId");
        require(!_proofs[proofId].recorded, "Warehouse: proof already recorded");
        require(actor == msg.sender, "Warehouse: actor must be caller");

        _proofs[proofId] = Proof({
            proofId: proofId,
            payloadHash: payloadHash,
            actor: actor,
            eventType: eventType,
            timestamp: timestamp,
            txMetadata: txMetadata,
            recorded: true
        });

        emit ProofRecorded(proofId, payloadHash, actor, eventType, timestamp);
    }

    /// @inheritdoc IWarehouse
    function isProofRecorded(bytes32 proofId) external view override returns (bool) {
        return _proofs[proofId].recorded;
    }

    /// @inheritdoc IWarehouse
    function transferOwnership(address newOwner) external override onlyOwner {
        require(newOwner != address(0), "Warehouse: zero new owner");
        require(newOwner != owner, "Warehouse: same owner");

        address previousOwner = owner;
        owner = newOwner;
        emit OwnerChanged(previousOwner, newOwner);

        // Keep factory one-active-warehouse map in sync with on-chain ownership.
        IWarehouseFactory(factory).onOwnershipTransfer(previousOwner, newOwner);
    }
}
