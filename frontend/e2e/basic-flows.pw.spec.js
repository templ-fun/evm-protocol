import { test, expect, TestToken, TemplFactory } from './fixtures.js';
import { ethers } from 'ethers';
import { readFileSync } from 'fs';
import path from 'path';
import { setupWalletBridge } from './helpers.js';

const templArtifact = JSON.parse(
  readFileSync(path.join(process.cwd(), 'src/contracts/TEMPL.json'), 'utf8')
);

const BACKEND_URL = process.env.E2E_BACKEND_URL || 'http://localhost:3001';
const WEEK_IN_SECONDS = 7 * 24 * 60 * 60;

async function registerTemplWithBackend(contractAddress) {
  const res = await fetch(`${BACKEND_URL}/templs/auto`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ contractAddress })
  });
  if (!res.ok) {
    throw new Error(`Failed to register templ with backend: ${res.status}`);
  }
  return res.json();
}

test.describe('Chat-centric templ flow', () => {
  test('member joins and governs from chat UI', async ({ page, provider, wallets }) => {
    const priestAddress = await wallets.priest.getAddress();

    // Deploy factory
    const factoryDeployer = await provider.getSigner(1);
    const factoryFactory = new ethers.ContractFactory(TemplFactory.abi, TemplFactory.bytecode, factoryDeployer);
    const templFactory = await factoryFactory.deploy(priestAddress, 1000);
    await templFactory.waitForDeployment();
    const templFactoryAddress = await templFactory.getAddress();
    await templFactory.connect(factoryDeployer).setPermissionless(true);

    // Deploy access token and fund members
    const tokenDeployer = await provider.getSigner(2);
    const tokenFactory = new ethers.ContractFactory(TestToken.abi, TestToken.bytecode, tokenDeployer);
    const token = await tokenFactory.deploy('Templ Token', 'TMPL', 18);
    await token.waitForDeployment();
    const tokenAddress = await token.getAddress();

    const entryFee = ethers.parseUnits('1', 18);
    const memberAddress = await wallets.member.getAddress();
    const secondMember = await provider.getSigner(4);
    const secondMemberAddress = await secondMember.getAddress();

    await (await token.connect(tokenDeployer).mint(memberAddress, entryFee * 10n)).wait();
    await (await token.connect(tokenDeployer).mint(secondMemberAddress, entryFee * 10n)).wait();

    // Deploy templ through the factory with default config
    const createTx = await templFactory.connect(wallets.priest).createTemplFor(priestAddress, tokenAddress, entryFee);
    const receipt = await createTx.wait();
    const templCreatedLog = receipt.logs.map((log) => {
      try {
        return templFactory.interface.parseLog(log);
      } catch {
        return null;
      }
    }).find(Boolean);
    if (!templCreatedLog) throw new Error('TemplCreated log missing');
    const templAddress = templCreatedLog.args.templ.toLowerCase();

    await registerTemplWithBackend(templAddress);

    const templForMember = new ethers.Contract(templAddress, templArtifact.abi, wallets.member);
    const templReadOnly = new ethers.Contract(templAddress, templArtifact.abi, provider);

    // Prepare wallet bridge (MetaMask stub)
    await setupWalletBridge({ page, provider, wallets });

    // Seed factory address for the frontend
    await page.addInitScript((factoryAddress) => {
      window.TEMPL_FACTORY_ADDRESS = factoryAddress;
    }, templFactoryAddress);

    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Templs' })).toBeVisible();

    const connectButton = page.getByRole('navigation').getByRole('button', { name: 'Connect Wallet' });
    await connectButton.click();
    await expect(page.getByRole('navigation').getByText(/Connected:/)).toBeVisible();

    // Templ listing shows symbol and entry fee
    const templRow = page.locator('tbody tr').filter({ hasText: templAddress.slice(2, 8) });
    await expect(templRow).toBeVisible();
    await expect(templRow.locator('td').nth(1)).toContainText('TMPL');

    await templRow.getByRole('button', { name: 'Join' }).click();
    await expect(page).toHaveURL(/\/templs\/join/);
    await expect(page.getByLabel('Templ address')).toHaveValue(templAddress);

    await page.getByRole('button', { name: 'Approve entry fee' }).click();
    await expect(page.getByText(/Approving entry fee/)).toBeVisible();
    await expect(page.getByText(/Allowance approved/)).toBeVisible();

    await page.getByRole('button', { name: 'Join templ' }).click();
    await expect(page.getByText(/Joining templ/)).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/templs/${templAddress}/chat`, 'i'));

    // Chat renders and loads history
    await expect(page.getByRole('heading', { name: 'Templ Chat' })).toBeVisible();
    await expect(await templForMember.isMember(memberAddress)).toBe(true);

    // New proposal via chat composer
    await page.getByRole('button', { name: 'New proposal' }).click();
    await page.getByLabel('Title').fill('Pause joins temporarily');
    await page.getByLabel('Description').fill('Pause membership intake for maintenance.');
    await page.getByLabel('Pause joins?').selectOption('true');
    await page.getByRole('button', { name: 'Submit proposal' }).click();
    await expect(page.getByText(/Proposal submitted/)).toBeVisible();

    const proposalCard = page.locator('h3').filter({ hasText: '#0' }).locator('..').locator('..');
    await expect(proposalCard).toBeVisible();

    // Vote in chat poll
    await proposalCard.getByRole('button', { name: 'Vote Yes' }).click();
    await expect(page.getByText(/Vote submitted/)).toBeVisible();

    // Fast-forward voting period and execute
    await provider.send('evm_increaseTime', [WEEK_IN_SECONDS + 120]);
    await provider.send('evm_mine', []);
    await proposalCard.getByRole('button', { name: 'Execute' }).click();
    await expect(page.getByText(/Execution submitted/)).toBeVisible();

    await expect(async () => {
      const executed = await templReadOnly.joinPaused();
      expect(executed).toBe(true);
    }).toPass({ timeout: 15000, intervals: [250, 500, 1000] });

    // Programmatically join second member so chat has another participant
    const approveSecond = await token.connect(secondMember).approve(templAddress, entryFee);
    await approveSecond.wait();
    const templForSecond = new ethers.Contract(templAddress, templArtifact.abi, secondMember);
    const secondJoin = await templForSecond.join();
    await secondJoin.wait();
    await expect(await templReadOnly.memberCount()).toBe(2n);
  });
});
