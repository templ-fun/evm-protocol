# TEMPL Protocol Deployment Checklist

## Token Distribution Model: 30/30/30/10
- 30% Burned permanently
- 30% Treasury (priest-controlled)
- 30% Member Pool (pro-rata distribution)
- 10% Protocol fee (to priest)

## Pre-Deployment Requirements

### 1. Environment Setup
- [ ] Install Node.js v16+
- [ ] Install PostgreSQL
- [ ] Have wallet with ETH on BASE (Chain ID: 8453)
- [ ] Get Telegram API credentials from https://my.telegram.org

### 2. Configuration
- [ ] Run `./setup.sh` for guided setup
- [ ] Verify `.env` file has all required values
- [ ] Ensure `ENTRY_FEE` is at least 10 wei
- [ ] Set `PRIEST_ADDRESS` (receives 10% fees + controls treasury)
- [ ] Set `TOKEN_ADDRESS` for payment token

### 3. Telegram Group Setup
- [ ] Create Telegram group manually
- [ ] Add bot as admin with restricted permissions (no invite)
- [ ] Get group ID (use @userinfobot)
- [ ] Update `TELEGRAM_GROUP_ID` in .env

## Deployment Steps

### 1. Install Dependencies
```bash
npm install
```

### 2. Compile Contracts
```bash
npm run compile
```

### 3. Run Tests
```bash
npm test
# Should show: 25 passing
```

### 4. Deploy Contract to BASE
```bash
npm run deploy
```
This will:
- Deploy TEMPL contract with 30/30/30/10 split
- Register contract in database
- Update CONTRACT_ADDRESS in .env
- Display deployment info

### 5. Verify Contract on Basescan (Optional)
```bash
npx hardhat verify --network base CONTRACT_ADDRESS PRIEST_ADDRESS TOKEN_ADDRESS ENTRY_FEE
```

### 6. Authenticate Telegram (First Time Only)
```bash
./first-run.sh
```
This will:
- Connect to Telegram with your phone
- Generate SESSION_STRING
- Update .env automatically

### 7. Initialize Database
```bash
npm run init-db
```

### 8. Verify System
```bash
npm run verify
```
Check that all components are working:
- Environment variables
- Smart contract
- Database connection
- Telegram connection

### 9. Start Service
```bash
npm start
```
Or with systemd:
```bash
sudo systemctl start templ
sudo systemctl enable templ
```

## Post-Deployment Verification

### 1. Contract Verification
- [ ] Check contract on Basescan: https://basescan.org/address/CONTRACT_ADDRESS
- [ ] Verify priest address matches
- [ ] Verify token address correct
- [ ] Verify entry fee correct

### 2. Test Purchase Flow
- [ ] Visit: http://yoursite.com/purchase.html?contract=CONTRACT_ADDRESS
- [ ] Connect wallet on BASE network
- [ ] Approve token spending
- [ ] Purchase access (check 30/30/30/10 split)
- [ ] Enter Telegram username
- [ ] Receive group invitation

### 3. Member Pool Testing (with multiple accounts)
- [ ] First member purchases (no rewards)
- [ ] Second member purchases (first gets 30 wei if fee=100)
- [ ] First member can claim rewards
- [ ] Verify pro-rata distribution

### 4. Treasury Management
- [ ] Check treasury balance
- [ ] Test withdrawal (priest only)
- [ ] Verify member pool unaffected

## Monitoring

### Check Contract Stats
```bash
curl http://localhost:3002/api/contract-stats/CONTRACT_ADDRESS
```

### View Treasury & Pool Info
```javascript
const info = await contract.getTreasuryInfo()
// Returns: [treasury, memberPool, totalToTreasury, totalBurned, totalProtocol, priest]
```

### Database Queries
```sql
-- Recent purchases
SELECT * FROM purchases ORDER BY created_at DESC LIMIT 10;

-- Access claims
SELECT * FROM access_claims WHERE invitation_sent = true;

-- Member pool claims (after implementation)
SELECT wallet_address, SUM(amount) FROM member_claims GROUP BY wallet_address;
```

## Security Checklist

- [ ] JWT_SECRET is strong and unique (32+ chars)
- [ ] PRIEST_ADDRESS is correct and secure
- [ ] No private keys in repository
- [ ] Database password is strong
- [ ] CORS configured for production URL
- [ ] Rate limiting enabled
- [ ] SSL/HTTPS configured for production

## Common Issues

### Entry Fee Too Small
- Error: "Entry fee too small for distribution"
- Solution: Set ENTRY_FEE to at least 10 wei

### Wrong Network
- Error: "Wrong network - please connect to BASE"
- Solution: Switch MetaMask to BASE (Chain ID: 8453)

### Treasury Withdrawal Failed
- Error: "Only priest can call this"
- Solution: Ensure calling from PRIEST_ADDRESS

### Member Can't Claim Rewards
- Error: "No rewards to claim"
- Solution: Rewards only accumulate from purchases after you joined

## Support

For issues or questions:
- Check logs: `journalctl -u templ -f`
- Database status: `psql -d telegram_access`
- Contract info: https://basescan.org/address/CONTRACT_ADDRESS