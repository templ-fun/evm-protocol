# templ.fun Smart Contract Audit

> Warning this is LLM-generated and it's just and experiment, pleast don't take it too serious <3

Agent/Model Metadata:

- Tooling/Interface: Codex CLI (OpenAI)
- CLI Version: codex-cli 0.46.0
- Model Version: gpt-5-high 2025-10-21 - 16h05 UTC
- prompt: `audit this codebase like a serious smart contract audit firm would`

This document captures a code-review style security audit of the templ.fun smart contracts in this repository. It focuses on correctness, safety, and trust assumptions for on‑chain behavior, and reviews deployment scripts and tests that influence production posture.

## Executive Summary
- Overall posture: sound modular architecture (diamond‑like), strong use of OpenZeppelin `SafeERC20`, `ReentrancyGuard`, explicit custom errors, and careful treasury accounting.
- Governance uses join‑sequence snapshots and an execution delay with quorum maintenance checks; factory stores init code in SSTORE2 chunks to deploy TEMPL instances safely.
- No critical, exploitable issues identified under stated assumptions. The intentionally powerful “external call” proposal is high‑risk by design and must be treated as such operationally.
- Medium/low opportunities include enforcing ERC‑20 semantics assumptions, minor access/UX tightening, and additional property tests.

## Scope
- Contracts: `contracts/*.sol` including `TEMPL.sol`, `TemplBase.sol`, `TemplMembership.sol`, `TemplTreasury.sol`, `TemplGovernance.sol`, `TemplFactory.sol`, libraries under `contracts/libraries/**`.
- Scripts: `scripts/deploy-*.cjs`.
- Tests: `test/**` (reentrancy, treasury actions, proposals, curve/fees, pagination, invariants).

## Methodology
This review followed a structured, code‑centric audit process with explicit checks and artifacts:

- Repository reconnaissance
  - Inventory smart contracts, scripts, configs, and tests to define scope and dependencies.
  - Map module boundaries, immutables, and storage ownership.

- Architectural analysis
  - Identify trust boundaries (users, members, priest, protocol, factory deployer).
  - Enumerate assets at risk: access‑token balances, external reward ERC‑20s, ETH held by TEMPL instances.
  - Review the delegatecall design (single storage base with stateless modules) and fallback dispatch.

- Entry points and access control
  - Catalog public/external functions and modifiers; verify `onlyDAO`, `onlyMember`, `whenNotPaused`, `notSelf` usage.
  - Inspect dictatorship mode toggles and implications for privileged access.

- State machine and token accounting
  - Trace join flow, fee splits, remainders, member snapshots, and external reward checkpoints.
  - Validate treasury disbursement paths and isolation of reserved vs available balances.

- Arithmetic and curve validation
  - Review curve configuration validation, linear/exponential math, and overflow/underflow safeguards.
  - Inspect saturation to `MAX_ENTRY_FEE` and inverse solving of base fees.

- Reentrancy and external calls
  - Confirm `nonReentrant` coverage on state‑mutating flows (join, claims, executeProposal).
  - Analyze governance external call surface (ETH forwarding, revert bubbling, cleanup of calldata).

- Factory and deployment posture
  - Validate SSTORE2 chunking for init code, pointer length checks, permissionless toggle, and defaults.

- Tests and static analysis artifacts
  - Skim test suite for coverage of invariants, reentrancy, and edge cases.
  - Review Slither config and exclusions; reason about justifications.

- Threat modeling and reporting
  - Enumerate assumptions, risks, and abuse cases; assign severity by impact/likelihood.
  - Provide actionable recommendations prioritized by security value.

Limitations of this pass: this report is source‑review‑driven; we did not execute tests or run Slither in this environment. Recommendations include additional fuzz/property testing steps to strengthen assurance.

