import { useCallback, useEffect, useMemo, useState } from 'react';
import { sanitizeLink } from '../../../shared/linkSanitizer.js';
import templArtifact from '../contracts/TEMPL.json';
import { approveEntryFee, loadEntryRequirements, purchaseAccess, verifyMembership } from '../services/membership.js';
import { button, form, layout, surface, text } from '../ui/theme.js';

function DetailRow({ label, value, emphasis }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <dt className="text-slate-600">{label}</dt>
      <dd className={`font-mono text-xs ${emphasis || 'text-slate-800'}`}>{value}</dd>
    </div>
  );
}

export function JoinTemplPage({
  ethers,
  signer,
  walletAddress,
  onConnectWallet,
  pushMessage,
  query,
  templs: knownTempls = [],
  readProvider,
  refreshTempls
}) {
  const [templAddress, setTemplAddress] = useState('');
  const [purchasePending, setPurchasePending] = useState(false);
  const [approvePending, setApprovePending] = useState(false);
  const [verification, setVerification] = useState(null);
  const [entryInfo, setEntryInfo] = useState(null);
  const [loadingEntry, setLoadingEntry] = useState(false);

  useEffect(() => {
    const fromQuery = query.get('address');
    if (fromQuery) {
      setTemplAddress(fromQuery.trim());
    }
  }, [query]);

  const hasWallet = useMemo(() => Boolean(walletAddress), [walletAddress]);

  const templRecord = useMemo(() => {
    if (!templAddress) return null;
    const target = templAddress.toLowerCase();
    return knownTempls.find((item) => item.contract === target) || null;
  }, [knownTempls, templAddress]);

  const tokenAddress = useMemo(() => {
    if (entryInfo?.tokenAddress) return entryInfo.tokenAddress;
    if (templRecord?.tokenAddress) return templRecord.tokenAddress;
    return null;
  }, [entryInfo, templRecord]);

  const entryFeeWei = useMemo(() => {
    if (entryInfo?.entryFeeWei) return entryInfo.entryFeeWei;
    if (templRecord?.entryFeeRaw) return templRecord.entryFeeRaw;
    return null;
  }, [entryInfo, templRecord]);

  const entryFeeDisplay = useMemo(() => {
    if (entryInfo?.entryFeeFormatted) {
      const suffix = entryInfo.tokenSymbol ? ` ${entryInfo.tokenSymbol}` : '';
      return `${entryInfo.entryFeeFormatted}${suffix}`;
    }
    if (templRecord?.entryFeeFormatted) {
      const suffix = templRecord.tokenSymbol ? ` ${templRecord.tokenSymbol}` : '';
      return `${templRecord.entryFeeFormatted}${suffix}`;
    }
    return templRecord?.entryFeeRaw || entryInfo?.entryFeeWei || '—';
  }, [entryInfo, templRecord]);

  const allowanceSatisfied = useMemo(() => {
    if (!entryFeeWei) return false;
    if (!entryInfo?.allowanceWei) return false;
    try {
      return BigInt(entryInfo.allowanceWei) >= BigInt(entryFeeWei);
    } catch {
      return false;
    }
  }, [entryInfo?.allowanceWei, entryFeeWei]);

  const allowanceDisplay = useMemo(() => {
    if (!entryInfo?.allowanceFormatted) return null;
    const suffix = entryInfo.tokenSymbol ? ` ${entryInfo.tokenSymbol}` : '';
    return `${entryInfo.allowanceFormatted}${suffix}`;
  }, [entryInfo]);

  const balanceDisplay = useMemo(() => {
    if (!entryInfo?.balanceFormatted) return null;
    const suffix = entryInfo.tokenSymbol ? ` ${entryInfo.tokenSymbol}` : '';
    return `${entryInfo.balanceFormatted}${suffix}`;
  }, [entryInfo]);

  const refreshEntryInfo = useCallback(async () => {
    if (!ethers || !templAddress) {
      setEntryInfo(null);
      return;
    }
    if (!/^0x[0-9a-fA-F]{40}$/.test(templAddress)) {
      setEntryInfo(null);
      return;
    }
    if (!signer && !readProvider) {
      setEntryInfo(null);
      return;
    }
    setLoadingEntry(true);
    try {
      const info = await loadEntryRequirements({
        ethers,
        templAddress,
        templArtifact,
        signer,
        provider: readProvider,
        walletAddress
      });
      setEntryInfo(info);
    } catch (err) {
      setEntryInfo(null);
      if (err?.message) {
        pushMessage?.(`Failed to load entry details: ${err.message}`);
      }
    } finally {
      setLoadingEntry(false);
    }
  }, [ethers, templAddress, signer, readProvider, walletAddress, pushMessage]);

  useEffect(() => {
    void refreshEntryInfo();
  }, [refreshEntryInfo]);

  const ensureWallet = () => {
    if (!hasWallet) {
      onConnectWallet?.();
      return false;
    }
    return true;
  };

  const handleApprove = async () => {
    if (!ensureWallet()) return;
    if (!tokenAddress || !entryFeeWei) {
      pushMessage?.('Templ configuration missing token or entry fee.');
      return;
    }
    setApprovePending(true);
    pushMessage?.('Approving entry fee…');
    try {
      await approveEntryFee({
        ethers,
        signer,
        templAddress,
        tokenAddress,
        amount: entryFeeWei,
        walletAddress
      });
      pushMessage?.('Allowance approved.');
      await refreshEntryInfo();
    } catch (err) {
      pushMessage?.(`Approval failed: ${err?.message || err}`);
    } finally {
      setApprovePending(false);
    }
  };

  const handlePurchase = async () => {
    if (!ensureWallet()) return;
    setPurchasePending(true);
    pushMessage?.('Purchasing access…');
    try {
      const result = await purchaseAccess({
        ethers,
        signer,
        templAddress,
        templArtifact,
        walletAddress,
        tokenAddress,
        entryFee: entryFeeWei
      });
      pushMessage?.(result.purchased ? 'Access purchase complete' : 'You already have access');
      await refreshEntryInfo();
      await refreshTempls?.();
    } catch (err) {
      pushMessage?.(`Purchase failed: ${err?.message || err}`);
    } finally {
      setPurchasePending(false);
    }
  };

  const handleVerify = async () => {
    if (!ensureWallet()) return;
    setPurchasePending(true);
    pushMessage?.('Verifying membership…');
    try {
      const data = await verifyMembership({
        signer,
        templAddress,
        walletAddress
      });
      setVerification(data);
      pushMessage?.('Membership verified');
    } catch (err) {
      pushMessage?.(`Verification failed: ${err?.message || err}`);
    } finally {
      setPurchasePending(false);
    }
  };

  const sanitizedTemplLink = sanitizeLink(templRecord?.templHomeLink);

  return (
    <div className={layout.page}>
      <header className={layout.header}>
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Join a templ</h1>
          <p className="max-w-2xl text-sm text-slate-600">
            Confirm the templ address, review the entry requirements, then approve and purchase access. If you already joined,
            use the verification step to check your membership status.
          </p>
        </div>
        {hasWallet ? null : (
          <button type="button" className={button.primary} onClick={onConnectWallet}>
            Connect wallet
          </button>
        )}
      </header>

      <section className={`${layout.card} space-y-4`}>
        <div className={layout.sectionHeader}>
          <h2 className="text-xl font-semibold text-slate-900">Step 1 · Identify the templ</h2>
          {templRecord ? <span className={surface.pill}>Known templ</span> : null}
        </div>
        <label className={form.label}>
          Templ address
          <input
            type="text"
            className={form.input}
            value={templAddress}
            onChange={(e) => setTemplAddress(e.target.value.trim())}
            placeholder="0x…"
          />
          <span className={text.hint}>Paste the contract address shared by the templ priest.</span>
        </label>
        <div className={`${layout.cardActions} justify-between`}>
          <div className="text-xs text-slate-500">
            {templRecord ? 'Loaded details from the templ registry.' : 'Enter a full 42-character Ethereum address.'}
          </div>
          <button type="button" className={button.muted} onClick={refreshEntryInfo} disabled={loadingEntry}>
            {loadingEntry ? 'Refreshing…' : 'Check entry details'}
          </button>
        </div>
        {sanitizedTemplLink.text ? (
          <p className={text.hint}>
            Home link:{' '}
            {sanitizedTemplLink.href ? (
              <a className="text-primary underline" href={sanitizedTemplLink.href} target="_blank" rel="noreferrer">
                {sanitizedTemplLink.text}
              </a>
            ) : (
              sanitizedTemplLink.text
            )}
          </p>
        ) : null}
      </section>

      <section className={`${layout.card} space-y-4`}>
        <div className={layout.sectionHeader}>
          <h2 className="text-xl font-semibold text-slate-900">Step 2 · Review entry requirements</h2>
          {loadingEntry ? <span className={text.hint}>Fetching token allowances…</span> : null}
        </div>
        {(templRecord || entryInfo) ? (
          <dl className="space-y-3 rounded-2xl bg-slate-50 px-4 py-3">
            <DetailRow label="Access token" value={tokenAddress || 'Unknown'} />
            <DetailRow label="Entry fee" value={entryFeeDisplay} />
            {allowanceDisplay ? (
              <DetailRow
                label="Approved allowance"
                value={allowanceDisplay}
                emphasis={allowanceSatisfied ? 'text-emerald-600' : 'text-amber-600'}
              />
            ) : null}
            {balanceDisplay ? <DetailRow label="Wallet balance" value={balanceDisplay} /> : null}
          </dl>
        ) : (
          <p className="text-sm text-slate-600">Enter a templ address above to load the entry configuration.</p>
        )}
        <p className={text.hint}>
          Allowances must cover the entire entry fee. Approve first, then purchase access. Both actions require wallet
          confirmation.
        </p>
      </section>

      <section className={`${layout.card} space-y-4`}>
        <div className={layout.sectionHeader}>
          <h2 className="text-xl font-semibold text-slate-900">Step 3 · Join and verify</h2>
          {!hasWallet ? <span className={text.hint}>Connect a wallet to enable the buttons</span> : null}
        </div>
        <div className={`${layout.cardActions} flex-wrap`}>
          <button
            type="button"
            className={button.base}
            onClick={handleApprove}
            disabled={approvePending || purchasePending || !templAddress || !hasWallet || !entryFeeWei || allowanceSatisfied}
          >
            {approvePending ? 'Approving…' : allowanceSatisfied ? 'Allowance ready' : 'Approve entry fee'}
          </button>
          <button
            type="button"
            className={button.primary}
            onClick={handlePurchase}
            disabled={purchasePending || !templAddress || !hasWallet || !allowanceSatisfied}
          >
            {purchasePending ? 'Purchasing…' : 'Purchase access'}
          </button>
          <button
            type="button"
            className={button.base}
            onClick={handleVerify}
            disabled={purchasePending || approvePending || !templAddress}
          >
            Verify membership
          </button>
        </div>
        <p className={text.hint}>
          Need to retry later? You can return to this page with <code className={`${text.mono} text-xs`}>/templs/join?address={templAddress || '...'}</code>.
        </p>
      </section>

      {verification && (
        <section className={`${layout.card} space-y-4`}>
          <div className={layout.sectionHeader}>
            <h2 className="text-xl font-semibold text-slate-900">Membership details</h2>
            <span className={surface.pill}>Verified member</span>
          </div>
          <dl className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Member address</dt>
              <dd className={`${text.mono} text-xs`}>{verification.member?.address || 'Unknown'}</dd>
            </div>
            <div className="space-y-1">
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Priest</dt>
              <dd className={`${text.mono} text-xs`}>{verification.templ?.priest || 'Unknown'}</dd>
            </div>
            <div className="space-y-1">
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Telegram chat id</dt>
              <dd className={text.subtle}>
                {verification.templ?.telegramChatId
                  ? verification.templ.telegramChatId
                  : verification.templ?.telegramChatIdHidden
                    ? 'Stored server-side'
                    : '—'}
              </dd>
            </div>
            <div className="space-y-1">
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Home link</dt>
              <dd>
                {(() => {
                  const { href, text: displayText } = sanitizeLink(verification.templ?.templHomeLink);
                  if (!displayText) return '—';
                  if (!href) return displayText;
                  return (
                    <a className="text-primary underline" href={href} target="_blank" rel="noreferrer">
                      {displayText}
                    </a>
                  );
                })()}
              </dd>
            </div>
          </dl>
          {verification.links && (
            <ul className="mt-4 list-disc space-y-2 pl-6 text-sm text-slate-700">
              {Object.entries(verification.links).map(([key, value]) => (
                <li key={key}>
                  <a className="text-primary underline" href={value} target="_blank" rel="noreferrer">{key}</a>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
