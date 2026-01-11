# Security Audit Report — templ.fun Core Smart Contracts

**Date:** 2026-01-10  
**Scope target:** Core (non-mock) Solidity smart contracts in `code.zip`  
**Audit method:** Manual static review (read-through + reasoning about state transitions, edge cases, and trust assumptions). No compilation, fuzzing, or third‑party static analyzers were run in this environment.

---

## 1. Executive summary

This codebase implements a modular, delegatecall-based DAO (“TEMPL”) with:

- Token-gated membership (1 member = 1 vote) paid via an **ERC20 access token**.
- An **entry-fee curve** controlling the join price.
- A fee split between burn / treasury / member rewards / protocol.
- On-chain governance with **pre‑quorum** and **post‑quorum** voting phases, optional **instant quorum**, and an optional **council mode**.
- Treasury management actions (withdraw, disband, config changes) and a highly-powerful **callExternal** / **batchDAO** capability.

Most security properties ultimately depend on **(a)** choosing a well-behaved ERC20 access token, and **(b)** governance/process discipline around the highly privileged “arbitrary call” and “upgrade routing” mechanisms.

---

## 2. Scope

### 2.1 In-scope contracts

**Core protocol contracts**

- `contracts/TEMPL.sol`
- `contracts/TemplBase.sol`
- `contracts/TemplMembership.sol`
- `contracts/TemplGovernance.sol`
- `contracts/TemplTreasury.sol`
- `contracts/TemplCouncil.sol`
- `contracts/TemplModuleBase.sol`
- `contracts/TemplCurve.sol`
- `contracts/TemplDefaults.sol`
- `contracts/TemplErrors.sol`

**Deployment / factory**

- `contracts/TemplFactory.sol`
- `contracts/TemplFactoryTypes.sol`
- `contracts/TemplDeployer.sol`

**Auxiliary tool**

- `contracts/tools/BatchExecutor.sol`

### 2.2 Explicitly out of scope

- `contracts/mocks/*`
- `contracts/echidna/*`
- Frontend, scripts, deployment infrastructure, and operational procedures

---

## 3. Architecture overview

### 3.1 Router + modules (delegatecall)

`TEMPL.sol` is the deployed instance that **holds all state** (via `TemplBase`) and routes function selectors to module implementations using `delegatecall` in its `fallback`. See `TEMPL.sol` fallback at **L271–L295**.

Modules are deployed as shared implementations and protected with `onlyDelegatecall` (via `TemplModuleBase`) to prevent direct calls.

### 3.2 Membership & accounting

Members join by paying the current `entryFee` in the access token. Fees are split:

- Burn (`burnBps`)
- Treasury retained in the contract (`treasuryBps`)
- Member rewards pool retained in the contract (`memberPoolBps`)
- Protocol fee sent to `protocolFeeRecipient` (`protocolBps`, immutable per factory)

Internal accounting uses `treasuryBalance`, `memberPoolBalance`, `memberRewardRemainder`, and `cumulativeMemberRewards`.

### 3.3 Governance

Proposals are created by members (proposal fee may apply). Voting has a two-phase model:

- **Pre-quorum phase:** only members who joined *before proposal creation* can vote.
- When quorum is reached, the proposal transitions to **post-quorum phase:** the eligible voter set is *re-snapshotted* to include members who joined up to that point.

Council mode changes eligible voters to the council snapshot.

### 3.4 Privileged “escape hatches”

Two mechanisms are effectively equivalent to “DAO has arbitrary code execution power”:

- `Action.CallExternal` proposals (arbitrary external calls with optional ETH value)
- `TemplTreasuryModule.batchDAO` (arbitrary batch of calls)

Additionally, `TEMPL.setRoutingModuleDAO` allows governance to re-route selectors to new module contracts.

---

## 4. Severity ratings

- **Critical:** Direct loss of funds / permanent compromise by any user (no special trust assumptions).
- **High:** Loss of funds or severe DoS under realistic conditions; may involve privileged roles or common misconfiguration.
- **Medium:** Meaningful security/economic risk or governance manipulation; often requires conditions or coordination.
- **Low:** Footguns, recoverable DoS, or issues with limited impact.
- **Informational:** Non-bugs, design notes, or improvements.

