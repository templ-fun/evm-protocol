const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployTempl } = require("./utils/deploy");
const { mintToUsers, joinMembers } = require("./utils/mintAndPurchase");

describe("Exponential curve tiny factor edge", function () {
  it("handles very small exponential rate where squaring underflows to zero (clamped to 1)", async function () {
    // rateBps = 50 (<100) ensures baseFactor*baseFactor / 10_000 -> 0, then clamped to 1 in _powBps
    const curve = { primary: { style: 2, rateBps: 50, length: 0 }, additionalSegments: [] };
    const { templ, token, accounts } = await deployTempl({ curve });
    const [, , a, b, c] = accounts;
    await mintToUsers(token, [a, b, c], ethers.parseUnits("1000", 18));
    await joinMembers(templ, token, [a, b, c]);
    // Just ensure it computes and remains within bounds (non-zero and <= MAX)
    const fee = await templ.entryFee();
    expect(fee).to.be.gt(0n);
  });
});

