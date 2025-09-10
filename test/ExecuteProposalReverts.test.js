const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployTempl } = require("./utils/deploy");
const { mintToUsers, purchaseAccess } = require("./utils/mintAndPurchase");

describe("executeProposal reverts", function () {
  let templ;
  let token;
  let owner;
  let priest;
  let accounts;
  const ENTRY_FEE = ethers.parseUnits("100", 18);

  beforeEach(async function () {
    ({ templ, token, accounts } = await deployTempl({ entryFee: ENTRY_FEE }));
    [owner, priest] = accounts;
  });

  it("reverts for proposal ID >= proposalCount", async function () {
    await expect(templ.executeProposal(0)).to.be.revertedWithCustomError(
      templ,
      "InvalidProposal"
    );
  });

  it("rejects invalid update fee at creation", async function () {
    await mintToUsers(token, [owner], ENTRY_FEE);
    await purchaseAccess(templ, token, [owner]);
    await expect(
      templ.connect(owner).createProposalUpdateConfig("Invalid", "fee", 5, 7 * 24 * 60 * 60)
    ).to.be.revertedWithCustomError(templ, "EntryFeeTooSmall");
  });
});
