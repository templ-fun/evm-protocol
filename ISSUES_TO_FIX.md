High

  - Join-time O(n) external remainder flush
      - Risk: Every join loops over all externalRewardTokens (up to
        256), making joins increasingly gas-heavy and potentially DoS-y
        at scale.
      - Fix: Make remainders lazy (settled at claim time),
        rotate through a bounded slice per join, or reduce
        MAX_EXTERNAL_REWARD_TOKENS. contracts/TemplBase.sol:404,
        contracts/TemplBase.sol:26

  Medium

  - Modules callable directly (missing delegatecall guard)
      - Risk: Users can call module contracts directly; storage is
        wrong and changes are inert/confusing.
      - Fix: Add an onlyDelegatecall modifier to all externals
        in modules. contracts/TemplMembership.sol:10, contracts/
        TemplTreasury.sol:9, contracts/TemplGovernance.sol:9
  - Inconsistent access control surfaces
      - Risk: Governance executes internal helpers directly, while DAO
        routes go through onlyDAO, creating two code paths to maintain.
      - Fix: Consolidate by having governance use self-call to DAO
        functions, or enforce a single gate consistently. contracts/
        TemplGovernance.sol:549, contracts/TemplTreasury.sol:46
  - Weak reentrancy guard pattern in proposal creation
      - Risk: Uses a per-proposer boolean lock; less standard than
        nonReentrant and easier to misuse.
      - Fix: Mark all createProposal* functions nonReentrant and remove
        proposalCreationLock mapping. contracts/TemplGovernance.sol:825
  - postQuorumEligibleVoters unused in checks
      - Risk: Dead state increases complexity; might mislead
        integrators.
      - Fix: Remove field and views, or enforce “quorum must remain
        satisfied” using post-quorum snapshots in execute/getProposal.
        contracts/TemplBase.sol:154, contracts/TemplGovernance.sol:444,
        contracts/TemplGovernance.sol:697
  - Events emit large return data
      - Risk: ProposalExecuted logs full returnData; can be very
        costly.
      - Fix: Emit a bounded prefix or keccak256 hash of returndata.
        contracts/TemplBase.sol:227
  - SSTORE2-chunked init code in factory adds fragility
      - Risk: If pointers get corrupted, deployments fail; more moving
        parts.
      - Fix: Prefer direct new TEMPL(...) or add integrity hash checks
        and a maintenance refresh path. contracts/TemplFactory.sol:167,
        contracts/TemplFactory.sol:366, contracts/TemplFactory.sol:383
  - Duplicated defaults across base and factory
      - Risk: Drift over time (quorum, delay, burn address).
      - Fix: Centralize constants (library or single source).
        contracts/TemplBase.sol:18, contracts/TemplFactory.sol:16
  - O(n) active proposal scans
      - Risk: Views get more expensive as proposals accumulate.
      - Fix: Auto-prune on state transitions; maintain a compact
        active set. contracts/TemplGovernance.sol:756, contracts/
        TemplGovernance.sol:779



  Low

    - Treasury-withdraw proposals skip basic checks.
    - Unlike other proposal builders, createProposalWithdrawTreasury does not reject zero recipients or zero amounts even though _withdrawTreasury later reverts on those conditions, so invalid proposals can be created only to fail at execution time.

   - Unused TokenTransferFailed error definition.
    - The custom error is documented for failed ERC‑20 operations but never referenced—transfers rely solely on OpenZeppelin’s SafeERC20, so the error definition is dead code and misleads about runtime behavior


  - Public getter returns full external token array
      - Fix: Add pagination variant or cap array for large sets.
        contracts/TemplMembership.sol:151 - make sure pagination is used the same way across places that use pagination so we dont have double standards for same thing

  - Overloaded endTime semantics
      - Fix: Split votingEndTime vs executableAfter for
        clarity. contracts/TemplGovernance.sol:447, contracts/
        TemplGovernance.sol:883
  - Remove meaningless using directive
      - Fix: Drop using TemplErrors for *. contracts/TemplBase.sol:14
  - Fee-on-transfer tokens unsupported: documentation
      - Fix: Document prominently in README and events; optionally
        add checks to detect known non-vanilla behaviors. contracts/
        TemplMembership.sol:104
  - Introspection/nice-to-have
      - Fix: Provide ERC-165 or explicit selector lists per module for
        tooling. contracts/TEMPL.sol:120