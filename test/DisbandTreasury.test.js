const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployTempl } = require("./utils/deploy");
const { mintToUsers, purchaseAccess } = require("./utils/mintAndPurchase");

describe("Disband Treasury", function () {
  const ENTRY_FEE = ethers.parseUnits("100", 18);
  const TOKEN_SUPPLY = ethers.parseUnits("10000", 18);

  let templ;
  let token;
  let accounts;
  let m1, m2, m3;

  beforeEach(async function () {
    ({ templ, token, accounts } = await deployTempl({ entryFee: ENTRY_FEE }));
    [ , , m1, m2, m3 ] = accounts;
    await mintToUsers(token, [m1, m2, m3], TOKEN_SUPPLY);
    await purchaseAccess(templ, token, [m1, m2, m3]);
  });

  it("allocates treasury equally to all members and empties treasury", async function () {
    const memberCount = 3n;
    const tBefore = await templ.treasuryBalance();
    expect(tBefore).to.be.gt(0n);

    const before1 = await templ.getClaimablePoolAmount(m1.address);
    const before2 = await templ.getClaimablePoolAmount(m2.address);
    const before3 = await templ.getClaimablePoolAmount(m3.address);

    await templ.connect(m1).createProposalDisbandTreasury(7 * 24 * 60 * 60);
    await templ.connect(m1).vote(0, true);
    await templ.connect(m2).vote(0, true);

    await ethers.provider.send("evm_increaseTime", [8 * 24 * 60 * 60]);
    await ethers.provider.send("evm_mine");

    await templ.executeProposal(0);

    // Treasury moved to pool
    expect(await templ.treasuryBalance()).to.equal(0n);
    const perMember = tBefore / memberCount;

    const after1 = await templ.getClaimablePoolAmount(m1.address);
    const after2 = await templ.getClaimablePoolAmount(m2.address);
    const after3 = await templ.getClaimablePoolAmount(m3.address);

    expect(after1 - before1).to.equal(perMember);
    expect(after2 - before2).to.equal(perMember);
    expect(after3 - before3).to.equal(perMember);

    // members can claim now without reverts
    await templ.connect(m1).claimMemberPool();
    await templ.connect(m2).claimMemberPool();
    await templ.connect(m3).claimMemberPool();
  });

  it("reverts when called directly (NotDAO)", async function () {
    await expect(templ.connect(m1).disbandTreasuryDAO())
      .to.be.revertedWithCustomError(templ, "NotDAO");
  });

  it("allows specifying the access token explicitly", async function () {
    const accessToken = await templ.accessToken();
    await expect(
      templ
        .connect(m1)
        ['createProposalDisbandTreasury(address,uint256)'](accessToken, 7 * 24 * 60 * 60)
    ).to.emit(templ, "ProposalCreated");
  });

  it("allows disband proposals with non-access tokens (execution will fail later)", async function () {
    const randomToken = ethers.Wallet.createRandom().address;
    await expect(
      templ
        .connect(m1)
        ['createProposalDisbandTreasury(address,uint256)'](randomToken, 7 * 24 * 60 * 60)
    ).to.emit(templ, "ProposalCreated");

    await expect(
      templ
        .connect(m2)
        ['createProposalDisbandTreasury(address,uint256)'](ethers.ZeroAddress, 7 * 24 * 60 * 60)
    ).to.emit(templ, "ProposalCreated");

    // Proposal ID 0 (randomToken) still reverts on execution
    await templ.connect(m1).vote(0, true);
    await templ.connect(m2).vote(0, true);
    await ethers.provider.send("evm_increaseTime", [8 * 24 * 60 * 60]);
    await ethers.provider.send("evm_mine");
    await expect(templ.executeProposal(0)).to.be.revertedWithCustomError(templ, "InvalidCallData");
  });

  it("reverts when treasury is empty", async function () {
    // First disband to empty
    await templ.connect(m1).createProposalDisbandTreasury(7 * 24 * 60 * 60);
    await templ.connect(m1).vote(0, true);
    await templ.connect(m2).vote(0, true);
    await ethers.provider.send("evm_increaseTime", [8 * 24 * 60 * 60]);
    await ethers.provider.send("evm_mine");
    await templ.executeProposal(0);

    // propose again with empty treasury
    await templ.connect(m1).createProposalDisbandTreasury(7 * 24 * 60 * 60);
    await templ.connect(m1).vote(1, true);
    await templ.connect(m2).vote(1, true);
    await ethers.provider.send("evm_increaseTime", [8 * 24 * 60 * 60]);
    await ethers.provider.send("evm_mine");
    await expect(templ.executeProposal(1))
      .to.be.revertedWithCustomError(templ, "NoTreasuryFunds");
  });
});
