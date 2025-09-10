const { ethers } = require("hardhat");

const IF_SET_PAUSED = new ethers.Interface(["function setPausedDAO(bool)"]);
const IF_WT = new ethers.Interface(["function withdrawTreasuryDAO(address,address,uint256,string)"]);
const IF_WTA = new ethers.Interface(["function withdrawAllTreasuryDAO(address,address,string)"]);
const IF_UC = new ethers.Interface(["function updateConfigDAO(address,uint256)"]);
const IF_DISBAND = new ethers.Interface(["function disbandTreasuryDAO()"]);

async function createProposal({ templ, signer, title, description, callData, votingPeriod }) {
  const conn = templ.connect(signer);
  try {
    const [paused] = IF_SET_PAUSED.decodeFunctionData("setPausedDAO", callData);
    const tx = await conn.createProposalSetPaused(title, description, paused, votingPeriod);
    return await tx.wait();
  } catch {}
  try {
    const [token, recipient, amount, reason] = IF_WT.decodeFunctionData("withdrawTreasuryDAO", callData);
    const tx = await conn.createProposalWithdrawTreasury(title, description, token, recipient, amount, reason, votingPeriod);
    return await tx.wait();
  } catch {}
  try {
    const [token, recipient, reason] = IF_WTA.decodeFunctionData("withdrawAllTreasuryDAO", callData);
    const tx = await conn.createProposalWithdrawAllTreasury(title, description, token, recipient, reason, votingPeriod);
    return await tx.wait();
  } catch {}
  try {
    const [, newFee] = IF_UC.decodeFunctionData("updateConfigDAO", callData);
    const tx = await conn.createProposalUpdateConfig(title, description, newFee, votingPeriod);
    return await tx.wait();
  } catch {}
  try {
    IF_DISBAND.decodeFunctionData("disbandTreasuryDAO", callData);
    const tx = await conn.createProposalDisbandTreasury(title, description, votingPeriod);
    return await tx.wait();
  } catch {}
  throw new Error("Unsupported callData for createProposal adapter");
}

module.exports = { createProposal };
module.exports.attachCreateProposalCompat = function(templ) {
  const origConnect = templ.connect.bind(templ);
  templ.connect = (signer) => {
    const instance = origConnect(signer);
    instance.createProposal = (title, description, callData, votingPeriod) =>
      createProposal({ templ, signer, title, description, callData, votingPeriod });
    return instance;
  };
  return templ;
};
