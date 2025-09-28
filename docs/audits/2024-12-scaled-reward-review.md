# Scaled Reward Regression Audit (December 2024)

## Executive summary
- **Objective.** Evaluate the scaled-per-share reward implementation introduced in `fix: scale reward accounting to avoid join-time loops`, confirm the original dust/griefing issue is resolved, and ensure no new security regressions were introduced relative to the pre-change contracts.
- **Result.** Identified a high-severity regression where fractional rewards were zeroed during claims, permanently stranding distributed tokens. Implemented per-member dust accounting for both the member pool and external reward tokens to carry fractional entitlements forward. Regression tests, fuzzing harnesses, and end-to-end flows now pass without rediscovering the prior loop-based bottleneck.
- **Risk posture.** With the dust fix applied, the scaled reward system maintains precise accounting without reintroducing the gas-heavy loops. No new governance, treasury, or access-control issues were observed beyond the pre-existing low-severity items from the earlier review (priest power, ERC-20 assumptions, quorum exemptions).

## Scope & methodology
- Compared the latest branch against commit `HEAD~1` (pre-scaled rewards) focusing on `TemplBase`, `TemplMembership`, `TemplTreasury`, docs, and harness/tests that exercise reward flows.
- Re-ran the full Hardhat + Slither + backend/frontend test matrix (`npm run test:all`), including Playwright E2E coverage, to detect behavioural drift.
- Replayed invariants and targeted regression tests around reward distribution, external token handling, and claim logic.
- Manually reviewed storage layout changes to ensure no new collisions or upgrade hazards were introduced by the added mappings.

## Findings summary
| ID | Severity | Title | Status | Notes |
| --- | --- | --- | --- | --- |
| H-01 | High | Fractional rewards lost during claims under scaled accounting | **Fixed in this audit** | Added per-member dust tracking and claim logic so fractional entitlements persist and distributed tokens cannot become stuck. |
| L-01 | Low | Priest disband proposals remain quorum-exempt | Known / unchanged | See prior audit for mitigation (process/monitoring). |
| L-02 | Low | Dictatorship grants priest unilateral treasury control | Known / unchanged | Documented operational requirement for multisig priest. |
| L-03 | Low | ERC-20 assumptions (fee-on-transfer, callbacks) | Known / unchanged | Continue restricting supported tokens. |
| L-04 | Info | External reward enumeration can grow large | Known / unchanged | Consider caps/pagination in future release. |

## Detailed finding – H-01 Fractional rewards lost during claims (Resolved)
- **Context.** The scaled reward upgrade replaced join-time loops with a `REWARD_SCALE` accumulator. Members snapshot `cumulativeMemberRewards` and derive claimable balances by dividing by the scale.
- **Issue.** `claimMemberPool` and `claimExternalToken` updated a member’s snapshot to the full scaled accumulator after paying out the integer portion. The fractional remainder (< `REWARD_SCALE`) was discarded instead of being preserved for future distributions. Once all members claimed, the contract’s `memberPoolBalance - memberRewardRemainder` could remain positive even though every member reported `0` claimable, permanently trapping funds.
- **Exploit scenario.** An attacker (or simply honest members) would claim rewards after a disband with uneven totals (e.g., 5 tokens among 3 members). Three tokens would be claimable, but one distributed token would become stranded forever, bleeding treasury funds over time.
- **Remediation.**
  - Added `memberRewardDust` and `memberExternalRewardDust` mappings to retain each member’s fractional share after every claim.
  - Updated `getClaimablePoolAmount` / `getClaimableExternalToken` to include the stored dust in their computations so view functions match on-chain payouts.
  - Adjusted `claimMemberPool` and `claimExternalToken` to recompute claimable amounts locally, update dust, and only advance snapshots after accounting for residual fractions.
  - Extended membership coverage tests to simulate sequential disbands and ensure distributed tokens fully drain, and repeated the scenario for external reward pools.
- **Verification.** The new regression tests (`preserves fractional member pool rewards across sequential disbands`, `preserves fractional external rewards across sequential disbands`) fail on the pre-fix code and now pass, alongside the full invariant and E2E suites.

## Regression checks
- `npm run test:all` (Hardhat unit/integration tests, Slither static analysis, backend/frontend unit tests, Playwright E2E). Result: **pass**.
- Manual storage layout diff: the added dust mappings append to `TemplBase`’s storage and do not collide with existing slots; no upgradeable proxies are present.

## Observations & recommendations
- The scaled reward mechanism now preserves precision while avoiding join-time loops. Governance and treasury modules remain unchanged; prior low-severity trust assumptions still apply.
- Frontend/backends should surface the revised semantics (fractional dust automatically accrues) but no API changes were required; the documentation has been updated to mention the per-member dust fields.
- Continue monitoring member/external reward token counts to mitigate the informational `L-04` gas growth risk.
