const hre = require("hardhat");
require("dotenv").config();

function normalizeAddress(value, label) {
  if (!value || typeof value !== 'string') {
    throw new Error(`${label} must be provided`);
  }
  const trimmed = value.trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
    throw new Error(`${label} must be a valid 42-character hex address`);
  }
  return trimmed;
}

async function main() {
  const backendUrlRaw = (process.env.BACKEND_URL || process.env.TEMPL_BACKEND_URL || '').trim();
  if (!backendUrlRaw) {
    throw new Error('BACKEND_URL must be set (e.g. http://localhost:3001)');
  }
  const templAddress = normalizeAddress(process.env.TEMPL_ADDRESS || process.env.CONTRACT_ADDRESS, 'TEMPL_ADDRESS');
  const priestEnv = process.env.PRIEST_ADDRESS || '';
  const telegramChatId = (process.env.TELEGRAM_CHAT_ID || process.env.CHAT_ID || '').trim();
  const templHomeLink = process.env.TEMPL_HOME_LINK || process.env.HOME_LINK || '';

  const signers = await hre.ethers.getSigners();
  const signer = signers[0];
  if (!signer) {
    throw new Error('No Hardhat signer available. Export PRIVATE_KEY for this network.');
  }
  const signerAddress = await signer.getAddress();
  const priestAddress = priestEnv ? normalizeAddress(priestEnv, 'PRIEST_ADDRESS') : signerAddress;
  if (signerAddress.toLowerCase() !== priestAddress.toLowerCase()) {
    throw new Error(`Signer ${signerAddress} does not match priest ${priestAddress}. Export PRIVATE_KEY for the priest wallet.`);
  }

  const network = await signer.provider.getNetwork();
  const chainId = Number(network.chainId);

  const { buildCreateTypedData } = await import('../shared/signing.js');
  const typed = buildCreateTypedData({ chainId, contractAddress: templAddress.toLowerCase() });
  const signature = await signer.signTypedData(typed.domain, typed.types, typed.message);

  const payload = {
    contractAddress: templAddress,
    priestAddress,
    signature,
    chainId,
    nonce: typed.message.nonce,
    issuedAt: typed.message.issuedAt,
    expiry: typed.message.expiry
  };
  if (telegramChatId) payload.telegramChatId = telegramChatId;
  if (templHomeLink) payload.templHomeLink = templHomeLink;

  const url = `${backendUrlRaw.replace(/\/$/, '')}/templs`;
  console.log(`Registering templ ${templAddress} with backend ${url} ...`);
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Backend registration failed (${response.status} ${response.statusText}): ${text}`);
  }
  try {
    const result = JSON.parse(text);
    console.log('Registration response:', result);
  } catch {
    console.log('Registration response:', text);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Registration failed:', error);
    process.exit(1);
  });
