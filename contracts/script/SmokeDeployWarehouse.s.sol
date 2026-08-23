// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Script, console2} from "forge-std/Script.sol";
import {WarehouseFactory} from "../src/WarehouseFactory.sol";
import {IWarehouseFactory} from "../src/interfaces/IWarehouseFactory.sol";
import {IWarehouse} from "../src/interfaces/IWarehouse.sol";

/// @notice End-to-end smoke test on Base Sepolia (Execution 02, Langkah 5).
/// @dev Reproduces the production relay flow: a fresh USER EOA signs the
///      EIP-712 DeploymentAuthorization off-chain, the TREASURY (Proof
///      Recorder) relays `deployWarehouse`, then asserts:
///        - warehouse.owner() == user
///        - warehouse.proofRecorder() == treasury
///        - factory.activeWarehouse(user) == warehouse
///        - factory.deploymentNonce(user) == 1
///        - a second deployment for the same owner REVERTS
/// @dev Usage:
///   forge script script/SmokeDeployWarehouse.s.sol:SmokeDeployWarehouse \
///     --rpc-url $BASE_SEPOLIA_RPC_URL --broadcast
contract SmokeDeployWarehouse is Script {
    bytes32 private constant _TYPEHASH = keccak256(
        "DeploymentAuthorization(address owner,bytes32 warehouseCodeHash,uint256 deploymentNonce,uint256 expiry)"
    );

    function run() external {
        uint256 treasuryKey = vm.envUint("TREASURY_PRIVATE_KEY");
        address treasury = vm.addr(treasuryKey);

        address factoryAddress = vm.envAddress("WAREHOUSE_FACTORY_ADDRESS");
        bytes32 codeHash = vm.envBytes32("WAREHOUSE_CODE_HASH");
        uint256 expiry = block.timestamp + 1 days;

        uint256 userKey = vm.envUint("SMOKE_USER_PRIVATE_KEY");
        address user = vm.addr(userKey);

        WarehouseFactory factory = WarehouseFactory(factoryAddress);
        require(factory.deploymentNonce(user) == 0, "Smoke: user nonce must be 0");

        // Blok scope: bebaskan slot stack (auth/signature/warehouse) sebelum
        // fase kedua — solc >=0.8.32 lebih ketat soal stack too deep.
        {
            IWarehouseFactory.DeploymentAuthorization memory auth =
                _buildAuth(user, codeHash, 0, expiry);
            bytes memory signature = _signAuth(userKey, user, codeHash, 0, expiry, factoryAddress);

            vm.startBroadcast(treasuryKey);
            address warehouse = factory.deployWarehouse(auth, signature);
            vm.stopBroadcast();

            console2.log("smoke: user =", user);
            console2.log("smoke: treasury (proof recorder) =", treasury);
            console2.log("smoke: warehouse deployed =", warehouse);

            require(IWarehouse(warehouse).owner() == user, "Smoke: warehouse.owner != user");
            require(
                IWarehouse(warehouse).proofRecorder() == treasury,
                "Smoke: warehouse.proofRecorder != treasury"
            );
            require(
                IWarehouse(warehouse).factory() == factoryAddress,
                "Smoke: warehouse.factory != factory"
            );
            require(factory.activeWarehouse(user) == warehouse, "Smoke: activeWarehouse != warehouse");
            require(factory.deploymentNonce(user) == 1, "Smoke: nonce != 1");
            require(factory.hasActiveWarehouse(user), "Smoke: hasActiveWarehouse != true");
        }

        IWarehouseFactory.DeploymentAuthorization memory auth2 =
            _buildAuth(user, codeHash, 1, expiry);
        bytes memory signature2 = _signAuth(userKey, user, codeHash, 1, expiry, factoryAddress);

        (bool ok, bytes memory ret) = address(factory).call(
            abi.encodeCall(factory.deployWarehouse, (auth2, signature2))
        );
        require(!ok, "Smoke: second deployment did NOT revert");
        console2.log("smoke: second deployment reverted as expected");
        console2.log("smoke: revert data =", vm.toString(ret));

        console2.log("smoke: PASS");
    }

    function _buildAuth(
        address owner,
        bytes32 codeHash,
        uint256 nonce,
        uint256 expiry
    ) private pure returns (IWarehouseFactory.DeploymentAuthorization memory) {
        return IWarehouseFactory.DeploymentAuthorization({
            owner: owner,
            warehouseCodeHash: codeHash,
            deploymentNonce: nonce,
            expiry: expiry
        });
    }

    function _signAuth(
        uint256 key,
        address owner,
        bytes32 codeHash,
        uint256 nonce,
        uint256 expiry,
        address factory
    ) private view returns (bytes memory) {
        bytes32 domain = keccak256(
            abi.encode(
                keccak256(
                    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
                ),
                keccak256("Chainventory"),
                keccak256("1"),
                block.chainid,
                factory
            )
        );
        bytes32 structHash = keccak256(abi.encode(_TYPEHASH, owner, codeHash, nonce, expiry));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domain, structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }
}