---

## 5. Findings summary

| ID | Severity | Title |
|---:|:--:|---|
| H-01 | High | Access-token accounting assumes a “vanilla” ERC20; fee-on-transfer / rebasing / ERC777-like tokens can break invariants |
| H-02 | High | Quorum-exempt **DisbandTreasury** can sweep non-access assets to `protocolFeeRecipient` with minimal participation (role/centralization risk) |
| M-01 | Medium | `_solveBaseEntryFee` fails to retarget correctly for **exponential decay curves** (`rateBps < 10_000`), causing mispricing |
| M-02 | Medium | Post-quorum re-snapshot can be “poisoned” by strategic joins that inflate the execution-time quorum denominator |
| L-01 | Low | `setRoutingModuleDAO` allows routing selectors to `address(this)`, creating infinite fallback recursion (selector DoS) |
| L-02 | Low | Factory does not validate that the configured `accessToken` is a contract (code length), enabling deployment of unusable TEMPLs |
| I-01 | Info | `TemplDeployer` is permissionless; factory permissioning/events can be bypassed (integration/phishing risk) |
| I-02 | Info | `pruneInactiveProposals` does not clear per-proposer “active proposal” marker; `hasActiveProposal` can be stale |
| I-03 | Info | `callExternal` / `batchDAO` bypass internal accounting and protections by design; treat as arbitrary code execution |

---

## 6. Detailed findings

### H-01 — Access-token accounting assumes a “vanilla” ERC20

**Severity:** High  
**Where:** `TemplMembership.sol` join flow (notably `_join` **L141–L203**), plus any logic that relies on `memberPoolBalance` / `treasuryBalance` matching actual balances.

#### What’s happening

The protocol calculates fee splits based on `price = entryFee`, updates internal accounting, and then performs token transfers:

- Pull `price` via `safeTransferFrom(payer, address(this), price)` (**L141–L143**)
- Push burn/protocol/referral amounts via `safeTransfer` (**L186–L199**)

This design implicitly assumes the access token:

- Transfers the exact amount requested (no transfer fees / no deflationary mechanics)
- Does not rebase balances unexpectedly
- Does not implement callback-based hooks (e.g., ERC777-style) that materially alter control flow

#### Why it matters

If `accessToken` is fee-on-transfer/deflationary:

- The contract may receive **less than `price`** but still tries to forward `burnAmount`, `protocolAmount`, etc.
- This can cause **reverts** (insufficient balance) or silent accounting drift.

If `accessToken` is rebasing:

- The contract’s real balance can change without updating `memberPoolBalance` / `treasuryBalance`, breaking:
  - `claimMemberRewards` accounting checks
  - `getTreasuryInfo` / `withdrawTreasury` “available” calculations
  - `disbandTreasury` logic that assumes `balanceOf(this) - memberPoolBalance` is the treasury amount

Even when funds are not directly stolen, these behaviors can lead to **permanent DoS** of joins/claims/withdrawals or incorrect distribution of funds.

#### Recommendation

- **Strongly restrict** supported access tokens to standard ERC20s (no fee-on-transfer, no rebasing).
- Add an explicit runtime check in `_join`:
  - Measure `balanceBefore = balanceOf(this)` and `balanceAfter` around `safeTransferFrom`, require `(balanceAfter - balanceBefore) == price`.
  - Revert with a clear custom error if not.
- If supporting fee-on-transfer tokens is a goal, redesign accounting to use *actual received amounts* (much more complex).

---

### H-02 — Quorum-exempt DisbandTreasury can sweep non-access assets with minimal participation

**Severity:** High (trust/centralization risk)  
**Where:**

- `TemplGovernance.sol` `createProposalDisbandTreasury` (**L332–L351**)
- `TemplBase.sol` `_proposalPassed` quorum-exempt path (**L945–L950**)
- `TemplBase.sol` `_disbandTreasury` non-access token behavior (**L1609–L1621**)

#### What’s happening

