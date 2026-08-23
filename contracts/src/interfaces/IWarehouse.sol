// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

/// @title IWarehouse
/// @notice Minimal warehouse contract interface (Chainventory v1).
/// @dev Immutable v1 (ARSITEKTUR §5). Proofs are idempotent by `proofId`.
interface IWarehouse {
    /// @notice Proof recorded on-chain. No raw inventory data lives on chain.
    struct Proof {
        bytes32 proofId;
        bytes32 payloadHash;
        address actor;
        string eventType;
        uint256 timestamp;
        bytes txMetadata;
        bool recorded;
    }

    /// @notice Emitted when a proof is recorded.
    event ProofRecorded(
        bytes32 indexed proofId,
        bytes32 payloadHash,
        address indexed actor,
        string eventType,
        uint256 timestamp
    );

    /// @notice Emitted when the owner wallet changes (ownership transfer).
    event OwnerChanged(address indexed previousOwner, address indexed newOwner);

    /// @notice Legacy deployment metadata. v2 stock proofs are submitted by
    /// the acting wallet, which pays the gas itself.
    function proofRecorder() external view returns (address);

    /// @notice The owning wallet (application user's primary wallet).
    function owner() external view returns (address);

    /// @notice Record a proof. Caller must equal `actor`.
    /// @dev Reverts if the proofId has already been recorded (idempotency).
    function recordProof(
        bytes32 proofId,
        bytes32 payloadHash,
        address actor,
        string calldata eventType,
        uint256 timestamp,
        bytes calldata txMetadata
    ) external;

    /// @notice Returns whether a proofId has been recorded.
    function isProofRecorded(bytes32 proofId) external view returns (bool);

    /// @notice Transfer warehouse ownership. Only `owner` may call.
    function transferOwnership(address newOwner) external;

    /// @notice Factory that deployed this warehouse.
    function factory() external view returns (address);
}
