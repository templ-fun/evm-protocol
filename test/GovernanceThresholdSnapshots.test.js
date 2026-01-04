const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployTempl } = require("./utils/deploy");
const { mintToUsers, joinMembers } = require("./utils/mintAndPurchase");

describe("Governance threshold snapshots", function () {
  const ENTRY_FEE = ethers.parseUnits("100", 18);
  const LONG_VOTING_PERIOD = 20 * 24 * 60 * 60;
  const WEEK = 7 * 24 * 60 * 60;

  it("keeps quorum threshold fixed for existing proposals", async function () {
    const { templ, token, accounts } = await deployTempl({ entryFee: ENTRY_FEE });
    const [, , member1, member2, member3] = accounts;

    await mintToUsers(token, [member1, member2, member3], ENTRY_FEE * 5n);
    await joinMembers(templ, token, [member1, member2, member3]);

    await templ
      .connect(member1)
      .createProposalSetBurnAddress("0x00000000000000000000000000000000000000c2", LONG_VOTING_PERIOD, "burn", "");
    const proposalId = (await templ.proposalCount()) - 1n;

    await templ.connect(member2).createProposalSetQuorumBps(9_000, WEEK, "raise quorum", "");
    const configId = (await templ.proposalCount()) - 1n;
    await templ.connect(member3).vote(configId, true);

    const delay = Number(await templ.postQuorumVotingPeriod());
    await ethers.provider.send("evm_increaseTime", [delay + 1]);
    await ethers.provider.send("evm_mine", []);
    await templ.executeProposal(configId);
    expect(await templ.quorumBps()).to.equal(9_000n);

    await templ.connect(member2).vote(proposalId, true);

    await ethers.provider.send("evm_increaseTime", [delay + 1]);
    await ethers.provider.send("evm_mine", []);
    await expect(templ.executeProposal(proposalId)).to.not.be.reverted;
  });

  it("keeps YES vote threshold fixed for existing proposals", async function () {
    const { templ, token, accounts } = await deployTempl({ entryFee: ENTRY_FEE });
    const [, , member1, member2, member3] = accounts;

    await mintToUsers(token, [member1, member2, member3], ENTRY_FEE * 5n);
    await joinMembers(templ, token, [member1, member2, member3]);

    await templ
      .connect(member1)
      .createProposalSetBurnAddress("0x00000000000000000000000000000000000000c3", LONG_VOTING_PERIOD, "burn", "");
    const proposalId = (await templ.proposalCount()) - 1n;

    await templ.connect(member2).createProposalSetYesVoteThreshold(9_000, WEEK, "raise yes", "");
    const configId = (await templ.proposalCount()) - 1n;
    await templ.connect(member3).vote(configId, true);

    const delay = Number(await templ.postQuorumVotingPeriod());
    await ethers.provider.send("evm_increaseTime", [delay + 1]);
    await ethers.provider.send("evm_mine", []);
    await templ.executeProposal(configId);
    expect(await templ.yesVoteThresholdBps()).to.equal(9_000n);

    await templ.connect(member2).vote(proposalId, true);
    await templ.connect(member3).vote(proposalId, false);

    await ethers.provider.send("evm_increaseTime", [delay + 1]);
    await ethers.provider.send("evm_mine", []);
    await expect(templ.executeProposal(proposalId)).to.not.be.reverted;
  });
});
