// Aggregated exports bridging legacy chat flows with modular services
export { deployTempl, registerTemplBackend } from './services/deployment.js';
export {
  loadEntryRequirements,
  approveEntryFee,
  joinTempl,
  verifyMembership,
  fetchMemberPoolStats,
  claimMemberPool
} from './services/membership.js';
export {
  proposeVote,
  voteOnProposal,
  executeProposal,
  watchProposals,
  fetchGovernanceParameters
} from './services/governance.js';
export { fetchTemplStats, loadFactoryTempls } from './services/templs.js';
