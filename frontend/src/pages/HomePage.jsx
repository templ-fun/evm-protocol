import { useMemo } from 'react';
import { BACKEND_URL } from '../config.js';
import { sanitizeLink } from '../../../shared/linkSanitizer.js';
import { button, layout, surface, text } from '../ui/theme.js';
import { formatTokenDisplay } from '../ui/format.js';
import { ethers } from 'ethers';

function splitDisplay(display) {
  if (!display) return ['0', ''];
  const parts = display.split(' ');
  if (parts.length <= 1) return [display, ''];
  return [parts[0], parts.slice(1).join(' ')];
}

function Metric({ label, value, hint }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl bg-slate-50 px-4 py-3 text-sm">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <span className="text-base font-semibold text-slate-900">{value}</span>
      {hint ? <span className={text.hint}>{hint}</span> : null}
    </div>
  );
}

export function HomePage({ walletAddress, onConnectWallet, onNavigate, templs, loadingTempls, refreshTempls }) {
  const { templCount, memberTotal, activeTreasuries } = useMemo(() => {
    const count = templs.length;
    let memberSum = 0;
    let treasuryWithBalance = 0;
    for (const templ of templs) {
      if (Number.isFinite(templ.memberCount)) {
        memberSum += templ.memberCount;
      }
      try {
        if (templ.treasuryBalanceRaw && BigInt(templ.treasuryBalanceRaw) > 0n) {
          treasuryWithBalance += 1;
        }
      } catch {
        /* ignore */
      }
    }
    return { templCount: count, memberTotal: memberSum, activeTreasuries: treasuryWithBalance };
  }, [templs]);

  return (
    <div className={layout.page}>
      <header className={layout.header}>
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Templ control center</h1>
          <p className="max-w-xl text-sm text-slate-600">
            Launch, operate, and monitor templ communities from a single workspace. Use the quick actions below to start a new
            templ or jump back into an existing one.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2 text-sm">
          {walletAddress ? (
            <span className={surface.pill}>
              Wallet connected: {walletAddress.slice(0, 6)}…{walletAddress.slice(-4)}
            </span>
          ) : (
            <button type="button" onClick={onConnectWallet} className={button.primary}>
              Connect wallet
            </button>
          )}
          <button type="button" className={button.muted} onClick={refreshTempls} disabled={loadingTempls}>
            {loadingTempls ? 'Refreshing templs…' : 'Refresh templ list'}
          </button>
          <span className={text.hint}>Data source: {BACKEND_URL}</span>
        </div>
      </header>

      <section className={`${layout.card} space-y-4`}>
        <div className={layout.sectionHeader}>
          <h2 className="text-xl font-semibold text-slate-900">Get started</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <button type="button" className={`${button.primary} justify-start`} onClick={() => onNavigate('/templs/create')}>
            <div className="flex flex-col text-left">
              <span className="text-base font-semibold">Create a templ</span>
              <span className="text-sm text-slate-800/80">
                Configure membership rules, treasury splits, and Telegram routing in a guided flow.
              </span>
            </div>
          </button>
          <button type="button" className={`${button.base} justify-start`} onClick={() => onNavigate('/templs/join')}>
            <div className="flex flex-col text-left">
              <span className="text-base font-semibold">Join a templ</span>
              <span className="text-sm text-slate-800/80">
                Review entry fees, approve the access token, and confirm membership in a few clicks.
              </span>
            </div>
          </button>
        </div>
        <p className={text.hint}>
          Looking for a specific templ? Paste its address on the Join screen or open it from the list below.
        </p>
      </section>

      <section className={`${layout.card} space-y-4`}>
        <div className={layout.sectionHeader}>
          <h2 className="text-xl font-semibold text-slate-900">Network snapshot</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Metric label="Templs discovered" value={templCount} hint="Tracked from the connected factory" />
          <Metric label="Members observed" value={memberTotal || '—'} hint="Total known members across templs" />
          <Metric label="Treasuries with balance" value={activeTreasuries} hint="Templs holding non-zero reserves" />
        </div>
      </section>

      <section className={`${layout.card} space-y-4`}>
        <div className={layout.sectionHeader}>
          <h2 className="text-xl font-semibold text-slate-900">Registered templs</h2>
          <p className={text.hint}>
            {loadingTempls
              ? 'Refreshing on-chain and off-chain data…'
              : 'Sorted alphabetically. Open a templ to manage proposals, rewards, and Telegram bindings.'}
          </p>
        </div>
        {templs.length === 0 ? (
          <p className="text-sm text-slate-600">No templs discovered for this factory yet.</p>
        ) : (
          <ul className="space-y-4">
            {templs.map((templ) => {
              const sanitizedHomeLink = sanitizeLink(templ.links?.homeLink || templ.templHomeLink);
              const [treasuryValue, treasuryUnit] = splitDisplay(
                formatTokenDisplay(ethers.formatUnits, templ.treasuryBalanceRaw, templ.tokenDecimals)
              );
              const [poolValue, poolUnit] = splitDisplay(
                formatTokenDisplay(ethers.formatUnits, templ.memberPoolBalanceRaw, templ.tokenDecimals)
              );
              const [burnedValue, burnedUnit] = splitDisplay(
                formatTokenDisplay(ethers.formatUnits, templ.burnedRaw, templ.tokenDecimals)
              );
              return (
                <li key={templ.contract} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`${surface.badge} font-semibold`}>{templ.tokenSymbol || 'Access token'}</span>
                        <span className={surface.badge}>Members: {Number.isFinite(templ.memberCount) ? templ.memberCount : '—'}</span>
                        {templ.totalPurchases ? (
                          <span className={surface.badge}>Total joins: {templ.totalPurchases}</span>
                        ) : null}
                      </div>
                      <h3 className="text-lg font-semibold text-slate-900">{templ.priest || 'Templ'}</h3>
                      <p className={`${text.hint} font-mono text-xs`}>{templ.contract}</p>
                    </div>
                    <div className="flex flex-col gap-3 text-right text-sm text-slate-700">
                      <div>
                        <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Entry fee</span>
                        <span className="font-mono text-sm">
                          {templ.entryFeeFormatted
                            ? `${templ.entryFeeFormatted}${templ.tokenSymbol ? ` ${templ.tokenSymbol}` : ''}`
                            : templ.entryFeeRaw || '—'}
                        </span>
                      </div>
                      <div>
                        <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Treasury</span>
                        <span className="flex flex-col text-right font-mono text-sm leading-tight">
                          <span>{treasuryValue}</span>
                          {treasuryUnit ? <span className="text-xs text-slate-500">{treasuryUnit}</span> : null}
                        </span>
                      </div>
                      <div className="flex flex-col gap-1 text-xs text-slate-500">
                        <span>Member pool: {poolValue}{poolUnit ? ` ${poolUnit}` : ''}</span>
                        <span>Burned: {burnedValue}{burnedUnit ? ` ${burnedUnit}` : ''}</span>
                      </div>
                    </div>
                  </div>
                  <div className={`${layout.cardActions} mt-4`}>
                    <button
                      type="button"
                      className={button.primary}
                      onClick={() => onNavigate(templ.links?.overview || `/templs/${templ.contract}`)}
                    >
                      Open templ overview
                    </button>
                    <button type="button" className={button.base} onClick={() => onNavigate(`/templs/join?address=${templ.contract}`)}>
                      Join this templ
                    </button>
                    {sanitizedHomeLink.href ? (
                      <a className={button.link} href={sanitizedHomeLink.href} target="_blank" rel="noreferrer">
                        Visit home link
                      </a>
                    ) : sanitizedHomeLink.text ? (
                      <span className={text.subtle}>{sanitizedHomeLink.text}</span>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
