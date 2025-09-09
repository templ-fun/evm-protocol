import { test, expect, TestToken } from './fixtures.js';
import { ethers } from 'ethers';
import { readFileSync } from 'fs';
import path from 'path';

test.describe('Proposal extras: reprice + disband', () => {
test('Reprice entry fee and disband treasury via UI proposals', async ({ page, wallets }) => {
    // Load ABI
    const templAbi = JSON.parse(readFileSync(path.join(process.cwd(), 'src/contracts/TEMPL.json'))).abi;
    // Deploy token
    const tokenFactory = new ethers.ContractFactory(TestToken.abi, TestToken.bytecode, wallets.priest);
    const token = await tokenFactory.deploy('Test', 'TEST', 18);
    await token.waitForDeployment();
    const tokenAddress = await token.getAddress();
    // Deploy TEMPL
    const entryFee = ethers.parseUnits('100', 18);
    const templFactory = new ethers.ContractFactory(templAbi, JSON.parse(readFileSync(path.join(process.cwd(), 'src/contracts/TEMPL.json'))).bytecode, wallets.priest);
    const templ = await templFactory.deploy(await wallets.priest.getAddress(), await wallets.priest.getAddress(), tokenAddress, entryFee);
    await templ.waitForDeployment();
    const templAddress = await templ.getAddress();
    // Prefund and have two users join to build treasury
    const u1 = wallets.member;
    const u2 = wallets.delegate;
    for (const w of [wallets.priest, u1, u2]) {
      const erc20 = new ethers.Contract(tokenAddress, ['function approve(address,uint256) returns (bool)'], w);
      const n = await w.getNonce();
      await (await erc20.approve(templAddress, entryFee, { nonce: n })).wait();
      const ct = new ethers.Contract(templAddress, templAbi, w);
      await (await ct.purchaseAccess()).wait();
    }
    // Hook window.ethereum to priest for UI actions
    await page.goto('./');
    const address = await wallets.priest.getAddress();
    await page.exposeFunction('e2e_ui_sign', async ({ message }) => {
      if (typeof message === 'string' && message.startsWith('0x')) return wallets.priest.signMessage(ethers.getBytes(message));
      return wallets.priest.signMessage(message);
    });
    await page.exposeFunction('e2e_ui_signTyped', async (payload) => wallets.priest.signTypedData(payload.domain, payload.types, payload.message));
    await page.exposeFunction('e2e_ui_send', async (tx) => {
      const req = { to: tx.to || undefined, data: tx.data || undefined, value: tx.value ? BigInt(tx.value) : undefined };
      const resp = await wallets.priest.sendTransaction(req);
      return resp.hash;
    });
    await page.evaluate(async ({ address }) => {
      window.ethereum = {
        isMetaMask: true,
        selectedAddress: address,
        request: async ({ method, params }) => {
          if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [address];
          if (method === 'eth_chainId') return '0x7a69';
          if (method === 'personal_sign' || method === 'eth_sign') {
            const data = (params && params[0]) || '';
            // @ts-ignore
            return await window.e2e_ui_sign({ message: data });
          }
          if (method === 'eth_signTypedData' || method === 'eth_signTypedData_v4') {
            const [_addr, typed] = params || [];
            const payload = typeof typed === 'string' ? JSON.parse(typed) : typed;
            // @ts-ignore
            return await window.e2e_ui_signTyped(payload);
          }
          if (method === 'eth_sendTransaction') {
            const [tx] = params || [];
            // @ts-ignore
            return await window.e2e_ui_send(tx);
          }
          const response = await fetch('http://127.0.0.1:8545', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }) });
          const result = await response.json();
          if (result.error) throw new Error(result.error.message);
          return result.result;
        },
        on: () => {},
        removeListener: () => {}
      };
    }, { address });
    // Connect wallet and open chat
    await page.click('button:has-text("Connect Wallet")');
    await page.click('button:has-text("Chat")');
    // Reprice via UI
    await page.click('button:has-text("Propose vote")');
    await page.fill('input[placeholder="Title"]', 'Reprice to 200');
    await page.click('button:has-text("Reprice Entry Fee")');
    await page.fill('input[placeholder*="New Entry Fee"]', ethers.parseUnits('200', 18).toString());
    await page.click('button:has-text("Submit Proposal")');
    // Resolve latest proposal id
    const lastId1 = Number(await (new ethers.Contract(templAddress, templAbi, wallets.priest)).proposalCount()) - 1;
    // Cast votes on-chain and execute
    await (await (new ethers.Contract(templAddress, templAbi, wallets.priest)).vote(lastId1, true)).wait();
    await (await (new ethers.Contract(templAddress, templAbi, u1)).vote(lastId1, true)).wait();
    await (await (new ethers.Contract(templAddress, templAbi, u2)).vote(lastId1, true)).wait();
    await fetch('http://127.0.0.1:8545', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'evm_increaseTime', params: [7 * 24 * 60 * 60] }) });
    await fetch('http://127.0.0.1:8545', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'evm_mine', params: [] }) });
    await (await (new ethers.Contract(templAddress, templAbi, wallets.priest)).executeProposal(lastId1)).wait();
    expect(await (new ethers.Contract(templAddress, templAbi, wallets.priest)).entryFee()).toEqual(ethers.parseUnits('200', 18));

    // Disband treasury via UI
    await page.click('button:has-text("Propose vote")');
    await page.fill('input[placeholder="Title"]', 'Disband Treasury');
    await page.click('button:has-text("Disband Treasury")');
    await page.click('button:has-text("Submit Proposal")');
    const templPriest = new ethers.Contract(templAddress, templAbi, wallets.priest);
    const lastId2 = Number(await templPriest.proposalCount()) - 1;
    const tBefore = await templPriest.treasuryBalance();
    const mcount = Number(await templPriest.getMemberCount());
    await (await templPriest.vote(lastId2, true)).wait();
    await (await (new ethers.Contract(templAddress, templAbi, u1)).vote(lastId2, true)).wait();
    await (await (new ethers.Contract(templAddress, templAbi, u2)).vote(lastId2, true)).wait();
    await fetch('http://127.0.0.1:8545', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'evm_increaseTime', params: [7 * 24 * 60 * 60] }) });
    await fetch('http://127.0.0.1:8545', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'evm_mine', params: [] }) });
    await (await templPriest.executeProposal(lastId2)).wait();
    expect(await templPriest.treasuryBalance()).toBe(0n);
    const perMember = tBefore / BigInt(mcount);
    const claim1 = await templPriest.getClaimablePoolAmount(await wallets.priest.getAddress());
    expect(claim1).toBe(perMember);
  });
});
