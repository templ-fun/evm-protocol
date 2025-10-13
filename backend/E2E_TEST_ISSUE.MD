# E2E Failing Join Flow Summary

## Current Symptoms
- Playwright `core-flows.pw.spec.js` fails while waiting on `/join` response. The UI raises `handlePurchaseAndJoin`, but the backend never receives the request (`purchaseAndJoin: sending join payload` never logs), so the test times out.
- Multiple retries show Hardhat emits `Nonce too low … Expected nonce to be 3 but got 2` for the UI wallet. The deploy transaction repeatedly reuses nonce 2.
- When the scripted wallet bridge switches to a freshly generated account, the default Hardhat factory rejects deployment because permissionless mode is disabled, so the UI deploy path never succeeds.

## Root Causes
1. **Nonce handling between Node wallets and the browser bridge.** The bridge now signs transactions for randomly created wallets. When the UI calls `__templTrigger("deploy")`, the browser tries to submit a transaction before the provider clears the previous pending tx. Hardhat runs with automine and does not queue, so the duplicate nonce throws and nothing reaches the backend.
2. **Factory permission gating.** The new random UI wallet is not the factory deployer; without `setPermissionless(true)` the contract reverts. This kept the UI from recording deployments.
3. **join payload never fires.** Because deploy never finishes, `handlePurchaseAndJoin` never runs, so `/join` is never POSTed.

## Reliable Fix Strategy
1. **Enable permissionless creation in tests.**
   - After deploying `TemplFactory` inside `fixtures.js`/`core-flows.pw.spec.js`, call `await templFactory.setPermissionless(true);` so any funded wallet can deploy.
2. **Wait for Node/network to clear a nonce before each UI transaction.**
   - Before calling `__templTrigger('deploy')`, poll `provider.getTransactionCount(address, 'pending')` until it equals `'latest'`.
   - Inside the bridge, seed `req.nonce` with `await provider.getTransactionCount(address,'pending')`. This matches the check above and prevents duplicate use.
3. **Auto-trigger deploy once.**
   - Instead of clicking the button during the test, set `window.__templSetAutoDeploy(true)` and rely on the app’s auto-deploy effect (already authored for vitest flows).
4. **Verify success in test flow.**
   - Replace the previous `expect` on raw hash with a status poll (`'✅ Templ deployed'`) and confirm the contract bytecode is non-empty.
5. **After deploy succeeds, schedule `handlePurchaseAndJoin`.**
   - Ensure the test waits for join payload log (`purchaseAndJoin: sending join payload`). After it appears, the `/join` POST resolves, the backend registers the new group, and the rest of the flow can continue.

## Next Steps for Engineer
1. Implement the permissionless toggle and nonce synchronization in `core-flows.pw.spec.js`.
2. Remove manual UI clicks for deploy; use the exposed auto-trigger and wait for the success status.
3. Confirm `purchaseAndJoin` logs appear and `/join status 200` shows up in `PW_E2E_VERBOSE` output.
4. Once the pilot flow passes, run `npm run test:all` to verify no other regressions were introduced.
