// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

/// @title ExternalCallLib
/// @notice Helpers to perform low-level external calls while bubbling up revert data.
/// @author templ.fun
/// @dev Using a deployed library helps reduce bytecode size of the calling module.
library ExternalCallLib {
    /// @notice Performs a low-level call to `target` forwarding `value` and `callData`.
    /// @param target Destination contract address.
    /// @param value ETH value to forward with the call.
    /// @param callData ABI-encoded calldata to execute on the target.
    /// @return ret Raw return data from the external call.
    function perform(address target, uint256 value, bytes memory callData) public returns (bytes memory ret) {
        (bool success, bytes memory _ret) = target.call{ value: value }(callData);
        if (!success) {
            assembly ("memory-safe") {
                revert(add(_ret, 32), mload(_ret))
            }
        }
        return _ret;
    }
}
