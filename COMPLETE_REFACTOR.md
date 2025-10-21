# templ.fun Refactor & Feature Completion Guide

> **Audience:** the next LLM (or human) agent taking over this codebase. Treat this as the canonical prompt and checklist before making any edits.
>
> **Goal:** finish the delegatecall-based modular refactor, keep security-level parity (no known high/medium issues), and then deliver the pending feature work (governance proxy call + enhanced join curve).

---

## 0. Context & Current State

- The repository is mid-transition from a monolithic `TEMPL.sol` to a modular layout. `TEMPL.sol` currently tries to delegate to membership/treasury/governance modules, but the wiring is incomplete. Many constructors/tests still depend on the old single-contract shape, so **the repo does not compile or pass tests right now**.
- Referral share & proposal creation fee support were added previously (with test coverage). Those flows must remain intact throughout the refactor.
- `SafeERC20` usage has been replaced with custom helpers in `TemplBase`; several tests assert the new `TokenTransferFailed` error, so keep that behaviour.
- Gas size pressure remains: the monolithic contract was ~27.5 kB. The modular architecture is meant to drop the deployable size below the 24,576 byte limit.

You must first restore a green baseline before enhancing functionality.

---

## 1. Immediate Recovery Plan

1. **Rewind to the last green commit.**
   - Use `git log --oneline` to locate the commit just before the delegatecall experiment. Save its hash for reference.
   - Create a fresh branch from that commit (e.g. `git checkout -b modular-refactor <hash>`). Do **not** continue in the current broken branch.
   - Cherry-pick only the safe ERC-20 helper change and referral/proposal fee work if they weren’t in that commit yet. Verify tests still pass after the cherry-pick.

2. **Confirm baseline:** run `npx hardhat compile` and `npx hardhat test`. These must be green before proceeding.

3. **Backup artefacts:** copy the current notes/tests that rely on modules (e.g. `test/utils/modules.js`, selector tables). They will be useful when rebuilding the modular version.

---

## 2. Clean Modular Architecture

Implement the split in a controlled manner with minimal deviation:

1. **Introduce a storage library (`TemplStorageLib`).**
   - Define a `struct Layout` containing every state variable currently declared in `TemplBase` (members, proposals, config, external reward maps, etc.).
   - Provide `function layout() internal pure returns (Layout storage s)` that binds to a fixed storage slot (e.g. `bytes32 internal constant STORAGE_SLOT = keccak256("templ.storage.v1");`).
   - Update `TemplBase` helper functions (`_setPercentSplit`, `_join`, `_withdrawTreasury`, etc.) to operate on `layout()` instead of direct state.
   - Ensure events & modifiers still reference storage via the library.

2. **Extract logic modules.**
   - Create stateless contracts or libraries: `TemplMembershipModule`, `TemplTreasuryModule`, `TemplGovernanceModule`.
   - Each should import the storage library, use `TemplStorageLib.layout()` and provide the same external/public APIs as before (join flows, DAO wrappers, governance creation/execution).
   - Remove constructors from these modules (they should compile as simple logic containers).
   - Keep security-critical checks (reentrancy guards, access controls) exactly as they were.

3. **Rebuild the `TEMPL` router.**
   - `TEMPL.sol` should inherit nothing except `TemplBase` (for modifiers/events) and maintain immutable addresses to the three modules.
   - Constructor parameters now include module addresses. Validate non-zero, then store them.
   - Register function selectors → module addresses (use a mapping). Focus on public/external interfaces that users/DAO scripts rely upon. Generate the selector table programmatically or via arrays (tests should cover it).
   - Implement a `fallback()` that delegatecalls to the target module. Bubble revert data correctly. Include `receive()` for ETH.
   - Expose `getModuleForSelector` for introspection/debugging.

4. **Factory & deployment changes.**
   - `TemplFactory` constructor must now accept the three module addresses and pass them during deployment.
   - Update harnesses (`TemplHarness`, `DaoCallerHarness`) and tests to deploy modules via a shared helper (`deployTemplModules()` from `test/utils/modules.js`).
   - Scripts (`deploy.js`, `register-templ.js`, `verify-templ.js`) should consume env vars like `TEMPL_MEMBERSHIP_MODULE`, `TEMPL_TREASURY_MODULE`, `TEMPL_GOVERNANCE_MODULE`. Provide sane defaults for local testing (deploy modules on the fly when absent).

