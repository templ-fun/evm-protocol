import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deployTempl, purchaseAndJoin, sendMessage } from './flows.js';

const templArtifact = { abi: [], bytecode: '0x' };

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('templ flows', () => {
  it('deployTempl deploys contract and registers group', async () => {
    const fakeContract = {
      waitForDeployment: vi.fn(),
      getAddress: vi.fn().mockResolvedValue('0xdead')
    };
    const factory = { deploy: vi.fn().mockResolvedValue(fakeContract) };
    const ethers = {
      ContractFactory: vi.fn().mockImplementation(() => factory)
    };
    globalThis.fetch = vi.fn().mockResolvedValue({ json: () => Promise.resolve({ groupId: 'group-1' }) });
    const xmtp = { conversations: { getGroup: vi.fn().mockResolvedValue('groupObj') } };

    const result = await deployTempl({
      ethers,
      xmtp,
      signer: {},
      walletAddress: '0xabc',
      tokenAddress: '0xdef',
      entryFee: '1',
      priestVoteWeight: '1',
      priestWeightThreshold: '1',
      templArtifact
    });

    expect(ethers.ContractFactory).toHaveBeenCalled();
    expect(factory.deploy).toHaveBeenCalled();
    expect(result).toEqual({ contractAddress: '0xdead', group: 'groupObj', groupId: 'group-1' });
  });

  it('purchaseAndJoin purchases access and joins group', async () => {
    const contract = {
      hasPurchased: vi.fn().mockResolvedValue(false),
      purchaseAccess: vi.fn().mockResolvedValue({ wait: vi.fn() })
    };
    const ethers = { Contract: vi.fn().mockReturnValue(contract) };
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ groupId: 'group-2' }) });
    const xmtp = { conversations: { getGroup: vi.fn().mockResolvedValue('groupObj2') } };

    const result = await purchaseAndJoin({
      ethers,
      xmtp,
      signer: {},
      walletAddress: '0xabc',
      templAddress: '0xtempl',
      templArtifact
    });

    expect(contract.purchaseAccess).toHaveBeenCalled();
    expect(result).toEqual({ group: 'groupObj2', groupId: 'group-2' });
  });

  it('sendMessage forwards content to group', async () => {
    const group = { send: vi.fn() };
    await sendMessage({ group, content: 'hello' });
    expect(group.send).toHaveBeenCalledWith('hello');
  });
});
