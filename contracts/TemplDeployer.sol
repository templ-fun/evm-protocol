// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {TEMPL} from "./TEMPL.sol";
import {CreateConfig} from "./TemplFactoryTypes.sol";

interface ITemplDeployer {
    function deployTempl(
        CreateConfig memory cfg,
        address protocolFeeRecipient,
        uint256 protocolBps,
        address membershipModule,
        address treasuryModule,
        address governanceModule,
        address councilModule
    ) external returns (address templAddress);
}

/// @notice Thin wrapper that deploys a fresh TEMPL instance.
/// @dev Keeps the heavy creation bytecode out of the factory so the factory stays within size limits.
contract TemplDeployer is ITemplDeployer {
    function deployTempl(
        CreateConfig memory cfg,
        address protocolFeeRecipient,
        uint256 protocolBps,
        address membershipModule,
        address treasuryModule,
        address governanceModule,
        address councilModule
    ) external returns (address templAddress) {
        uint256 burnBps = uint256(cfg.burnBps);
        uint256 treasuryBps = uint256(cfg.treasuryBps);
        uint256 memberPoolBps = uint256(cfg.memberPoolBps);

        TEMPL templ = new TEMPL(
            cfg.priest,
            protocolFeeRecipient,
            cfg.token,
            cfg.entryFee,
            burnBps,
            treasuryBps,
            memberPoolBps,
            protocolBps,
            cfg.quorumBps,
            cfg.executionDelaySeconds,
            cfg.burnAddress,
            cfg.priestIsDictator,
            cfg.maxMembers,
            cfg.name,
            cfg.description,
            cfg.logoLink,
            cfg.proposalFeeBps,
            cfg.referralShareBps,
            cfg.yesVoteThresholdBps,
            cfg.instantQuorumBps,
            cfg.councilMode,
            membershipModule,
            treasuryModule,
            governanceModule,
            councilModule,
            cfg.curve
        );
        templAddress = address(templ);
    }
}
