import { layout, surface, table, text, button } from '../ui/theme.js';

export function HomePage({ walletAddress, onConnectWallet, onDisconnectWallet, onNavigate, templs, loadingTempls, refreshTempls }) {
  return (
    <div className={layout.page}>
      <header className={layout.header}>
        <h1 className="text-3xl font-semibold tracking-tight">Templs</h1>
        <div className="flex items-center gap-3">
          {walletAddress ? (
            <>
              <span className={surface.pill}>
                {walletAddress.slice(0, 6)}…{walletAddress.slice(-4)}
              </span>
              <button type="button" onClick={() => onDisconnectWallet?.()} className={button.base}>
                Disconnect
              </button>
            </>
          ) : (
            <button type="button" onClick={onConnectWallet} className={button.primary}>
              Connect Wallet
            </button>
          )}
        </div>
      </header>

      <section className={layout.card}>
        <div className={layout.sectionHeader}>
          <h2 className="text-xl font-semibold text-slate-900">Available templs</h2>
          <button type="button" className={button.base} onClick={refreshTempls} disabled={loadingTempls}>
            {loadingTempls ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
        {templs.length === 0 ? (
          <p className={text.subtle}>No templs discovered yet. Deploy from the factory or ask an operator to register one.</p>
        ) : (
          <div className={`${layout.tableWrapper} mt-4`}>
            <table className={table.base}>
              <thead className={table.headRow}>
                <tr>
                  <th className={table.headCell}>Templ</th>
                  <th className={table.headCell}>Token</th>
                  <th className={table.headCell}>Entry fee</th>
                  <th className={table.headCell}>Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {templs.map((templ) => (
                  <tr key={templ.contract} className="bg-white">
                    <td className={`${table.cell} ${text.mono}`}>{templ.contract}</td>
                    <td className={table.cell}>{templ.tokenSymbol || '—'}</td>
                    <td className={table.cell}>{templ.entryFeeFormatted || templ.entryFeeRaw || '—'}</td>
                    <td className={table.cell}>
                      <button
                        type="button"
                        className={button.primary}
                        onClick={() => onNavigate(`/templs/join?address=${templ.contract}`)}
                      >
                        Join
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export default HomePage;
