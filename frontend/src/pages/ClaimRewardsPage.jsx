import { useCallback, useEffect, useMemo, useState } from 'react';
import templArtifact from '../contracts/TEMPL.json';
import { claimMemberRewards, fetchMemberPoolStats } from '../services/membership.js';
import { button, layout, surface, text } from '../ui/theme.js';

function formatAmount(value) {
  if (value === null || value === undefined) return '0';
  try {
    return BigInt(value).toString();
  } catch {
    return String(value);
  }
}

export function ClaimRewardsPage({
  ethers,
  signer,
  walletAddress,
  templAddress,
  onConnectWallet,
  pushMessage
}) {
  const [stats, setStats] = useState({ poolBalance: '0', memberClaimed: '0' });
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(false);

  const hasWallet = useMemo(() => Boolean(walletAddress), [walletAddress]);

  const loadStats = useCallback(async () => {
    if (!templAddress || !ethers || !signer) return;
    setLoading(true);
    try {
      const data = await fetchMemberPoolStats({
        ethers,
        signer,
        templAddress,
        templArtifact,
        memberAddress: walletAddress
      });
      setStats(data);
    } catch (err) {
      pushMessage?.(`Failed to load member pool stats: ${err?.message || err}`);
    } finally {
      setLoading(false);
    }
  }, [templAddress, ethers, signer, walletAddress, pushMessage]);

  useEffect(() => {
    if (!templAddress || !signer) return;
    void loadStats();
  }, [templAddress, signer, walletAddress, loadStats]);

  const ensureWallet = () => {
    if (!hasWallet || !signer) {
      onConnectWallet?.();
      return false;
    }
    return true;
  };

  const handleClaim = async () => {
    if (!ensureWallet()) return;
    setPending(true);
    pushMessage?.('Claiming member pool rewards…');
    try {
      await claimMemberRewards({
        ethers,
        signer,
        templAddress,
        templArtifact,
        walletAddress
      });
      pushMessage?.('Rewards claimed successfully');
      await loadStats();
    } catch (err) {
      pushMessage?.(`Claim failed: ${err?.message || err}`);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className={layout.page}>
      <header className={layout.header}>
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Claim member rewards</h1>
          <p className="text-sm text-slate-600">
            Withdraw your share of the member reward pool. Balances update after each claim, so refresh before submitting the
            transaction.
          </p>
        </div>
        <span className={surface.pill}>Templ {templAddress}</span>
      </header>
      <section className={`${layout.card} space-y-6`}>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Member pool balance</h2>
            <p className={`${text.mono} text-sm`}>{formatAmount(stats.poolBalance)}</p>
            <p className={text.hint}>Total rewards currently available to eligible members (raw token units).</p>
          </div>
          <div className="space-y-1">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">You have claimed</h2>
            <p className={`${text.mono} text-sm`}>{formatAmount(stats.memberClaimed)}</p>
            <p className={text.hint}>Historical total claimed by this wallet in raw token units.</p>
          </div>
        </div>
        <div className={`${layout.cardActions} flex-wrap`}>
          <button type="button" className={button.base} onClick={loadStats} disabled={loading || pending}>
            {loading ? 'Refreshing…' : 'Refresh balances'}
          </button>
          <button type="button" className={button.primary} onClick={handleClaim} disabled={pending || loading}>
            {pending ? 'Claiming…' : 'Claim rewards'}
          </button>
        </div>
        {!hasWallet ? (
          <p className={text.hint}>Connect your wallet to initiate the claim transaction.</p>
        ) : (
          <p className={text.hint}>Rewards are sent directly to your connected wallet.</p>
        )}
      </section>
    </div>
  );
}
