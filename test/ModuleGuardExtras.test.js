const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployTemplModules } = require("./utils/modules");

describe("Module guard extras (treasury/governance)", function () {
  it("reverts on direct treasury module calls (onlyDelegatecall)", async function () {
    const modules = await deployTemplModules();
    const Treasury = await ethers.getContractFactory("TemplTreasuryModule");
    const treasury = Treasury.attach(modules.treasuryModule);
    await expect(treasury.setJoinPausedDAO(true)).to.be.revertedWithCustomError(treasury, "DelegatecallOnly");
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