A DisbandTreasury proposal can be marked **quorum-exempt** if created by:

- The `priest`, or
- A council member (when council mode is enabled)

See `quorumExempt` assignment in `createProposalDisbandTreasury` (**L341–L346**).

Quorum-exempt proposals:

- **Do not require quorum** to pass (`_proposalPassed` returns `isEnded && meetsYesVoteThreshold` when `quorumExempt == true`).
- With default `yesVoteThreshold = 5100` (51%), **a single YES vote with no NO votes passes** once the voting period ends.

Disband behavior depends on `token`:

- If `token == accessToken`, funds are moved into the member pool for proportional claims.
- If `token != accessToken` (including ETH), the entire balance is sent to `protocolFeeRecipient` (**L1609–L1621**).

#### Why it matters

If the TEMPL ever holds:

- ETH (e.g., accidental transfers, refunds, external integrations), or
- Any ERC20 other than the access token (airdrops, donations, protocol interactions)

…then the priest (or council member in council mode) can create a quorum-exempt DisbandTreasury proposal for that asset and, in a low-participation scenario, **sweep it to `protocolFeeRecipient`**.

This may be intentional as an “escape hatch”, but it is a **material trust assumption** that should be explicitly communicated to users and integrators.

#### Recommendation

Depending on desired governance guarantees:

- **Option A (safer):** Remove quorum-exempt behavior for DisbandTreasury entirely.
- **Option B:** Allow quorum-exempt only for `token == accessToken` (so assets go to members, not protocol).
- **Option C:** Require council mode for quorum-exempt disband even for the priest.
- **Option D:** Require an explicit higher yes threshold for quorum-exempt disband (e.g., supermajority), or add a veto mechanism.

At minimum, document this clearly as a deliberate protocol rule.

---

### M-01 — `_solveBaseEntryFee` fails for exponential decay curves (`rateBps < 10_000`)

**Severity:** Medium  
**Where:**

- `TemplBase.sol` `_setCurrentEntryFee` (**L648–L654**)
- `TemplBase.sol` `_solveBaseEntryFee` (**L1022–L1056**) and `_validateCurveSegment` (**L1228–L1267**)

#### What’s happening

`_solveBaseEntryFee` binary-searches for a `baseEntryFee` that would yield the desired `targetEntryFee` after applying the curve at the current number of paid joins.

However, it constrains the upper bound:

```solidity
uint256 high = targetEntryFee < MAX_ENTRY_FEE ? targetEntryFee : MAX_ENTRY_FEE;
```

(see **L1036–L1039**)

This implicitly assumes `baseEntryFee <= targetEntryFee`, which is true for non-decreasing curves.

But the curve validation **does not forbid** exponential rates below 10,000 bps (i.e., *decay*). `_validateCurveSegment` only checks `rateBps != 0` for exponential style (**L1250–L1256**).

For exponential decay, the correct retargeted base should often be **greater** than the current target fee.

#### Impact

If governance sets an exponential segment with `rateBps < 10_000` and tries to retarget the entry fee/curve:

- The solver will never search above `targetEntryFee`.
- The resulting `baseEntryFee` will be too low.
- The computed curve price for subsequent joins can be dramatically incorrect (often much lower), causing **unexpected undercharging**.

This is an economic correctness issue that can materially change system behavior.

#### Recommendation

Pick one of these consistent approaches:

- **If decay should be disallowed:** enforce `rateBps >= 10_000` for `CurveStyle.Exponential` in `_validateCurveSegment`.
- **If decay should be supported:** set the solver upper bound to `MAX_ENTRY_FEE` (or another safe upper bound), not `targetEntryFee`.

Add explicit unit tests covering:

- Retargeting with `rateBps < 10_000` at various `paidJoins`
- Consistency between `entryFee` and `priceForJoins(_currentPaidJoins())`

---

### M-02 — Post-quorum re-snapshot can be “poisoned” by strategic joins that inflate execution-time quorum

**Severity:** Medium (governance/economic DoS risk)  
**Where:**

