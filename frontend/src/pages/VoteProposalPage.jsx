import { useState } from 'react';
import templArtifact from '../contracts/TEMPL.json';
import { voteOnProposal } from '../services/governance.js';
import { button, form, layout, surface, text } from '../ui/theme.js';

export function VoteProposalPage({
  ethers,
  signer,
  templAddress,
  proposalId,
  onConnectWallet,
  pushMessage
}) {
  const [support, setSupport] = useState('yes');
  const [pending, setPending] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!signer) {
      onConnectWallet?.();
      return;
    }
    setPending(true);
    pushMessage?.('Casting vote…');
    try {
      await voteOnProposal({
        ethers,
        signer,
        templAddress,
        templArtifact,
        proposalId,
        support: support === 'yes'
      });
      pushMessage?.('Vote submitted');
    } catch (err) {
      pushMessage?.(`Vote failed: ${err?.message || err}`);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className={layout.page}>
      <header className={layout.header}>
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Vote on proposal</h1>
          <p className="text-sm text-slate-600">
            Review the options below and confirm your vote. Your choice is recorded on-chain and cannot be changed after
            submission.
          </p>
        </div>
        <span className={surface.pill}>Templ {templAddress}</span>
      </header>
      <section className={`${layout.card} space-y-4`}>
        <div className="space-y-1 text-sm text-slate-600">
          <p>Proposal #{proposalId}</p>
          <p className={text.hint}>Connect your wallet if the vote buttons are disabled.</p>
        </div>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <label className={form.radio}>
            <input
              type="radio"
              name="support"
              value="yes"
              className="h-4 w-4 border-slate-300 text-primary focus:ring-primary"
              checked={support === 'yes'}
              onChange={(e) => setSupport(e.target.value)}
            />
            Support (YES)
          </label>
          <label className={form.radio}>
            <input
              type="radio"
              name="support"
              value="no"
              className="h-4 w-4 border-slate-300 text-primary focus:ring-primary"
              checked={support === 'no'}
              onChange={(e) => setSupport(e.target.value)}
            />
            Oppose (NO)
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className={button.primary} disabled={pending}>
              {pending ? 'Submitting…' : 'Submit vote'}
            </button>
            <span className={text.hint}>A transaction window will appear in your wallet.</span>
          </div>
        </form>
      </section>
    </div>
  );
}
