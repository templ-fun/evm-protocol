const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployTemplModules } = require("./utils/modules");
const { attachTemplInterface } = require("./utils/templ");
const { mintToUsers, joinMembers } = require("./utils/mintAndPurchase");

describe("External snapshot masking regression", function () {
  it("prevents double-claim when cumulative exceeds mask", async function () {
    const signers = await ethers.getSigners();
    const [, priest, protocol, member] = signers;

    // Deploy access token and modules
    const Token = await ethers.getContractFactory("contracts/mocks/TestToken.sol:TestToken");
    const accessToken = await Token.deploy("Access", "ACC", 18);
    const modules = await deployTemplModules();

    // Deploy harnessed TEMPL instance
    const Harness = await ethers.getContractFactory("TemplHarness");
    let templ = await Harness.deploy(
      priest.address,
      protocol.address,
      accessToken.target,
      1_000_000n,
      3000,
      3000,
      3000,
      1000,
      3300,
      7 * 24 * 60 * 60,
      ethers.ZeroAddress,
      false,
      0,
      "Masking Harness",
      "",
      "",
      0,
      0,
      modules.membershipModule,
      modules.treasuryModule,
      modules.governanceModule
    );
    await templ.waitForDeployment();
    templ = await attachTemplInterface(templ);

    // Join one additional member so there are at least 2 members
    const entryFee = await templ.entryFee();
    await mintToUsers(accessToken, [member], entryFee);
    await joinMembers(templ, accessToken, [member]);

    // Deploy an external reward token
    const RewardToken = await ethers.getContractFactory("contracts/mocks/TestToken.sol:TestToken");
    const rewardToken = await RewardToken.deploy("Reward", "RWD", 18);

    // Build external reward state where cumulative has high bits beyond 192
    const SHIFT = 192n;
    const HUGE = 1n << SHIFT; // exactly one bit beyond the mask
    const tokenKey = rewardToken.target;

    // Seed a huge cumulative and a checkpoint BEFORE the member's join time so baseline = HUGE
    await templ.harnessResetExternalRewards(tokenKey, HUGE);
    await templ.harnessPushCheckpoint(tokenKey, 10, 1_000, HUGE);

    // Force member metadata to reflect a join after the checkpoint
    await templ.harnessSetMember(member.address, 20, 2_000, true, 2);

    // Deposit some rewards and disband into the external pool
    const deposit = ethers.parseUnits("10", 18);
    await rewardToken.mint(signers[0].address, deposit);
    const templAddress = await templ.getAddress();
    await rewardToken.transfer(templAddress, deposit);
    // Use the harness internal path to bypass onlyDAO
    await templ.harnessDisbandTreasury(tokenKey);

    // With baseline = HUGE and accrued = HUGE + perMember, claimable should equal perMember
    const before = await templ.getClaimableExternalReward(member.address, tokenKey);
    expect(before).to.be.gt(0n);

    // First claim succeeds and records an encoded snapshot with the huge value
    const balBefore = await rewardToken.balanceOf(member.address);
    await templ.connect(member).claimExternalReward(tokenKey);
    const balAfterFirst = await rewardToken.balanceOf(member.address);
    const firstClaim = balAfterFirst - balBefore;
    expect(firstClaim).to.equal(before);

    // Due to missing mask, decode observes a mismatched nonce and resets snapshot value to 0,
    // allowing the member to immediately claim the same amount again.
    const again = await templ.getClaimableExternalReward(member.address, tokenKey);
    // After the fix, snapshot nonce/value remain valid and re-claim is not possible immediately.
    expect(again).to.equal(0n);
  });
});
