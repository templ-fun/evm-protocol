# Migration Guide: TEMPL → TEMPL_DAO

## Overview
This guide helps you migrate from the priest-controlled TEMPL contract to the new DAO-governed TEMPL_DAO contract.

## Key Changes

### Treasury Control
- **Before**: Priest had sole control of treasury withdrawals
- **After**: Treasury withdrawals require member voting (>50% yes votes)

### Governance
- **Before**: No governance mechanism
- **After**: Full DAO governance with proposals and voting

### Priest Role
- **Before**: Controls treasury + receives 10% protocol fee
- **After**: Only receives 10% protocol fee (no treasury control)

## Migration Steps

### 1. Deploy New TEMPL_DAO Contract

```bash
# Update your .env to ensure correct settings
vim .env

# Deploy the new DAO contract
npm run deploy
```

The new contract will have:
- Same token distribution (30/30/30/10)
- DAO-controlled treasury
- Proposal and voting mechanisms
- Same member pool rewards system

### 2. Update Frontend URLs

Update all your links to include the new contract address:
```
# Purchase page
https://yoursite.com/purchase.html?contract=NEW_CONTRACT_ADDRESS

# Proposal creation
https://yoursite.com/propose.html?contract=NEW_CONTRACT_ADDRESS

# Voting dashboard
https://yoursite.com/vote.html?contract=NEW_CONTRACT_ADDRESS
```

### 3. Create New Temple

Use the priest dashboard to create a new temple:
1. Visit `https://yoursite.com/priest.html`
2. Enter new contract address
3. Create new Telegram group
4. System auto-links contract to group

### 4. Migrate Members (Optional)

Since blockchain state can't be migrated, you have two options:

#### Option A: Fresh Start
- Deploy new contract
- Members purchase access again
- Clean slate for DAO governance

#### Option B: Manual Migration
- Deploy new contract
- Priest can airdrop tokens to previous members
- Members claim access with reduced/zero fee
- Implement custom migration logic

### 5. First DAO Actions

After migration, test the DAO functionality:

#### Create First Proposal
```javascript
// Example: Transfer initial funds from treasury
Title: "Initial Treasury Allocation"
Description: "Transfer 100 tokens to marketing wallet"
Action: Treasury Transfer
Amount: 100 tokens
Recipient: 0xMarketingWallet
```

#### Vote on Proposal
- Members visit vote.html
- Cast yes/no votes
- Monitor voting progress
- Execute after voting period ends

### 6. Update Documentation

Update your documentation to reflect:
- New governance model
- Voting procedures
- Proposal creation guidelines
- Treasury management process

## Smart Contract Differences

### TEMPL (Old)
```solidity
// Priest-controlled treasury
function withdrawTreasury(address recipient, uint256 amount) 
    external onlyPriest

function withdrawAllTreasury(address recipient) 
    external onlyPriest
```

### TEMPL_DAO (New)
```solidity
// DAO-controlled treasury
function createProposal(
    string title, 
    string description, 
    bytes callData, 
    uint256 votingPeriod
) external onlyMember

function vote(uint256 proposalId, bool support) 
    external onlyMember

function executeProposal(uint256 proposalId) 
    external

function withdrawTreasuryDAO(address recipient, uint256 amount, string reason) 
    external onlyDAO
```

## Testing Checklist

- [ ] Deploy new TEMPL_DAO contract
- [ ] Create new temple via priest.html
- [ ] Test member purchase flow
- [ ] Create test proposal
- [ ] Cast votes
- [ ] Execute passed proposal
- [ ] Verify treasury withdrawal via DAO
- [ ] Test member pool claims
- [ ] Verify all pages work with new contract

## FAQ

### Q: Can I upgrade the existing contract?
A: No, smart contracts are immutable. You must deploy a new TEMPL_DAO contract.

### Q: What happens to the old treasury?
A: The priest can withdraw remaining funds from the old contract before migration.

### Q: Do members keep their access?
A: Telegram group access remains, but on-chain state starts fresh unless you implement custom migration.

### Q: Can the priest still withdraw treasury in TEMPL_DAO?
A: No, all treasury withdrawals require member voting and passed proposals.

### Q: What's the default voting period?
A: 7 days by default, but can be set between 1-30 days per proposal.

### Q: Who can create proposals?
A: Any member who has purchased access can create proposals.

### Q: What's the voting threshold?
A: Proposals need >50% yes votes to pass (simple majority).

## Support

For issues during migration:
- Check deployment logs
- Verify contract on Basescan
- Test with small amounts first
- Review DAO documentation
- Check proposal execution requirements

## Security Considerations

1. **Treasury Safety**: DAO treasury is more secure as it requires community consensus
2. **Proposal Review**: Members should carefully review proposal calldata
3. **Voting Period**: Ensure adequate time for member participation
4. **Emergency Actions**: Consider creating emergency pause proposals if needed
5. **Code Audits**: Review proposal calldata for security before voting

## Rollback Plan

If issues arise:
1. Pause new contract if needed (via DAO proposal)
2. Continue using old contract temporarily
3. Fix issues and redeploy
4. Communicate clearly with members
5. Ensure treasury funds are secure

---

Remember: The migration to DAO governance empowers your community while maintaining security. Take time to educate members about the new voting process and their responsibilities in governance.