# PR Description

## Summary
- Fix external reward remainder handling and add external token reconciliation.
- Add slippage-protected joins, proposal cancellation, and post-quorum bounds.
- Allow single-member councils (still blocks removal to zero).
- Align defaults/docs/tests for 51% YES threshold and uniform proposal fees.

## Changes
- External rewards: flush dust on join, carry remainders into disbands, reconcile external tokens, and guard withdraw accounting; selectors/tests updated.
- Membership: add `maxEntryFee` join variants and enforce `EntryFeeTooHigh`.
- Governance/council: add proposer cancellation (pre-other-votes), enforce post-quorum bounds, remove council fee waiver, require priest to be a member, allow council count down to one; selectors/tests updated.
- Defaults/docs/scripts: set YES threshold default to 5,100 bps and document slippage/cancel/bounds; deploy script validates post-quorum bounds.
- Audit response: `AUDIT_CONTRIBUTOR_1.md` summary + `RESPONSE_TO_AUDIT_1.md` details.
- Misc: ASCII-only Solidity comments cleanup; removed old audit docs.

## Testing
- `source /Users/worms/.nvm/nvm.sh && nvm use stable && npm test`

## Not Run
- `npm run test:load`
