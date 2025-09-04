import { useState } from 'react';
import { ethers } from 'ethers';
import templArtifact from '../contracts/TEMPL.json';
import { purchaseAndJoin } from '../flows.js';

export default function JoinTempl({ walletAddress, signer, xmtp, onJoined }) {
  const [templAddress, setTemplAddress] = useState('');

  async function handleJoin() {
    if (!signer || !walletAddress) return;
    try {
      const res = await purchaseAndJoin({
        ethers,
        xmtp,
        signer,
        walletAddress,
        templAddress,
        templArtifact,
      });
      onJoined({ templAddress, groupId: res.groupId });
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <div>
      <h1>Hello Participant!</h1>
      <input
        placeholder="What's your temple address?"
        value={templAddress}
        onChange={(e) => setTemplAddress(e.target.value)}
      />
      <button onClick={handleJoin}>connect wallet and pay to join</button>
    </div>
  );
}
