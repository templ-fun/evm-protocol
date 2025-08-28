import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { Client } from '@xmtp/xmtp-js';
import templArtifact from './contracts/TEMPL.json';
import { deployTempl, purchaseAndJoin, sendMessage } from './flows.js';
import './App.css';

function App() {
  const [walletAddress, setWalletAddress] = useState();
  const [signer, setSigner] = useState();
  const [xmtp, setXmtp] = useState();
  const [group, setGroup] = useState();
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState('');

  // deployment form
  const [tokenAddress, setTokenAddress] = useState('');
  const [entryFee, setEntryFee] = useState('');
  const [priestVoteWeight, setPriestVoteWeight] = useState('1');
  const [priestWeightThreshold, setPriestWeightThreshold] = useState('1');

  // joining form
  const [templAddress, setTemplAddress] = useState('');
  const [groupId, setGroupId] = useState('');

  async function connectWallet() {
    if (!window.ethereum) return;
    const provider = new ethers.BrowserProvider(window.ethereum);
    await provider.send('eth_requestAccounts', []);
    const signer = await provider.getSigner();
    setSigner(signer);
    setWalletAddress(await signer.getAddress());
    const client = await Client.create(signer, { env: 'production' });
    setXmtp(client);
  }

  async function handleDeploy() {
    if (!signer || !xmtp) return;
    const result = await deployTempl({
      ethers,
      xmtp,
      signer,
      walletAddress,
      tokenAddress,
      entryFee,
      priestVoteWeight,
      priestWeightThreshold,
      templArtifact
    });
    setTemplAddress(result.contractAddress);
    setGroup(result.group);
    setGroupId(result.groupId);
  }

  async function handlePurchaseAndJoin() {
    if (!signer || !xmtp || !templAddress) return;
    const result = await purchaseAndJoin({
      ethers,
      xmtp,
      signer,
      walletAddress,
      templAddress,
      templArtifact
    });
    if (result) {
      setGroup(result.group);
      setGroupId(result.groupId);
    }
  }

  useEffect(() => {
    if (!group) return;
    let cancelled = false;
    const stream = async () => {
      for await (const msg of await group.streamMessages()) {
        if (cancelled) break;
        setMessages((m) => [...m, msg]);
      }
    };
    stream();
    return () => {
      cancelled = true;
    };
  }, [group]);

  async function handleSend() {
    if (!group || !messageInput) return;
    await sendMessage({ group, content: messageInput });
    setMessageInput('');
  }

  return (
    <div className="App">
      {!walletAddress && (
        <button onClick={connectWallet}>Connect Wallet</button>
      )}

      {walletAddress && !group && (
        <div className="forms">
          <div className="deploy">
            <h2>Create Templ</h2>
            <input
              placeholder="Token address"
              value={tokenAddress}
              onChange={(e) => setTokenAddress(e.target.value)}
            />
            <input
              placeholder="Entry fee"
              value={entryFee}
              onChange={(e) => setEntryFee(e.target.value)}
            />
            <input
              placeholder="Priest vote weight"
              value={priestVoteWeight}
              onChange={(e) => setPriestVoteWeight(e.target.value)}
            />
            <input
              placeholder="Priest weight threshold"
              value={priestWeightThreshold}
              onChange={(e) => setPriestWeightThreshold(e.target.value)}
            />
            <button onClick={handleDeploy}>Deploy</button>
            {templAddress && (
              <div>
                <p>Contract: {templAddress}</p>
                <p>Group ID: {groupId}</p>
              </div>
            )}
          </div>
          <div className="join">
            <h2>Join Existing Templ</h2>
            <input
              placeholder="Contract address"
              value={templAddress}
              onChange={(e) => setTemplAddress(e.target.value)}
            />
            <button onClick={handlePurchaseAndJoin}>Purchase & Join</button>
          </div>
        </div>
      )}

      {group && (
        <div className="chat">
          <h2>Group Chat</h2>
          <div className="messages">
            {messages.map((m, i) => (
              <div key={i}>
                <strong>{m.senderAddress}:</strong> {m.content}
              </div>
            ))}
          </div>
          <input
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
          />
          <button onClick={handleSend}>Send</button>
        </div>
      )}
    </div>
  );
}

export default App;
