## External Reward “Dust” Allocation Can Be Diluted by Later Joins (Remainder Not Flushed)
Location: `TemplMembership.sol` `_join()` (around lines 62–144) and `TemplBase.sol` `_flushExternalRemainders()`

Issue:
External rewards distributed via `_disbandTreasury()` track:

- `externalRewards[token].cumulativeRewards` (claimable via snapshots), and
- `externalRewards[token].rewardRemainder` (dust that is not claimable yet until it is converted into `cumulativeRewards`).

The codebase includes `_flushExternalRemainders()` to periodically convert that dust into per-member rewards when divisible by the current `memberCount`. However, `_flushExternalRemainders()` is never called in production code paths (it appears to exist for completeness and/or is only exercised by tests/harnesses), including not being invoked in `_join()`.

Because joins increase `memberCount`, any previously accumulated `rewardRemainder` will—when eventually flushed—be divided by a larger member set than the one that existed when the dust was created.

Impact: This does not reduce already-accrued claimable rewards (those are already accounted for in `cumulativeRewards`). But it is a fairness / timing issue:

- Existing members may receive less of historical dust than they would have if dust were flushed before membership increased.
- New members may receive a share of old dust (once it becomes distributable) even though it accrued before they joined.

Recommendation: If the intended policy is “dust should benefit only the member set that existed when it was generated”:

- Call `_flushExternalRemainders()` at the start of `_join()` (before incrementing `memberCount`), or
- Implement a bounded/rotating flush mechanism to avoid worst-case join gas when many external reward tokens exist (since flushing loops over `externalRewardTokens`).

## No Validation on Post-Quorum Voting Period
Location: `TemplBase.sol:1373-1377`

Issue: The `_setPostQuorumVotingPeriod()` function accepts any value without bounds checking. This could allow setting it to 0 (instant execution after quorum) or extremely large values (years).

Impact:

- Setting to 0 eliminates the safety period after quorum
- Setting to very large values could lock proposals indefinitely
- No protection against accidental or malicious misconfiguration

Recommendation: Add minimum and maximum bounds (e.g., 1 hour minimum, 30 days maximum).

## Proposal Fee Exemption for Council Members Can Be Gamed
Location: `TemplBase.sol:925-932`

Issue: Council members are exempt from proposal fees (line 925), but this is checked at proposal creation time. A user could join the council, create unlimited free proposals, then leave the council.

Impact: Council members can create unlimited proposals without paying fees, potentially spamming the governance system. The fee mechanism is meant to prevent proposal spam.

Recommendation: Either remove the council exemption or track proposal fees separately and enforce limits.

## Priest Can Be Changed to Non-Member Address
Location: `TemplBase.sol:1543-1549`

Issue: The `_changePriest()` function only validates that `newPriest != address(0)` and `newPriest != old`, but doesn't verify that the new priest is a member of the templ.

Impact: The priest role could be transferred to an address that has never joined, creating inconsistencies. The priest is auto-enrolled as the first member in the constructor, so this breaks the invariant that the priest should be a member.

Recommendation: Add `if (!members[newPriest].joined) revert TemplErrors.NotMember();` validation.

## WithdrawTreasury for non-accessToken ERC20 relies on externalRewards[token].poolBalance even if token was never “registered”; can mis-account reserved balances if state is inconsistent
Location: `TemplBase.sol:1478-1508`

Issue: withdrawTreasury for non-accessToken ERC20 relies on `externalRewards[token].poolBalance` even if token was never “registered”; can mis-account reserved balances if state is inconsistent
Where

`TemplBase._withdrawTreasury(token != accessToken && token != address(0))` reads `ExternalRewardState` storage `rewards = externalRewards[token];` and uses `rewards.poolBalance` without checking `rewards.exists`.
Impact

If for any reason `rewards.poolBalance` is non-zero while `exists` is false (storage corruption via upgrade, future changes, or edge-case in registration/removal), withdrawals could incorrectly allow draining funds that should be reserved for members, or incorrectly block withdrawals.

Impact: Today, with current code, `poolBalance` should only be meaningfully used when `exists == true`, but this is a medium “future-proofing / upgrade safety” issue given you have a module-upgrade mechanism.

## No Slippage Protection on Entry Fee
Location: `TemplMembership.sol:74`

Issue: The entry fee is read from storage (`entryFee`) and can change between transaction submission and execution due to curve updates or governance actions. Users have no way to specify a maximum price they're willing to pay.

Impact: Users could pay significantly more than expected if the entry fee increases between transaction submission and mining.

Recommendation: Add a `maxEntryFee` parameter to join functions to allow slippage protection.

## Inconsistent Zero Address Checks
Location: Multiple locations

Issue: Some functions check `address(0)` explicitly while others rely on downstream checks. For example, `createProposalChangePriest` checks at line 404, but the internal `_changePriest` also checks at line 1544.

Impact: Redundant checks waste gas. Inconsistent patterns make code harder to maintain.

Recommendation: Standardize where zero address checks occur (preferably at the highest level).

## No Proposal Cancellation Mechanism
Location: Governance module

Issue: Proposers cannot cancel their proposals even if they made an error.

Recommendation: Consider allowing proposer to cancel before voting starts.

## Missing NatSpec param for Some Functions
Locations: Various

Issue: Some functions have incomplete NatSpec documentation (e.g., `_governanceCallExternal` lacks param for `proposal`).

## Usage of non-standard unicode characters
Location: `TemplBase.sol:212`

