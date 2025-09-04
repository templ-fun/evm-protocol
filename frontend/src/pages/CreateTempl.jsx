import { useState } from 'react';
import { ethers } from 'ethers';
import templArtifact from '../contracts/TEMPL.json';
import { deployTempl } from '../flows.js';

export default function CreateTempl({ walletAddress, signer, xmtp, onCreated }) {
  const [name, setName] = useState('');
  const [tokenAddress, setTokenAddress] = useState('');
  const [entryFee, setEntryFee] = useState('');

  async function handleCreate() {
    if (!signer || !walletAddress) return;
    try {
      const res = await deployTempl({
        ethers,
        xmtp,
        signer,
        walletAddress,
        tokenAddress,
        protocolFeeRecipient: walletAddress,
        entryFee,
        templArtifact,
      });
      onCreated({ templAddress: res.contractAddress, groupId: res.groupId, name });
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <div>
      <h1>Hello Creator!</h1>
      <input
        placeholder="What's your temple name?"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <input
        placeholder="What's the ERC20 used for buying keys?"
        value={tokenAddress}
        onChange={(e) => setTokenAddress(e.target.value)}
      />
      <input
        placeholder="What's the cost to join?"
        value={entryFee}
        onChange={(e) => setEntryFee(e.target.value)}
      />
      <button onClick={handleCreate}>connect wallet and create</button>
    </div>
  );
}
