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

function resolvePercentToBps({ label, percentValue, bpsValue }) {
  const percentCandidate = percentValue ?? '';
  if (percentCandidate && String(percentCandidate).trim() !== '') {
    const parsed = Number(String(percentCandidate).trim());
    if (!Number.isFinite(parsed)) {
      throw new Error(`${label} percent must be a finite number`);
    }
    if (parsed < 0 || parsed > 100) {
      throw new Error(`${label} percent must be between 0 and 100`);
    }
    return Math.round(parsed * 100);
  }
  const bpsCandidate = bpsValue ?? '';
  if (bpsCandidate && String(bpsCandidate).trim() !== '') {
    const parsed = Number(String(bpsCandidate).trim());
    if (!Number.isFinite(parsed)) {
      throw new Error(`${label} bps must be a finite number`);
    }
    if (parsed < 0 || parsed > 10_000) {
      throw new Error(`${label} bps must be between 0 and 10,000`);
    }
    return Math.round(parsed);
  }
  return 0;
}

async function main() {
  const backendUrlRaw = (process.env.BACKEND_URL || process.env.TEMPL_BACKEND_URL || '').trim();
  if (!backendUrlRaw) {
    throw new Error('BACKEND_URL must be set (e.g. http://localhost:3001)');
  }
  const templAddress = normalizeAddress(process.env.TEMPL_ADDRESS || process.env.CONTRACT_ADDRESS, 'TEMPL_ADDRESS');
  const priestEnv = process.env.PRIEST_ADDRESS || '';
  const telegramChatId = (process.env.TELEGRAM_CHAT_ID || process.env.CHAT_ID || '').trim();
  const templName = (process.env.TEMPL_NAME ?? 'Templ').trim() || 'Templ';
  const templDescription = (process.env.TEMPL_DESCRIPTION ?? '').trim();
  const templLogoLink = (process.env.TEMPL_LOGO_LINK ?? process.env.TEMPL_LOGO_URL ?? '').trim();
  const proposalFeeBps = resolvePercentToBps({
    label: 'PROPOSAL_FEE',
    percentValue: process.env.PROPOSAL_FEE_PERCENT ?? process.env.PROPOSAL_FEE_PCT,
    bpsValue: process.env.PROPOSAL_FEE_BPS
  });
  const referralShareBps = resolvePercentToBps({
    label: 'REFERRAL_SHARE',
    percentValue: process.env.REFERRAL_SHARE_PERCENT ?? process.env.REFERRAL_PERCENT,
    bpsValue: process.env.REFERRAL_SHARE_BPS ?? process.env.REFERRAL_BPS
  });

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
  payload.templName = templName;
  payload.templDescription = templDescription;
  payload.templLogoLink = templLogoLink;
  payload.proposalFeeBps = proposalFeeBps;
  payload.referralShareBps = referralShareBps;

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
