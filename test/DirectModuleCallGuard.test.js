const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployTempl } = require("./utils/deploy");
const { deployTemplModules } = require("./utils/modules");

describe("Module delegatecall guard + pagination", function () {
  it("reverts on direct module calls (onlyDelegatecall)", async function () {
    const modules = await deployTemplModules();
    const Membership = await ethers.getContractFactory("TemplMembershipModule");
    const membership = Membership.attach(modules.membershipModule);
    await expect(membership.join()).to.be.revertedWithCustomError(membership, "DelegatecallOnly");
  });

  it("lists external reward tokens with pagination", async function () {
    const { templ } = await deployTempl();
    const [tokens, hasMore] = await templ.getExternalRewardTokensPaginated(0, 10);
    expect(tokens).to.be.an("array");
    expect(hasMore).to.be.a("boolean");
  });
});

