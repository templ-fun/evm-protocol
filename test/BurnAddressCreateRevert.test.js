const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployTempl } = require("./utils/deploy");
const { mintToUsers, joinMembers } = require("./utils/mintAndPurchase");

describe("Burn address proposal input validation", function () {
  const ENTRY_FEE = ethers.parseUnits("100", 18);
  const DAY = 24 * 60 * 60;
  const VOTING_PERIOD = 7 * DAY;
  it("createProposalSetBurnAddress reverts when new burn is zero", async function () {
    const { templ, token, accounts } = await deployTempl({ entryFee: ENTRY_FEE });
    const [, , proposer] = accounts;
    await mintToUsers(token, [proposer], ENTRY_FEE * 3n);
    await joinMembers(templ, token, [proposer]);
    await expect(
      templ.connect(proposer).createProposalSetBurnAddress(ethers.ZeroAddress, VOTING_PERIOD, "", "")
    ).to.be.revertedWithCustomError(templ, "InvalidRecipient");
  });
});

