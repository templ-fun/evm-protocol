# Test Suite Audit (Static)

This audit reviews the Hardhat test suite under `test/`, plus the fuzz harness under `contracts/echidna/`.

## What I looked at
- 80 Hardhat/Mocha test files (`*.test.js`) under `test/` (~372 `it(...)` cases).
- Test helpers under `test/utils/` (fixtures, deploy helpers, join helpers).
- Echidna harness: `contracts/echidna/EchidnaTemplHarness.sol`.
- Hardhat config / scripts relevant to how tests are executed.

> Note: This is a **static audit** of the repository contents (no on-chain deployment outside the local harness). The findings below are about test **strength, determinism, and coverage**.

---

## Overall assessment

**Strengths**
- Good feature coverage: membership/join flows, referrals, slippage caps, fee math, member pool claiming, proposal lifecycle, voting eligibility rules, council mode, execution delay, routing upgrades, batch execution, treasury withdrawals (ETH + ERC20), disbanding, and reentrancy defenses.
- Extensive negative-path testing using **custom errors** (good: tight, intention-revealing assertions).
- Consistent use of fixtures (`loadFixture`) in `test/utils/deploy.js`, which greatly reduces inter-test coupling and time-dependent flakiness.

**Where confidence is weaker**
- A few tests are **“math/event-only”** and don’t assert the **actual ERC20 balances** that must back the accounting variables.
- A few tests toggle **global mining behaviour** (`evm_setAutomine`) without a `try/finally`, which can cascade into suite-wide flakiness if the test fails mid-way.
- One stress test includes an assertion that is effectively **vacuous** (always true given earlier minting).

---

## High priority findings (fix these first)

### 1) Potential suite-wide flake: `evm_setAutomine(false)` not guarded by `try/finally`
**File:** `test/VotingEligibility.test.js`  
**Lines:** ~129–141

The test disables automining, mines a manual block, then re-enables automining. If anything throws between those calls, automining can remain off and cause later tests to hang or fail in confusing ways.

**Recommendation:** Wrap the automine section in `try/finally` (mirroring what your `LoadGovernanceConcurrency.test.js` already does).

Suggested patch (conceptual):

```js
await ethers.provider.send("evm_setAutomine", [false]);
try {
  const voteTxPromise = templ.connect(member2).vote(0, true, txOverrides);
  const joinTxPromise = templ.connect(lateMember).join({ ...txOverrides });

  const [voteTx, joinTx] = await Promise.all([voteTxPromise, joinTxPromise]);
  await ethers.provider.send("evm_mine");
  await Promise.all([voteTx.wait(), joinTx.wait()]);
} finally {
  await ethers.provider.send("evm_setAutomine", [true]);
}
```

---

### 2) Ordering ambiguity in “same block” eligibility test (can be flaky depending on tx ordering)
**File:** `test/VotingEligibility.test.js`  
**Lines:** ~127–145

The test title says: *“allow members who joined earlier in the quorum block to vote”*.  
But the code queues two txs from different signers and mines them together. Transaction ordering across different senders can be subtle and may depend on provider behaviour.

**Recommendation:** If you truly want to test “joined earlier than the quorum-reaching vote”, enforce ordering:
- broadcast `join` first (await that the tx is accepted / has a hash),
- then broadcast the quorum vote,
- then mine.

If you *instead* want to test “joined in the quorum block (regardless of intra-block ordering)”, rename the test to match that semantic.

---

### 3) “Invariant” test that can pass even if the protocol is economically broken
**File:** `test/FeeDistributionInvariant.test.js`

This test checks arithmetic sums of event arguments. That’s useful, but it does **not** prove that:
- the access token actually moved as expected,
- the contract’s internal accounting variables match real balances,
- the protocol can pay out what it claims to have accrued.

A concrete failure mode: **fee-on-transfer / deflationary ERC20s** would make the event math look correct while leaving the contract underfunded (because `SafeERC20.transferFrom` does not validate received amount).

