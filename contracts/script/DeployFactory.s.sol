// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import {Script, console2} from "forge-std/Script.sol";
import {WarehouseFactory} from "../src/WarehouseFactory.sol";

/// @notice Deploy the WarehouseFactory (v1 immutable) to Base Sepolia.
/// @dev Usage:
///   forge script script/DeployFactory.s.sol:DeployFactory \
///     --rpc-url $BASE_SEPOLIA_RPC_URL \
///     --private-key $TREASURY_PRIVATE_KEY \
///     --broadcast --verify
///   Proof Recorder is the treasury address (msg.sender).
contract DeployFactory is Script {
    function run() external returns (WarehouseFactory factory) {
        uint256 deployerKey = vm.envUint("TREASURY_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        vm.startBroadcast(deployerKey);
        factory = new WarehouseFactory(deployer);
        vm.stopBroadcast();

        console2.log("WarehouseFactory deployed at:", address(factory));
        console2.log("Proof Recorder (treasury):", deployer);
    }
}
