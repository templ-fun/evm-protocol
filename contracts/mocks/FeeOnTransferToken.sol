// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Simple fee-on-transfer token mock that burns a fee on every transfer.
contract FeeOnTransferToken is ERC20 {
    uint256 public immutable feeBps; // e.g., 100 = 1%

    constructor(string memory name_, string memory symbol_, uint256 feeBps_) ERC20(name_, symbol_) {
        feeBps = feeBps_;
        _mint(msg.sender, 1_000_000_000_000_000_000_000_000); // large supply, 18 decimals
    }

    // OpenZeppelin ERC20 v5 exposes _update; emulate fee by burning from sender
    function _update(address from, address to, uint256 value) internal virtual override {
        if (from == address(0) || to == address(0) || value == 0 || feeBps == 0) {
            super._update(from, to, value);
            return;
        }
        uint256 fee = (value * feeBps) / 10_000;
        uint256 receiveAmount = value - fee;
        // transfer receiveAmount to recipient; burn the fee from sender
        super._update(from, to, receiveAmount);
        if (fee > 0) {
            super._update(from, address(0), fee);
        }
    }
}
