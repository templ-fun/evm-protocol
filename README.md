# templ.fun Protocol Overview

## What It Does
- templ.fun lets communities spin up private “templ” groups that collect an access-token treasury, stream rewards to existing members, and govern configuration or payouts on-chain.
- Each templ is composed from three delegatecall modules – membership, treasury, and governance – orchestrated by the root `TEMPL` contract. All persistent state lives in `TemplBase`, so modules share storage and act like facets of a single contract.
- Deployers can apply join-fee curves, referral rewards, proposal fees, and dictatorship (priest) overrides. Governance maintains control after launch by voting on configuration changes or treasury actions.

## Deployment Flow & Public Interfaces
1. **Deploy modules once per protocol:**
   - `TemplMembershipModule`
   - `TemplTreasuryModule`
   - `TemplGovernanceModule`
2. **Deploy `TemplFactory`** with:
   - Protocol fee recipient / share
   - Addresses for the three modules above  
   The factory stores the `TEMPL` creation bytecode via SSTORE2 and reuses it for future deployments.
3. **Create templ instances** using `TemplFactory.createTempl*` helpers. Each call deploys a new `TEMPL` contract, wiring it to the shared modules. Users interact solely with the deployed `TEMPL` address, which delegates to the modules based on function selectors.

Key public touchpoints:
- `TEMPL`: root contract and ABI surface users call.
- `TemplFactory`: deploys new templ instances and manages permissionless creation.

## Module Responsibilities
- **TemplMembershipModule**
  - Handles joins (with optional referrals), distributes entry-fee splits, accrues member rewards, and exposes read APIs for membership state and treasury summaries.
  - Maintains join sequencing to enforce governance eligibility snapshots.

- **TemplTreasuryModule**
  - Provides governance-controlled treasury actions: withdrawals, disbands to member/external pools, priest changes, metadata updates, referral/proposal-fee adjustments, and entry-fee curve updates.
  - Surfaces helper actions such as cleaning empty external reward tokens.

- **TemplGovernanceModule**
  - Manages proposal lifecycle (creation, voting, execution), quorum/eligibility tracking, dictatorship toggles, and external call execution with optional ETH value.
  - Exposes proposal metadata, snapshot data, join sequence snapshots, voter state, and active proposal pagination.

- **TemplFactory**
  - Normalizes deployment config, validates percentage splits, enforces permissionless toggles, and emits creation metadata (including curve details).
  - Stores `TEMPL` init code across chunks to avoid large constructor bytecode.

These components share `TemplBase`, which contains storage, shared helpers (entry-fee curves, reward accounting, SafeERC20 transfers), and cross-module events.