- `TemplGovernance.sol` `vote` quorum transition logic (**L450–L463**)
- `TemplBase.sol` `_proposalPassed` denom selection for quorum check (**L955–L969**)
- `TemplBase.sol` `_maybeTriggerInstantQuorum` also snapshots `postQuorumEligibleVoters` (**L799–L830**)

#### What’s happening

Before quorum is reached, only members who joined before proposal creation can vote (enforced via `preQuorumJoinSequence`).

When quorum is reached, the code snapshots:

- `proposal.postQuorumEligibleVoters = memberCount` (**L456–L458**)
- `proposal.quorumJoinSequence = joinSequence` (**L459**)

This includes members who joined **after proposal creation but before quorum was reached**.

At execution time, `_proposalPassed` uses:

```solidity
uint256 denom = proposal.postQuorumEligibleVoters != 0
    ? proposal.postQuorumEligibleVoters
    : proposal.eligibleVoters;
```

(**L955–L958**) and then enforces quorum vs `denom` (**L966–L969**).

#### Why it matters

A well-funded attacker can:

1. Wait for a proposal to be created.
2. Join many new member addresses during the pre-quorum phase (they cannot vote yet, but they increase `memberCount`).
3. Let the original electorate reach quorum (based on the original `eligibleVoters` snapshot).
4. When quorum is reached, the snapshot denominator becomes the inflated `memberCount`.
5. The attacker can then abstain / vote NO with the newly joined accounts, making it difficult or impossible to satisfy quorum at execution.

Even if the protocol considers “paying to join” an acceptable Sybil cost, the shifting denominator can be surprising and can function as a **governance DoS** mechanism.

#### Recommendation

If the intention is “only members as of proposal creation matter for quorum,” then:

- Keep the quorum denominator fixed to the original `eligibleVoters` snapshot, even after post-quorum.

If the intention is “members who join before quorum should also count,” consider:

- Aligning the *quorum reached* check with the same denominator used at execution, or
- Explicitly documenting that post-quorum membership growth increases the quorum requirement.

In either case, add tests for scenarios where `memberCount` grows significantly between proposal creation and quorum.

---

### L-01 — Routing can be set to `address(this)` causing infinite recursion

**Severity:** Low  
**Where:** `TEMPL.sol` `setRoutingModuleDAO` (**L621–L639**) + router `fallback` (**L271–L295**)

#### What’s happening

`setRoutingModuleDAO` validates:

- `module != address(0)`
- `module.code.length != 0`

…but does **not** prevent `module == address(this)`.

If governance routes a selector to `address(this)` and that selector is not implemented directly on `TEMPL.sol`, calling it triggers:

- Router `fallback` → `delegatecall(address(this), msg.data)` → router `fallback` again → … until out-of-gas.

#### Impact

- Selector-level denial-of-service (recoverable by re-routing, but disruptive).

#### Recommendation

- Add `if (module == address(this)) revert InvalidRecipient();` (or a dedicated error).
- Optionally add an “unset selector” mechanism (set to 0) if you want to fully disable a routed selector.

---

### L-02 — Factory doesn’t validate `accessToken` is a contract

**Severity:** Low  
**Where:** `TemplFactory.sol` `_deploy` (**L316–L318**)

#### What’s happening

The factory checks `cfg.token != address(0)` but not `cfg.token.code.length`.

If a user supplies an EOA as `token`, deployment succeeds but:

- `safeTransferFrom`/`safeTransfer` calls will revert (OZ SafeERC20 checks that the target is a contract when return data is empty), making the instance unusable.

#### Recommendation

- In `TemplFactory._deploy`, add `if (cfg.token.code.length == 0) revert InvalidCallData();` (or a more specific error).
- Consider also validating `cfg.priest != address(0)` already done.

---

### I-01 — `TemplDeployer` is permissionless (bypasses factory permissioning/events)

**Severity:** Informational  
**Where:** `TemplDeployer.sol` `deployTempl` (**L24–L63**)

#### Notes

Anyone can call `deployTempl` directly with a chosen salt and config, even if the factory is not permissionless.

This is not a vulnerability inside deployed TEMPL instances, but it can:

- Bypass factory-level creation gating
- Bypass factory event indexing (important for UIs / analytics)
- Enable “look-alike” deployments (phishing/confusion)

**Recommendation:** If the factory is intended to be the canonical creation path, restrict `TemplDeployer.deployTempl` to `onlyFactory`.

---

### I-02 — `pruneInactiveProposals` can leave `hasActiveProposal` stale

**Severity:** Informational  
**Where:** `TemplGovernance.sol` `pruneInactiveProposals` (**L646–L674**)

#### Notes

`pruneInactiveProposals` removes inactive proposal IDs from `activeProposalIds`, but it does not clear the per-proposer marker `_activeProposalIdPlusOne[proposer]`.

This does not block creating a new proposal (since `_createBaseProposal` clears stale markers when the proposer tries again), but it can make `hasActiveProposal(proposer)` return `true` until the proposer creates another proposal.

**Recommendation:** When pruning, also clear `_activeProposalIdPlusOne[proposal.proposer]` if it still points at the pruned proposal.

---

### I-03 — `callExternal` / `batchDAO` bypass internal protections by design

**Severity:** Informational (but important)  
**Where:**

- `TemplGovernance.sol` `createProposalCallExternal` / `_governanceCallExternal`
- `TemplTreasury.sol` `batchDAO` (**L174–L199**)

#### Notes

A DAO that can execute arbitrary calls can:

- Transfer the access token directly (`accessToken.transfer(...)`), bypassing member-pool separation implemented by `_withdrawTreasury`.
- Approve spenders, interact with external protocols, or re-route selectors to new modules.

This is likely intended (it’s effectively a “root” permission), but it should be treated and communicated as such.

**Recommendation:**

- Treat `Action.CallExternal` and `batchDAO` as “admin-level” and consider additional procedural protections (timelock, multisig review, UI warnings).
- Document that “member pool” protections apply to the standard treasury actions, not to arbitrary calls.

---

## 7. Additional recommendations (non-findings)

These are not filed as findings but are worth consideration:

1. **Upgrade safety / storage layout discipline:** Because modules are executed via `delegatecall`, any new module code must preserve the exact storage layout defined in `TemplBase` (and must also account for router-owned storage in `TEMPL.sol`). Consider documenting this prominently and/or adding a version/sentinel check in modules.
2. **Operational guidance:** Document the precise governance power model (especially `callExternal`, routing upgrades, and disband semantics) so users understand that the DAO can override most protections.
3. **Property-based tests:** Add fuzz tests for:
   - Member pool invariants (`sum(claimables) + remainder == memberPoolBalance`)
   - Join pricing monotonicity under allowed curves
   - Proposal lifecycle invariants (active index correctness, pruning correctness)

---

## 8. Appendix — Key code references

- Router fallback delegatecall: `TEMPL.sol` **L271–L295**
- Membership join accounting: `TemplMembership.sol` **L141–L203**
- Quorum transition snapshot: `TemplGovernance.sol` **L450–L463**
- Quorum-exempt pass logic: `TemplBase.sol` **L945–L950**
- Disband non-access token sweep: `TemplBase.sol` **L1609–L1621**
- Entry-fee base solver: `TemplBase.sol` **L1022–L1056**


---

## Appendix C: Note on `contracts/tools/BatchExecutor.sol`

Although not part of the core TEMPL/router + module system, `contracts/tools/BatchExecutor.sol` is a deployable helper that can batch arbitrary external calls and optionally forward ETH.

- It validates that `targets.length > 0` and that the `targets`, `values`, and `data` arrays have the same length.
- It sums `values[]` and requires `msg.value == totalValue` (so ETH-forwarding is fully funded by the caller).
- It checks `target != address(0)` for each call and reverts on the first failure.

**Observations / minor improvements:**

- The contract currently reverts with an empty revert (`revert();`) when a sub-call fails, which discards the underlying revert reason. For debugging and user transparency, consider bubbling up the revert data (similar to patterns used in `TemplTreasuryModule.batchDAO()` and `TemplGovernanceModule._governanceCallExternal()`).
- As with any generic batcher, it is intentionally powerful: callers must treat it as equivalent to executing each call directly.