## Attack Surface and Considerations
- Roles and powers
  - Priest: may toggle dictatorship and (when enabled) call DAO‑gated functions directly.
  - Members: may join/claim and create/vote on proposals (subject to snapshots and single active proposal limit).
  - Protocol: receives a configured percent of joins; does not have arbitrary on‑chain control.
  - Factory deployer: controls permissionless mode of factory; no control over deployed TEMPL instances post‑creation.

- Assets
  - Access token (ERC‑20) balances held by the TEMPL instance (treasury and member pool).
  - External reward ERC‑20s tracked per‑token and ETH received via `receive()`.

- Sensitive flows
  - Governance external call proposals (arbitrary `call` with optional ETH value) — intentionally powerful.
  - Treasury withdrawals and disbands — must respect reserved member/external pools.
  - Membership joins — must avoid reentrancy and maintain accounting correctness.

## Detailed Component Review

### TEMPL (root dispatcher)
- Fallback delegates to a selector→module map; invalid selectors revert. Module addresses are immutable and set at construction.
- Delegate path uses inline assembly with memory‑safe mode; returns or reverts with callee returndata.
- Risk notes: No upgrade path (reduced surface). Selector mapping correctness depends on constructor wiring; present and explicit.

### TemplBase (shared storage and helpers)
- Access modifiers:
  - `onlyDAO`: allows self‑calls (governance) and, when dictatorship is enabled, also the priest.
  - `onlyMember`, `whenNotPaused`, and `notSelf` are applied on relevant flows.
- Curve math:
  - Validates segment shapes and boundaries; guards against misconfigured segments (e.g., last segment length must be 0 if infinite tail).
  - Linear scaling uses `mulDiv` with overflow guards; exponential scaling computes factor via exponentiation by squaring with saturation to `MAX_ENTRY_FEE`.
- Reward accounting:
  - Member pool: uses cumulative per‑member snapshot and remainder carry‑forward; external rewards maintain per‑token checkpoints keyed by block/timestamp to break ties and support binary search lookups.
- Treasury isolation:
  - Withdrawals verify “available” for access token vs reserved member pool; similarly for ETH and other ERC‑20s.
- Notes: Good separation of concerns; consistent event emission for observability.

### Membership Module
- Join:
  - Computes splits (burn/treasury/member pool/protocol), optional referral slice from member pool, and updates internal accounting before transfers.
  - Transfers via `SafeERC20`; three distinct `safeTransferFrom` calls for burn/contract/protocol, then potential `_safeTransfer` for referral.
  - Reentrancy guarded; `notSelf` prevents internal double‑entry.
  - Assumes standard ERC‑20 semantics (no fee‑on‑transfer/rebase); comment acknowledges this.
- Claims:
  - Member pool and external rewards use `nonReentrant` and balance checks; ETH claims via `.call` with success check.

### Governance Module
- Proposal lifecycle:
  - Enforces minimum/maximum voting periods; charges optional proposal creation fee; one active proposal per proposer.
  - Snapshots: capture joinSequence and block numbers at creation and at quorum; eligibility checks prevent “joined after” voting.
  - Quorum: maintained between quorum reach and execution; execution delayed by configured seconds after quorum.
- Execution:
  - Switches over action enum; calls into internal setters that ultimately update base storage.
  - External call action: arbitrary `call{value}`; reverts bubble; `externalCallData` cleared after use (minimizes accidental reuse).
- Notes: Execution is `nonReentrant`, mitigating reentry to core paths; other public getters and proposal management surfaces appear safe.

### Treasury Module
- DAO‑gated setters and treasury functions directly call base helpers.
- External rewards cleanup is public but safe (requires zeroed balances/remainders).

### Factory
- Stores `TEMPL` creation bytecode across SSTORE2 pointers; validates chunk loads and expected total length before concatenation and `create`.
- Permissionless flag toggled only by factory deployer; creation paths sanitize inputs and validate split sums include protocol percent.
- Default curve is exponential with infinite tail; defaults are explicit; constructor wires modules immutably.

