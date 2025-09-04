const { ethers } = require("hardhat");

const pauseInterface = new ethers.Interface(["function setPausedDAO(bool)"]);
function buildPauseCall(paused) {
  return pauseInterface.encodeFunctionData("setPausedDAO", [paused]);
}

const withdrawInterface = new ethers.Interface([
  "function withdrawTreasuryDAO(address,uint256,string)"
]);
function buildWithdrawCall(to, amount, description) {
  return withdrawInterface.encodeFunctionData("withdrawTreasuryDAO", [
    to,
    amount,
    description
  ]);
}

const withdrawAllInterface = new ethers.Interface([
  "function withdrawAllTreasuryDAO(address,string)"
]);
function buildWithdrawAllCall(to, description) {
  return withdrawAllInterface.encodeFunctionData("withdrawAllTreasuryDAO", [
    to,
    description
  ]);
}

const updateConfigInterface = new ethers.Interface([
  "function updateConfigDAO(address,uint256)"
]);
function buildUpdateConfigCall(newToken, entryFee) {
  return updateConfigInterface.encodeFunctionData("updateConfigDAO", [
    newToken,
    entryFee
  ]);
}

const sweepInterface = new ethers.Interface([
  "function sweepMemberRewardRemainderDAO(address)"
]);
function buildSweepRemainderCall(recipient) {
  return sweepInterface.encodeFunctionData(
    "sweepMemberRewardRemainderDAO",
    [recipient]
  );
}

const withdrawTokenInterface = new ethers.Interface([
  "function withdrawTokenDAO(address,address,uint256,string)"
]);
function buildWithdrawTokenCall(token, to, amount, description) {
  return withdrawTokenInterface.encodeFunctionData("withdrawTokenDAO", [
    token,
    to,
    amount,
    description
  ]);
}

const withdrawETHInterface = new ethers.Interface([
  "function withdrawETHDAO(address,uint256,string)"
]);
function buildWithdrawETHCall(to, amount, description) {
  return withdrawETHInterface.encodeFunctionData("withdrawETHDAO", [
    to,
    amount,
    description
  ]);
}

const purchaseInterface = new ethers.Interface(["function purchaseAccess()"]);
function buildPurchaseCall() {
  return purchaseInterface.encodeFunctionData("purchaseAccess", []);
}

module.exports = {
  buildPauseCall,
  buildWithdrawCall,
  buildWithdrawAllCall,
  buildUpdateConfigCall,
  buildSweepRemainderCall,
  buildWithdrawTokenCall,
  buildWithdrawETHCall,
  buildPurchaseCall
};
