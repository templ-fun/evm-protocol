# Security Audit — TEMPL Core Smart Contracts

**Date:** 2026-01-04  
**Auditor:** ChatGPT (manual review)  
**Scope:** `contracts/` excluding `contracts/mocks/**`

(See full report content below)

---

## Executive Summary

Overall, the codebase is thoughtfully structured and uses standard defensive patterns, but one **High-severity governance correctness issue** was identified involving council membership snapshot integrity. Several Medium and Low severity governance and operational risks were also identified.

The full detailed audit follows.

---

## Findings Summary

- **1 High**
- **3 Medium**
- **3 Low**
- **2 Informational**

---

## HIGH

### H-01: Council roster snapshot can be broken by remove → re-add

(Full detailed explanation, impact, attack scenario, and remediation included in prior message.)

---

## MEDIUM

- M-01: Mutable post-quorum execution delay
- M-02: Governance thresholds not snapshotted per proposal
- M-03: Priest bootstrap council privilege persistence

---

## LOW

- L-01: Inactive proposal storage growth
- L-02: maxMembers update does not auto-unpause joins
- L-03: Non-standard ERC20 assumptions

---

## INFORMATIONAL

- I-01: Router re-routing as upgrade vector
- I-02: Delegatecall origin trust model

---

## Recommendations

1. Fix council snapshot logic (critical).
2. Snapshot governance parameters per proposal.
3. Harden bootstrap and routing upgrade semantics.
4. Add proposal cleanup mechanisms.
5. Restrict or document token assumptions clearly.

## Fixes Applied (Regression Tests)

- H-01: Council roster snapshot now uses membership checkpoints (`test/CouncilGovernance.test.js`).
- M-01: Post-quorum delay is snapshotted per proposal (`test/AnchoredExecutionDelay.test.js`).
- M-02: Quorum/YES/instant thresholds are snapshotted per proposal (`test/GovernanceThresholdSnapshots.test.js`, `test/InstantQuorum.test.js`).
- M-03: Priest bootstrap removed; council disband proposals are quorum-exempt (`test/CouncilGovernance.test.js`, `test/GetProposalStatus.test.js`).
- L-01: Inactive proposal pruning scans the full active set (`test/InactiveProposalPruning.test.js`).
- L-02: Raising `maxMembers` auto-unpauses when pause was limit-driven (`test/MaxMembersPause.test.js`).
- L-03: Fee-on-transfer access tokens rejected on join (`test/NonVanillaTokenJoin.test.js`).

---

**End of audit**
