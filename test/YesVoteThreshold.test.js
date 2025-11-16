const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployTempl } = require("./utils/deploy");
const { mintToUsers, joinMembers } = require("./utils/mintAndPurchase");

const DAY = 24 * 60 * 60;
const VOTING_PERIOD = 7 * DAY;
const ENTRY_FEE = ethers.parseUnits("100", 18);

async function waitPostQuorumDelay(templ) {
  const delay = Number(await templ.postQuorumVotingPeriod());
  await ethers.provider.send("evm_increaseTime", [delay + 1]);
  await ethers.provider.send("evm_mine", []);
}

describe("YES vote threshold handling", function () {
  it("accepts equality at custom thresholds", async function () {
    const { templ, token, accounts } = await deployTempl({
      entryFee: ENTRY_FEE,
      yesVoteThresholdBps: 6_000,
    });
    const voters = accounts.slice(2, 7);
    await mintToUsers(token, voters, ENTRY_FEE * 4n);
    await joinMembers(templ, token, voters);

    await templ
      .connect(voters[0])
      .createProposalSetJoinPaused(true, VOTING_PERIOD, "Pause joins", "Require 60%");
    const proposalId = (await templ.proposalCount()) - 1n;

    await templ.connect(voters[0]).vote(proposalId, true);
    await templ.connect(voters[1]).vote(proposalId, true);
    await templ.connect(voters[2]).vote(proposalId, true);
    await templ.connect(voters[3]).vote(proposalId, false);
    await templ.connect(voters[4]).vote(proposalId, false);

    await waitPostQuorumDelay(templ);

    await expect(templ.executeProposal(proposalId))
      .to.emit(templ, "JoinPauseUpdated")
      .withArgs(true);
  });

  it("only requires unanimity when the threshold is 100%", async function () {
    const { templ, token, accounts } = await deployTempl({
      entryFee: ENTRY_FEE,
      yesVoteThresholdBps: 10_000,
    });
    const voters = accounts.slice(2, 6);
    await mintToUsers(token, voters, ENTRY_FEE * 4n);
    await joinMembers(templ, token, voters);

    await templ
      .connect(voters[0])
      .createProposalSetJoinPaused(true, VOTING_PERIOD, "Pause joins", "Must be unanimous");
    let proposalId = (await templ.proposalCount()) - 1n;

    await templ.connect(voters[0]).vote(proposalId, true);
    await templ.connect(voters[1]).vote(proposalId, true);
    await templ.connect(voters[2]).vote(proposalId, true);
    await templ.connect(voters[3]).vote(proposalId, false);

    await waitPostQuorumDelay(templ);

    await expect(templ.executeProposal(proposalId))
      .to.be.revertedWithCustomError(templ, "ProposalNotPassed");

    await templ
      .connect(voters[0])
      .createProposalSetJoinPaused(true, VOTING_PERIOD, "Pause joins again", "All YES");
    proposalId = (await templ.proposalCount()) - 1n;
    for (const voter of voters) {
      await templ.connect(voter).vote(proposalId, true);
    }

    await waitPostQuorumDelay(templ);

    await expect(templ.executeProposal(proposalId))
      .to.emit(templ, "JoinPauseUpdated")
      .withArgs(true);
  });
});
