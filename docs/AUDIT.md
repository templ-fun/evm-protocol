# Templ Protocol Audit

## Summary

| ID | Title | Severity | Status |
| --- | --- | --- | --- |
| F-01 | External reward remainders dilute prior members | Medium | Open |
| F-02 | Expensive active-proposal getters | Low | Open |
| F-03 | Signature replay possible across backend instances | Medium | Open |
| F-04 | `/templs` endpoint leaks Telegram chat identifiers | Medium | Open |

## Findings

### F-01: External reward remainders dilute prior members (Medium)
When treasury funds are disbanded into external reward pools, any undistributed remainder from a prior distribution is added to the next payout and divided by the current member count.【F:contracts/TemplTreasury.sol†L176-L227】 If new members joined between those distributions, they receive a share of value that accrued before they joined. The membership module avoids this problem for entry-fee rewards by dividing only across `memberList.length - 1`, ensuring that only existing members receive the payout from a new join.【F:contracts/TemplMembership.sol†L43-L105】 For external rewards the remainder is therefore diluted across newcomers, violating the expectation that rewards map to the era they were earned.

*Recommendation:* Track the member count associated with each external distribution (including remainders) and only apply leftover value to the cohort that earned it. For example, store the previous divisor alongside `rewardRemainder` and scale the next distribution so that only members present at the prior checkpoint share that carry-over.

### F-02: Expensive active-proposal getters (Low)
`getActiveProposals` and `getActiveProposalsPaginated` iterate over the entire `proposalCount` array twice on every call.【F:contracts/TemplGovernance.sol†L435-L575】 As `proposalCount` grows this becomes increasingly expensive for wallets or services that rely on `eth_call`. While the functions are `view`, sufficiently large histories can exhaust the default call gas limit and make the view endpoints unusable.

*Recommendation:* Maintain a rolling list or bitmap of active proposal ids so lookups are `O(active)` rather than `O(total)`, or enforce a hard cap / archive mechanism so that the view calls stay bounded.

### F-03: Signature replay possible across backend instances (Medium)
The API defends against replay by storing seen signatures in an in-memory `Map` via `createSignatureStore`, and the server instantiates a fresh store per process.【F:backend/src/middleware/validate.js†L3-L88】【F:backend/src/server.js†L686-L705】 Deployments that run multiple API replicas (or restart a single instance) will therefore accept the same signed payload on each node. Attackers can reuse a captured `create` or `rebind` signature to clobber bindings as long as they target a different replica or wait for a restart.

*Recommendation:* Back the signature store with a shared datastore (e.g., Redis) or persist the nonce usage on-chain so replays are impossible across processes. At a minimum, expose configuration to inject a distributed store and document that it is required in production.

### F-04: `/templs` endpoint leaks Telegram chat identifiers (Medium)
`GET /templs?include=chatId` returns every templ’s `telegramChatId` without authentication or rate limiting beyond the global limiter.【F:backend/src/routes/templs.js†L12-L71】 Telegram chat ids are effectively secrets—the bot needs them to post into private groups. Publishing them allows anyone on the internet to harvest ids and spam the groups or attempt phishing.

*Recommendation:* Require authentication/authorization before returning chat identifiers, or redact them entirely from the public listing API. If exposure is unavoidable, randomize group ids (e.g., use opaque tokens) so that the backend never stores raw Telegram identifiers.