5. **Testing adjustments.**
   - Refactor fixtures (`deployTempl`) to take module addresses.
   - Ensure every direct `ethers.getContractFactory("TEMPL")` instantiation in tests now passes the module trio.
   - Update module selector tests (e.g., ensure `getActiveProposals`, `totalJoins` etc. route correctly).

6. **Acceptance for this phase:**
   - `SOLC_VIA_IR=true SOLC_OPT_RUNS=200 npx hardhat compile` completes.
   - `npx hardhat test` is green (run locally or ask a teammate if sandbox blocks you).
   - `scripts/deploy.js` successfully deploys a new Templ on Hardhat network using modules.
   - Bytecode for `TEMPL` (router) is below 24,576 bytes (log the size for future reference).

---

## 3. Feature Work After Refactor

1. **Governance arbitrary-call action.**
   - Define a new `Action.CallExternal` (or similar).
   - Extend `Proposal` storage with fields for `target`, `selector`, `callData` (consider storing encoded params or raw bytes to minimise storage).
   - Provide `createProposalCallExternal(address target, bytes4 selector, bytes memory params, ...)` that records the call.
   - On execution, perform `target.call(abi.encodePacked(selector, params))`. Revert bubbling must be preserved. Emit an event with success status and return data.
   - Apply security controls: reject zero target, optionally restrict to known allowlists if needed, ensure `nonReentrant` covers the call path.
   - Tests: success case, revert bubbling, event emission, governance accounting unchanged.

2. **Enhanced join curve.**
   - Agree on a curve spec (e.g. array of `{style, rateBps, startJoins, endJoins}` segments or similar). Document the spec in-code.
   - Update `TemplCurve.sol` (or create `TemplCurveLib.sol`) with iterative pricing functions that handle multiple segments.
   - Adjust constructor/factory/DAO proposals to accept the richer curve data. Validate input to avoid overflow or malformed segments.
   - Provide tests for: static curve, single exponential, multi-segment transitions, cap enforcement, saturation logic, `totalJoins == 0` edge case.

3. **Documentation & scripts.**
   - Update README with governance call instructions and curve configuration examples.
   - Extend deployment scripts to allow the new curve format and call-proxy actions.

4. **Security review.**
   - Re-run static analyzers (e.g., `npm run lint` if available, `npx hardhat node --fork` for manual testing). Consider Slither on the final contracts.
   - Double-check reentrancy coverage after introducing arbitrary calls.

---

## 4. Security & Quality Guardrails

- Maintain the previous security posture (no known high/medium severity issues). Any new external call flow should use custom errors, reentrancy guards, and explicit checks.
- Keep custom errors instead of revert strings for consistency and gas savings.
- Avoid storage collisions when moving to the storage library. Unit tests should include invariant checks if possible.
- Ensure events remain comprehensive (metadata updates, treasury actions, proxy calls). They aid off-chain monitoring.

---

## 5. Final Verification Checklist (must be green before handing off again)

- [ ] Storage library fully adopted; modules compile without constructors.
- [ ] `TEMPL` router delegates all public/external functions (map audited).
- [ ] Factory, harnesses, fixtures, scripts updated for modules.
- [ ] `npx hardhat test` green (include referral/proposal fee regressions).
- [ ] Bytecode for router < 24,576 bytes (record figure in PR/commit message).
- [ ] Governance proxy-call tests added and passing.
- [ ] Enhanced curve tests added and passing.
- [ ] Documentation (README/deploy instructions) updated.
- [ ] Basic security review (manual + tooling) completed; note any findings.

---

## 6. Helpful Commands & Tips

```bash
# Install deps
npm install

# Fast compile
npx hardhat compile

# Production-size compile
SOLC_VIA_IR=true SOLC_OPT_RUNS=200 npx hardhat compile

# Full test suite
npx hardhat test

# Run a single test file
npx hardhat test test/TemplFactory.test.js

# Measure bytecode length quickly
node scripts/print-bytecode-size.mjs contracts/TEMPL.sol:TEMPL
```

- If the CLI sandbox blocks compilation/tests, push to a branch and ask a teammate to run them locally.
- Keep commits focused (storage lib, router, modules, features) to ease future audits.

---

**Good luck!** Follow the steps above, keep the security bar high, and document anything unexpected before moving on to feature work.
