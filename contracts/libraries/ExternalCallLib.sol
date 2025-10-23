// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

/// @title ExternalCallLib
/// @notice Thin helper to execute low-level calls and bubble up revert data verbatim.
/// @dev Using a deployed library helps reduce bytecode size of the calling module.
/// @author Templ
library ExternalCallLib {
    /// @notice Execute a low-level call and return the returndata or revert with the same data.
    /// @param target Destination contract address.
    /// @param value ETH value to forward with the call.
    /// @param callData ABI-encoded call data (selector + params).
    /// @return ret Raw returndata returned by the call when it succeeds.
    function perform(address target, uint256 value, bytes memory callData) public returns (bytes memory ret) {
        (bool success, bytes memory r) = target.call{ value: value }(callData);
        if (!success) {
            assembly ("memory-safe") {
                revert(add(r, 32), mload(r))
            }
        }
        return r;
    }
}
