// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Script, console2} from "forge-std/Script.sol";
import {WarehouseFactory} from "../src/WarehouseFactory.sol";
import {IWarehouseFactory} from "../src/interfaces/IWarehouseFactory.sol";

/// @notice Deploy a warehouse for a given owner by relaying their EIP-712
///         authorization (user signed off-chain). Factory is the proof of
///         lifecycle — see warehouse_deployments table in DB.
/// @dev Usage (after DeployFactory):
///   forge script script/DeployWarehouse.s.sol:DeployWarehouse \
///     --rpc-url $BASE_SEPOLIA_RPC_URL --broadcast \
///     --sig "run(address,bytes32,uint256,uint256,bytes)"
contract DeployWarehouse is Script {
    function run(
        address factoryAddress,
        bytes32 warehouseCodeHash,
        uint256 deploymentNonce,
        uint256 expiry,
        bytes calldata signature
    ) external returns (address warehouse) {
        uint256 deployerKey = vm.envUint("TREASURY_PRIVATE_KEY");

        IWarehouseFactory factory = IWarehouseFactory(factoryAddress);

        // The owner is recovered from the signature server-side in production.
        IWarehouseFactory.DeploymentAuthorization memory auth =
            IWarehouseFactory.DeploymentAuthorization({
                owner: vm.addr(deployerKey),
                warehouseCodeHash: warehouseCodeHash,
                deploymentNonce: deploymentNonce,
                expiry: expiry
            });

        vm.startBroadcast(deployerKey);
        warehouse = factory.deployWarehouse(auth, signature);
        vm.stopBroadcast();

        console2.log("Warehouse deployed at:", warehouse);
    }
}
