const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployTempl } = require("./utils/deploy");
const { mintToUsers, joinMembers } = require("./utils/mintAndPurchase");

describe("Dictatorship PriestOnly reverts", function () {
  const ENTRY_FEE = ethers.parseUnits("100", 18);
  const DAY = 24 * 60 * 60;
  const VOTING_PERIOD = 7 * DAY;

  it("non-priest EOA cannot call onlyDAO functions when dictatorship is enabled", async function () {
    const { templ, token, accounts, priest } = await deployTempl({ entryFee: ENTRY_FEE });
    const [, , member, outsider] = accounts;
    await mintToUsers(token, [member], ENTRY_FEE * 2n);
    await joinMembers(templ, token, [member]);

    // Enable dictatorship via proposal
    await templ.connect(member).createProposalSetDictatorship(true, VOTING_PERIOD, "Enable", "");
    await templ.connect(priest).vote(0, true);
    await ethers.provider.send("evm_increaseTime", [VOTING_PERIOD + DAY]);
    await ethers.provider.send("evm_mine", []);
    await templ.executeProposal(0);
    expect(await templ.priestIsDictator()).to.equal(true);

    // outsider tries onlyDAO → expect PriestOnly
    await expect(templ.connect(outsider).setJoinPausedDAO(true))
      .to.be.revertedWithCustomError(templ, "PriestOnly");
  });
});

