// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title ExternalRewardsMaskingHarness
/// @notice Test-only harness that simulates external reward snapshot encoding/decoding
///         with a reduced mask width so tests can cross the boundary realistically.
contract ExternalRewardsMaskingHarness is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // Use a small shift to keep deposits reasonable in tests.
    uint256 internal constant TEST_SNAPSHOT_NONCE_SHIFT = 32; // 32-bit value mask
    uint256 internal constant TEST_SNAPSHOT_VALUE_MASK = (uint256(1) << TEST_SNAPSHOT_NONCE_SHIFT) - 1;

    struct RewardCheckpoint {
        uint64 blockNumber;
        uint64 timestamp;
        uint256 cumulative;
    }

    struct Member {
        bool joined;
        uint256 blockNumber;
        uint256 timestamp;
    }

    struct ExternalRewardState {
        uint256 poolBalance;
        uint256 cumulativeRewards;
        uint256 rewardRemainder;
        bool exists;
        RewardCheckpoint[] checkpoints;
    }

    mapping(address => ExternalRewardState) internal rewards;
    mapping(address => mapping(address => uint256)) internal memberSnapshots; // member => token => snapshot
    mapping(address => uint256) internal cleanupNonce; // token => nonce
    mapping(address => Member) internal members;
    uint256 public memberCount;

    function seedMembers(address m1, address m2, uint256 bn1, uint256 ts1, uint256 bn2, uint256 ts2) external {
        members[m1] = Member({joined: true, blockNumber: bn1, timestamp: ts1});
        members[m2] = Member({joined: true, blockNumber: bn2, timestamp: ts2});
        memberCount = 2;
    }

    function getExternalRewardState(address token)
        external
        view
        returns (uint256 poolBalance, uint256 cumulativeRewards, uint256 remainder)
    {
        ExternalRewardState storage r = rewards[token];
        return (r.poolBalance, r.cumulativeRewards, r.rewardRemainder);
    }

    function disband(address token, uint256 totalAmount) external {
        require(memberCount > 0, "no members");
        ExternalRewardState storage r = rewards[token];
        r.exists = true;
        uint256 perMember = totalAmount / memberCount;
        uint256 rem = totalAmount % memberCount;
        r.poolBalance += totalAmount;
        r.rewardRemainder += rem;
        r.cumulativeRewards += perMember;
        _recordCheckpoint(r);
        // The harness assumes tokens already transferred in by the test.
    }

    function claimExternalReward(address token) external nonReentrant {
        ExternalRewardState storage r = rewards[token];
        require(r.exists, "no rewards");
        uint256 claimable = getClaimableExternalReward(msg.sender, token);
        require(claimable > 0, "nothing to claim");
        uint256 remaining = r.poolBalance;
        require(remaining >= claimable, "insufficient pool");
        uint256 nonce = cleanupNonce[token];
        memberSnapshots[msg.sender][token] = _encodeSnapshot(nonce, r.cumulativeRewards);
        r.poolBalance = remaining - claimable;
        IERC20(token).safeTransfer(msg.sender, claimable);
    }

    function getClaimableExternalReward(address member, address token) public view returns (uint256) {
        ExternalRewardState storage r = rewards[token];
        if (!r.exists || !members[member].joined) return 0;
        uint256 accrued = r.cumulativeRewards;
        uint256 baseline = _baselineForMember(r, members[member]);
        (uint256 snapNonce, uint256 snapValue) = _decodeSnapshot(memberSnapshots[member][token]);
        if (snapNonce != cleanupNonce[token]) {
            snapValue = 0;
        } else if (snapValue != 0) {
            // High-bit reconstruction (at most one wrap assumption, monotonic growth)
            uint256 high = accrued >> TEST_SNAPSHOT_NONCE_SHIFT;
            uint256 reconstructed = (high << TEST_SNAPSHOT_NONCE_SHIFT) | snapValue;
            if (reconstructed > accrued) {
                reconstructed -= (uint256(1) << TEST_SNAPSHOT_NONCE_SHIFT);
            }
            snapValue = reconstructed;
        }
        uint256 floor = baseline;
        if (snapValue > floor) floor = snapValue;
        return accrued > floor ? accrued - floor : 0;
    }

    function _encodeSnapshot(uint256 nonce, uint256 value) internal pure returns (uint256) {
        return (nonce << TEST_SNAPSHOT_NONCE_SHIFT) | (value & TEST_SNAPSHOT_VALUE_MASK);
    }

    function _decodeSnapshot(uint256 snapshot) internal pure returns (uint256 nonce, uint256 value) {
        nonce = snapshot >> TEST_SNAPSHOT_NONCE_SHIFT;
        value = snapshot & TEST_SNAPSHOT_VALUE_MASK;
    }

    function _baselineForMember(ExternalRewardState storage r, Member storage m) internal view returns (uint256) {
        RewardCheckpoint[] storage cps = r.checkpoints;
        uint256 len = cps.length;
        if (len == 0) return r.cumulativeRewards;
        uint256 mb = m.blockNumber;
        uint256 mt = m.timestamp;
        uint256 low = 0;
        uint256 high = len;
        while (low < high) {
            uint256 mid = (low + high) >> 1;
            RewardCheckpoint storage cp = cps[mid];
            if (mb < cp.blockNumber) {
                high = mid;
            } else if (mb > cp.blockNumber) {
                low = mid + 1;
            } else if (mt < cp.timestamp) {
                high = mid;
            } else {
                low = mid + 1;
            }
        }
        if (low == 0) return 0;
        return cps[low - 1].cumulative;
    }

    function _recordCheckpoint(ExternalRewardState storage r) internal {
        RewardCheckpoint memory cp = RewardCheckpoint({
            blockNumber: uint64(block.number),
            timestamp: uint64(block.timestamp),
            cumulative: r.cumulativeRewards
        });
        uint256 len = r.checkpoints.length;
        if (len == 0) {
            r.checkpoints.push(cp);
            return;
        }
        RewardCheckpoint storage last = r.checkpoints[len - 1];
        if (last.blockNumber == cp.blockNumber) {
            last.timestamp = cp.timestamp;
            last.cumulative = cp.cumulative;
        } else {
            r.checkpoints.push(cp);
        }
    }
}