## Findings (Expanded Rationale)
See Findings section above for severities and recommendations. Key reasoning highlights:
- External call proposals: acceptable with strong social/process controls; code appropriately surfaces risk (and Slither exclusion is justified).
- ERC‑20 assumptions: typical for DAO treasuries; if access tokens with taxes are in play, consider enforcing policy at factory or adding runtime assertions.
- Reentrancy: coverage is good at sensitive flows; external calls can still reach other public surfaces, but snapshots/guards minimize exploitability.
- Enumeration/gas: manageable; proposal fee and one‑active‑proposal limit reduce spam risk; consider caps if needed.

## Testing & Verification Plan (Recommended)
- Static analysis: run Slither with current config; review all findings except `arbitrary-send-eth` (documented by design).
- Unit/integration tests: execute existing suite; add property tests for:
  - Curve computation (forward/inverse) saturation boundaries and per‑segment transitions.
  - External reward checkpoint bisect and snapshot correctness across joins/disbands.
  - Accounting vs actual balances for standard ERC‑20s; detect drift.
- Fuzz governance edge cases: quorum boundaries, voter churn around snapshots, proposal pruning and pagination windows.

## Limitations
- This report is based on source review; no live deployment validation, no bytecode‑level formal proofs, and no external dependency audits (e.g., OZ libs) were performed in this run.
- Network‑level concerns (RPC, chain reorganizations beyond common depths) are out of scope; timestamp manipulation risk is minimal but present at very small margins.

## Appendix: Auditor Checklist (Abbreviated)
- [x] Access controls and role transitions (priest, DAO self‑calls, dictatorship toggles)
- [x] Reentrancy and external call surfaces (join, claims, executeProposal, ETH/ERC‑20 transfers)
- [x] Treasury accounting isolation (available vs reserved)
- [x] Snapshotting (joinSequence, block) and eligibility checks
- [x] Curve math validation and overflow/underflow guards
- [x] Factory deploy process (SSTORE2 pointers, permissionless toggles)
- [x] Input validation and revert reasons (custom errors coverage)
- [x] Event coverage for off‑chain observability
- [x] Tests coverage skim and Slither config rationale

## Threat Model & Assumptions
- Access token is a standard ERC‑20 (no transfer taxes, hooks, rebasing). Accounting assumes exact amounts.
- Arbitrary external call proposals (if approved) can move funds or execute arbitrary logic. This is intended.
- Priest (dictatorship) mode grants direct control to the priest over DAO actions while enabled; this is an emergency/bootstrapping feature.
- TEMPL instances are not upgradeable; modules are immutable addresses wired at construction; factory SSTORE2 pointers are written once at deploy.

## Architecture Overview
- `TEMPL.sol` delegates user calls by function selector to module contracts (`TemplMembershipModule`, `TemplTreasuryModule`, `TemplGovernanceModule`) via `delegatecall`. Shared state lives in `TemplBase`.
- Only‑DAO pattern: functions restricted to governance are callable by `address(this)` (self‑call via proposal execution), or by the priest if dictatorship is enabled.
- Governance: proposal creation (with optional fee), snapshots (joinSequence and block), quorum maintenance, execution delay, one active proposal per address, external calls bubbled with revert data.
- Membership: guarded `join`/`claim*` with `nonReentrant`, fee splitting to burn/treasury/member pool/protocol, referral slice from member pool, join‑sequence snapshots.
- Treasury: withdrawals isolate reserved member/external pools from “available” balances for both ERC‑20 and ETH; disband pushes treasury into member/external reward pools with checkpoints.
- Factory: permissionless toggle, default parameters, SSTORE2 chunked init code for `TEMPL` constructor bytecode.

## Findings

### High
1) Arbitrary External Call Proposals Can Drain Treasury (By Design)
- Details: Governance executes `target.call{value: callValue}(callData)` and bubbles revert data; any approved call may transfer ETH/tokens or perform arbitrary logic.
- Risk: Operational. If voters approve malicious calldata, funds can be drained.
- Recommendation: Keep prominent UI warnings; optionally offer a restricted/allowlisted mode for deployments needing stricter controls.

