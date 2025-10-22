const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployTempl } = require("./utils/deploy");
const { mintToUsers, joinMembers } = require("./utils/mintAndPurchase");

describe("Fee validation reverts (>100% not allowed)", function () {
  const ENTRY_FEE = ethers.parseUnits("100", 18);
  const DAY = 24 * 60 * 60;
  const VOTING_PERIOD = 7 * DAY;

  it("setProposalCreationFeeBps > 100% is rejected at creation (InvalidPercentage)", async function () {
    const { templ, token, accounts } = await deployTempl({ entryFee: ENTRY_FEE });
    const [, , proposer, voter] = accounts;
    await mintToUsers(token, [proposer, voter], ENTRY_FEE * 5n);
    await joinMembers(templ, token, [proposer, voter]);

    await expect(
      templ.connect(proposer).createProposalSetProposalFeeBps(10_001, VOTING_PERIOD, "Too high", "")
    ).to.be.revertedWithCustomError(templ, "InvalidPercentage");
  });

  it("setReferralShareBps > 100% is rejected at creation (InvalidPercentage)", async function () {
    const { templ, token, accounts } = await deployTempl({ entryFee: ENTRY_FEE });
    const [, , proposer, voter] = accounts;
    await mintToUsers(token, [proposer, voter], ENTRY_FEE * 5n);
    await joinMembers(templ, token, [proposer, voter]);

    await expect(
      templ.connect(proposer).createProposalSetReferralShareBps(10_001, VOTING_PERIOD, "Too high", "")
    ).to.be.revertedWithCustomError(templ, "InvalidPercentage");
  });
});
