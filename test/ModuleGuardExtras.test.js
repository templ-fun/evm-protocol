const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployTemplModules } = require("./utils/modules");

describe("Module guard extras (treasury/governance)", function () {
  it("reverts on direct treasury module calls (NotDAO)", async function () {
    const modules = await deployTemplModules();
    const Treasury = await ethers.getContractFactory("TemplTreasuryModule");
    const treasury = Treasury.attach(modules.treasuryModule);
    // onlyDAO is evaluated before onlyDelegatecall in treasury module; direct calls revert NotDAO
    await expect(treasury.setJoinPausedDAO(true)).to.be.revertedWithCustomError(treasury, "NotDAO");
  });

  it("reverts on direct governance module calls (onlyDelegatecall)", async function () {
    const modules = await deployTemplModules();
    const Governance = await ethers.getContractFactory("TemplGovernanceModule");
    const governance = Governance.attach(modules.governanceModule);
    await expect(
      governance.createProposalSetJoinPaused(true, 7 * 24 * 60 * 60, "", "")
    ).to.be.revertedWithCustomError(governance, "DelegatecallOnly");
  });
});