### Medium
2) ERC‑20 Semantics Assumed; Non‑standard Tokens Break Accounting
- Details: Join splits compute expected amounts and update internal accounting, then transfer. Fee‑on‑transfer/rebasing tokens will desync internal balances vs actual balances; comments acknowledge this assumption.
- Impact: Later treasury withdrawals or claims may revert due to insufficient actual balances; accounting may misreport.
- Recommendations:
  - Enforce/allowlist known‑good tokens at deploy time or in the factory (policy or registry).
  - Optionally add runtime sanity checks (e.g., compare expected vs received amounts) with adjustments, if complexity is acceptable.

3) `cleanupExternalRewardToken` Is Publicly Callable
- Details: Anyone can remove a zeroed external reward token from the enumeration. No funds at risk; minor UX griefing possible by churn of enumeration.
- Recommendation: Consider DAO‑gating or rate‑limiting if griefing observed; acceptable as‑is.

4) External Call Reentrancy Into Non‑Guarded Functions
- Details: `executeProposal` is `nonReentrant`, so it cannot be reentered. The arbitrary external call can still call other public functions that are not reentrancy‑guarded.
- Impact: We did not find a concrete exploit due to snapshotting and explicit checks; note as an accepted surface.
- Recommendation: Optionally add a lightweight “governance executing” guard if risk appetite demands.

### Low
5) Active Proposal Enumeration Gas Growth
- Details: `getActiveProposals` / paginated variant iterate over `activeProposalIds`. One active per address mitigates spam but broad participation can still increase iteration cost.
- Recommendation: Keep proposal fee and front‑end limits; optionally cap total active proposals.

6) Event `joinId` Semantics
- Details: The `joinId` emitted is `currentMemberCount == 0 ? 0 : currentMemberCount - 1`; slightly non‑intuitive but consistent.
- Recommendation: Document how it’s intended to be consumed by off‑chain indexers.

### Informational
7) Only‑DAO Pattern Is Unusual but Sound in Delegatecall Architecture
- Details: Gated functions accept self‑calls from the contract and priest during dictatorship.
- Recommendation: Keep clear docs/UI on dictatorship implications.

## Positive Observations
- Robust reentrancy protection on joins, claims, and proposal execution; tests exercise reentrancy cases.
- Treasury isolation of reserved vs available balances for ERC‑20 and ETH is careful and consistent.
- Snapshotting by join sequence prevents voter set manipulation around quorum transitions.
- Factory SSTORE2 chunking is implemented safely with length checks; no risky code writes.

## Testing & Tooling Suggestions
- Continue running `slither` (with `arbitrary-send-eth` excluded by design) and coverage. Add property‑based tests for:
  - Curve arithmetic saturation and inverse solving around edges (MAX_ENTRY_FEE, pow/linear accumulation).
  - Reward remainder flushing invariants across joins and disbands.
  - Consistency assertions: internal accounting vs actual balances for standard ERC‑20s.
- Fuzz proposal snapshot edges: joins/votes near quorum and execution windows.

## Deployment & Config Hardening
- Token Policy: enforce a pre‑deployment check for standard ERC‑20 semantics; optionally an on‑chain allowlist in the factory.
- UI/Process: loud warnings on external call proposals; clear guidance for enabling/disabling dictatorship.
- Optional: “restricted external calls” mode (curated targets and selectors) for less sophisticated communities.

## Conclusion
The codebase is thoughtfully structured, with careful handling of reentrancy, treasury isolation, and governance snapshots. No critical vulnerabilities were identified under the stated assumptions. The main high‑risk vector is governance‑approved arbitrary external calls, which is an intentional feature that should remain clearly communicated operationally. Medium/low issues have straightforward mitigations or are acceptable with documentation.
