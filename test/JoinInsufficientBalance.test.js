const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployTempl } = require("./utils/deploy");

describe("Join reverts when balance insufficient", function () {
  it("join() reverts InsufficientBalance for underfunded payer", async function () {
    const { templ, accounts } = await deployTempl();
    const [, , underfunded] = accounts;
    await expect(templ.connect(underfunded).join())
      .to.be.revertedWithCustomError(templ, "InsufficientBalance");
  });
});

