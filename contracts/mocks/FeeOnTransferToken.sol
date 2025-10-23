// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Simple fee-on-transfer ERC20 used for negative tests (not for production use).
/// Takes a flat feeBps from every transfer/transferFrom and sends it to a sink.
contract FeeOnTransferToken is ERC20 {
    uint256 public immutable feeBps; // basis points out of 10_000
    address public immutable feeSink;

    constructor(string memory name_, string memory symbol_, uint256 _feeBps, address _sink)
        ERC20(name_, symbol_)
    {
        require(_feeBps <= 1000, "fee too high");
        require(_sink != address(0), "sink zero");
        feeBps = _feeBps;
        feeSink = _sink;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        // Apply fee only on real transfers (exclude minting/burning) and non-zero value.
        if (from != address(0) && to != address(0) && value != 0 && feeBps != 0) {
            uint256 fee = (value * feeBps) / 10_000;
            uint256 remaining = value - fee;
            super._update(from, feeSink, fee);
            super._update(from, to, remaining);
        } else {
            super._update(from, to, value);
        }
    }
}
