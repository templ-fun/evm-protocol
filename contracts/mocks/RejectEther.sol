// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

/// @dev Test helper that always reverts when receiving ETH transfers.
contract RejectEther {
    receive() external payable {
        revert("RejectEther: no receive");
    }
}
