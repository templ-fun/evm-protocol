# templ.fun Launch Readiness Audit

_Date: 2025-09-27_

## Scope & Approach
- Reviewed the Solidity contracts under `contracts/` with emphasis on member joins, treasury accounting, governance execution, and factory deployment flows.
- Inspected backend services in `backend/src/` for signature validation, persistence, rate limiting, and contract watcher behaviour.
- Sampled shared libraries used across the stack for signing and configuration handling.
- Out of scope: front-end UX polish (acknowledged by product) and third-party infrastructure (Telegram, RPC providers).

The codebase is well-structured and extensively instrumented with custom errors and events. The following issues should be addressed before the first production deployment.

## Key Findings

### SC-1: Unbounded external reward token list can DoS future joins (Medium)
Every new member triggers `_flushExternalRemainders`, iterating the full `externalRewardTokens` array to distribute carry-over dust before admitting the joiner.【F:contracts/TemplMembership.sol†L357-L379】 Tokens are appended to this array permanently whenever the treasury disburses a new asset via `_registerExternalToken`.【F:contracts/TemplTreasury.sol†L208-L235】 A malicious governance majority (or a priest while dictatorship is enabled) can execute repeated `disbandTreasury` proposals that push dozens of distinct token addresses with negligible balances. The join path would then require proportional gas to traverse the array and may exceed block limits, locking the templ to new members. Mitigations:
- Track and skip zero-balance tokens without pushing them, or allow governance to prune unused entries.
- Cap the token list length or charge a higher proposal bond when registering new assets.
- Consider delaying remainder flushing to a batched keeper job rather than every join.

### SC-2: Priest can unilaterally disband the treasury with no quorum (Medium / Governance risk)
`createProposalDisbandTreasury` flags proposals from the current priest as `quorumExempt`, so execution only waits for the voting window and requires a simple YES majority.【F:contracts/TemplGovernance.sol†L164-L179】【F:contracts/TemplGovernance.sol†L294-L314】 In practice, this lets an inactive membership be drained by a single signer if they abstain. Confirm this centralised power is intentional and clearly communicate it to templ creators. If not desired, remove the exemption or require a configurable minimum YES count even for priest-initiated disbands.

### BE-1: Factory provenance checks depend on deployment config (Low)
`registerTempl` enforces on-chain contract and priest verification by default, but the trusted factory guard only runs when `TRUSTED_FACTORY_ADDRESS` and an RPC provider are configured.【F:backend/src/services/registerTempl.js†L29-L50】 A misconfigured production deploy (missing provider or env var) silently skips the provenance check, allowing arbitrary contracts to register for Telegram alerts. Add startup assertions that refuse to boot without the expected provider/env when the flag is intended to be enforced.

## Additional Observations
- The backend defends replay attacks with SQLite-backed signature storage and rate limiting, and it falls back to in-memory stores while logging warnings when dependencies are absent.【F:backend/src/server.js†L783-L858】 Ensure production deployments provision persistent stores to avoid replay windows after restarts.
- EIP-712 signatures include a `server` field derived from `BACKEND_SERVER_ID` / `VITE_BACKEND_SERVER_ID`; keep these identifiers unique per environment to prevent cross-environment replays when multiple backends share credentials.【F:shared/signing.js†L11-L88】
- Maintain configuration parity between the backend `TRUSTED_FACTORY_ADDRESS` flag and any frontend hard-coding so new templ registrations cannot be pointed at unapproved contracts.

## Recommended Next Steps
1. Mitigate SC-1 by bounding or pruning `externalRewardTokens` prior to launch; re-test member joins after the change.
2. Decide on priest disband authority (SC-2) and either document it prominently or adjust governance logic.
3. Harden deployment scripts so backend startup fails fast when provenance verification requirements are unmet (BE-1), and ensure Redis/SQLite dependencies are present in production.
4. Run the full test suite (`npm run test:all`) plus static analysis (`npm run slither`) on the final release candidate and attach reports to launch documentation.

Addressing the above will reduce operational and governance risks as templ.fun onboards its first production users.
