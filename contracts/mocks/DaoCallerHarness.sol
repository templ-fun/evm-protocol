// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {TEMPL} from "../TEMPL.sol";

/// @dev Harness that triggers onlyDAO externals via self-calls to cover wrapper paths
contract DaoCallerHarness is TEMPL {
    constructor(address priest, address protocolFeeRecipient, address token, uint256 entryFee)
        TEMPL(priest, protocolFeeRecipient, token, entryFee)
    {}

    function daoWithdraw(address token, address recipient, uint256 amount, string calldata reason) external {
        this.withdrawTreasuryDAO(token, recipient, amount, reason);
    }

    function daoWithdrawAll(address token, address recipient, string calldata reason) external {
        this.withdrawAllTreasuryDAO(token, recipient, reason);
    }

    function daoUpdate(address token, uint256 fee) external {
        this.updateConfigDAO(token, fee);
    }

    function daoPause(bool p) external {
        this.setPausedDAO(p);
    }

    function daoDisband() external {
        this.disbandTreasuryDAO();
    }

    // test helper to force invalid action path
    function corruptAction(uint256 proposalId, uint8 val) external {
        proposals[proposalId].action = Action(val);
    }
}
