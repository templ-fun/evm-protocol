const { expect } = require("chai");
const { ethers } = require("hardhat");
// This test uses a dedicated harness to simulate overflow with a reduced mask width.

describe("External snapshot masking regression", function () {
  it("preserves claims for pre-checkpoint members after overflow (reduced mask harness)", async function () {
    const [owner, memberA, memberB] = await ethers.getSigners();
    const RewardToken = await ethers.getContractFactory("contracts/mocks/TestToken.sol:TestToken");
    const rewardToken = await RewardToken.deploy("Reward", "RWD", 18);

    const Harness = await ethers.getContractFactory("ExternalRewardsMaskingHarness");
    const h = await Harness.deploy();
    await h.waitForDeployment();

    // Seed two members. Place memberB before first checkpoint to get baseline=0 later.
    await h.seedMembers(memberA.address, memberB.address, 0, 0, 0, 0);

    // First small disband pre-overflow
    const members = 2n;
    const firstDeposit = ethers.parseUnits("10", 18);
    await rewardToken.mint(owner.address, firstDeposit);
    await rewardToken.transfer(await h.getAddress(), firstDeposit);
    await h.disband(rewardToken.target, firstDeposit);

    // MemberB claims once (pre-overflow)
    const before1 = await h.getClaimableExternalReward(memberB.address, rewardToken.target);
    expect(before1).to.be.gt(0n);
    const b0 = await rewardToken.balanceOf(memberB.address);
    await h.connect(memberB).claimExternalReward(rewardToken.target);
    const b1 = await rewardToken.balanceOf(memberB.address);
    expect(b1 - b0).to.equal(before1);

    // Drive cumulative near the 32-bit boundary with a large disband, then cross it by 1 token
    const SHIFT = 32n;
    const ONE = 10n ** 18n;
    const [ , cum0 ] = await h.getExternalRewardState(rewardToken.target);
    const near = ((1n << SHIFT) - 1n) * ONE; // per-member near-boundary cumulative (scaled)
    const perMemberDelta = near - cum0; // amount to reach near boundary
    const bigDeposit = perMemberDelta * members;
    await rewardToken.mint(owner.address, bigDeposit);
    await rewardToken.transfer(await h.getAddress(), bigDeposit);
    await h.disband(rewardToken.target, bigDeposit);

    const tiny = ethers.parseUnits("1", 18);
    await rewardToken.mint(owner.address, tiny);
    await rewardToken.transfer(await h.getAddress(), tiny);
    await h.disband(rewardToken.target, tiny);

    // First claim after overflow should succeed
    const before2 = await h.getClaimableExternalReward(memberB.address, rewardToken.target);
    expect(before2).to.be.gt(0n);
    await h.connect(memberB).claimExternalReward(rewardToken.target);

    // Immediately after, claimable must be zero (no 2^shift ballooning / no bricking)
    const after = await h.getClaimableExternalReward(memberB.address, rewardToken.target);
    expect(after).to.equal(0n);
  });
});