**Recommendation:** Strengthen by checking real token balances and core accounting invariants after each join (or at least after the loop):
- `balanceOf(templ) == treasuryBalance + memberPoolBalance` (for this scenario with no donations / no referral share).
- Burn/protocol recipient balances move by expected deltas.
- `memberRewardRemainder` never exceeds `memberPoolBalance`.

Even if you intentionally *do not support* fee-on-transfer tokens, adding this invariant test will:
- catch accidental regressions,
- document the assumption with a failing reproduction if someone tries to use unsupported tokens.

---

### 4) A “pretend assertion”: balance check that’s trivially true
**File:** `test/SplitAccountingStress.test.js`  
**Line:** ~94

```js
expect(await token.balanceOf(a.address)).to.be.gte(referralB);
```

This doesn’t prove the referral payout happened because `a` was already minted a large balance earlier. The assertion will pass even if the referral transfer is broken.

**Recommendation:** Replace with a delta assertion:

```js
const before = await token.balanceOf(a.address);
// ... trigger referral join ...
const after = await token.balanceOf(a.address);
expect(after - before).to.equal(referralB);
```

---

## Medium priority findings (improve confidence / completeness)

### A) Add missing “joinFor recipient already a member” coverage
I didn’t find a direct test that `joinFor(...)` (and variants) revert when the **recipient is already a member** (including the priest). This is a very realistic user mistake.

Add tests for:
- `joinFor(priest)` reverts with `MemberAlreadyJoined`
- `joinFor(existingMember)` reverts with `MemberAlreadyJoined`
- Same for referral + maxEntryFee variants.

---

### B) Strengthen failure-mode assertions for external calls that revert
**Files:**  
- `test/GovernanceExternalCall.test.js` (insufficient ETH case)  
- `test/GovernanceExternalCallBatch.test.js` (insufficient ETH case)

Because call-external execution bubbles revert data (and the revert data may be empty), it’s fine to use `.to.be.reverted`. But you can still make these tests more strict by asserting post-conditions:
- proposal remains `executed == false`
- proposal remains in the active set (if applicable)
- externalCallData was **not** deleted (should only be deleted on success)

That gives you “strictness” without depending on revert strings.

---

### C) Determinism nit: `Wallet.createRandom()` in a few tests
`Wallet.createRandom()` appears in:
- `AutoPruneOnExecute.test.js`
- `EntryFeeCurve.test.js`
- `LoadGovernanceConcurrency.test.js`

This is not inherently flaky, but it makes test runs **non-reproducible** at the address level. If you ever add snapshot-based golden files or want fully deterministic replay, prefer deterministic wallets from a fixed seed/mnemonic.

---

## Fuzz / invariant layer (Echidna)

You already have `contracts/echidna/EchidnaTemplHarness.sol` covering:
- fee split sums,
- bounds on entry fee and members,
- monotonicity of cumulative rewards / treasury.

Two high-value additions:
1. **Balance backing invariant:** `accessToken.balanceOf(templ) >= treasuryBalance + memberPoolBalance` (or equality depending on supported token model).
2. **Governance invariants:** active proposal indexing and executed/cancelled consistency are good fuzz targets.

---

## CI guardrails recommended

To prevent “weak / pretending” tests from creeping in over time:
- Add Mocha `forbidOnly: true` and `forbidPending: true` in `hardhat.config.cjs`.
- Add a lightweight “test lint” script that fails CI if:
  - a test uses `.to.be.reverted` without a comment explaining why (unless it’s a low-level revert contract),
  - `evm_setAutomine(false)` appears without a matching `finally` restore.

---

## Summary of actions (priority order)
1. Wrap `evm_setAutomine` toggles in `try/finally` (VotingEligibility).
2. Clarify/enforce tx ordering in the same-block eligibility test.
3. Upgrade `FeeDistributionInvariant` to assert real balances + accounting invariants.
4. Fix the trivial `gte(referralB)` assertion via balance delta.
5. Add `joinFor(existing member)` revert coverage.
6. Add CI guardrails (forbidOnly/forbidPending + automine linting).
