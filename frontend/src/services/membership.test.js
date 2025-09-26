import { describe, expect, it, vi } from 'vitest';
import { purchaseAccess } from './membership.js';

describe('membership service', () => {
  it('defers nonce management to the wallet when approving allowance', async () => {
    const approvalWait = vi.fn().mockResolvedValue({});
    const tokenContract = {
      allowance: vi.fn().mockResolvedValue(0n),
      approve: vi.fn().mockResolvedValue({ nonce: 12, wait: approvalWait })
    };
    let recordedOverrides;
    const purchaseWait = vi.fn().mockResolvedValue({});
    const templContract = {
      hasAccess: vi.fn().mockResolvedValue(false),
      purchaseAccess: vi.fn(async (overrides) => {
        recordedOverrides = overrides;
        return { wait: purchaseWait };
      })
    };

    const fakeEthers = {
      Contract: vi.fn((address) => {
        if (address === 'token-address') return tokenContract;
        if (address === 'templ-address') return templContract;
        throw new Error(`Unexpected contract address ${address}`);
      })
    };

    const signer = {
      getAddress: vi.fn().mockResolvedValue('0xmember')
    };

    const result = await purchaseAccess({
      ethers: fakeEthers,
      signer,
      templAddress: 'templ-address',
      templArtifact: { abi: [] },
      tokenAddress: 'token-address',
      entryFee: '100',
      walletAddress: '0xmember',
      txOptions: { gasLimit: 123n }
    });

    expect(result).toEqual({ purchased: true });
    expect(tokenContract.approve).toHaveBeenCalledWith('templ-address', 100n, {
      gasLimit: 123n,
      value: undefined
    });
    expect(templContract.purchaseAccess).toHaveBeenCalledTimes(1);
    expect(recordedOverrides).toEqual({ gasLimit: 123n });
  });
});
