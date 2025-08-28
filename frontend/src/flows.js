export async function deployTempl({ ethers, xmtp, signer, walletAddress, tokenAddress, entryFee, priestVoteWeight, priestWeightThreshold, templArtifact, backendUrl = 'http://localhost:3001' }) {
  const factory = new ethers.ContractFactory(
    templArtifact.abi,
    templArtifact.bytecode,
    signer
  );
  const contract = await factory.deploy(
    walletAddress,
    walletAddress,
    tokenAddress,
    BigInt(entryFee),
    BigInt(priestVoteWeight),
    BigInt(priestWeightThreshold)
  );
  await contract.waitForDeployment();
  const contractAddress = await contract.getAddress();
  const res = await fetch(`${backendUrl}/templs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contractAddress,
      priestAddress: walletAddress
    })
  });
  const data = await res.json();
  const group = await xmtp.conversations.getGroup(data.groupId);
  return { contractAddress, group, groupId: data.groupId };
}

export async function purchaseAndJoin({ ethers, xmtp, signer, walletAddress, templAddress, templArtifact, backendUrl = 'http://localhost:3001' }) {
  const contract = new ethers.Contract(templAddress, templArtifact.abi, signer);
  const purchased = await contract.hasPurchased(walletAddress);
  if (!purchased) {
    const tx = await contract.purchaseAccess();
    await tx.wait();
  }
  const res = await fetch(`${backendUrl}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contractAddress: templAddress,
      memberAddress: walletAddress
    })
  });
  if (!res.ok) return null;
  const data = await res.json();
  const group = await xmtp.conversations.getGroup(data.groupId);
  return { group, groupId: data.groupId };
}

export async function sendMessage({ group, content }) {
  await group.send(content);
}
