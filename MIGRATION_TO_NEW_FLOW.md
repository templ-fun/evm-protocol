# Migration Guide: Old Manual Setup → New Temple Creation Flow

## What's Changed?
- **OLD**: Manually create Telegram groups, get IDs, update .env
- **NEW**: Priests create temples automatically via web interface

## Step-by-Step Migration & Testing

### 1. Keep Your Existing .env
Your current .env has important settings that are still needed:
- `JWT_SECRET` - Keep this
- `PRIEST_ADDRESS` - Keep this (you'll use it to create temples)
- `RPC_URL` - Keep this
- `API_ID`, `API_HASH`, `PHONE_NUMBER` - Keep these for Telegram
- `SESSION_STRING` - Keep this if you have it
- `DB_*` settings - Keep all database settings

**Remove/Ignore these** (no longer needed for new groups):
- `TELEGRAM_GROUP_ID` - Each contract will have its own group now
- `GROUP_TITLE` - Set during temple creation

### 2. Deploy a New Test Contract
```bash
# Make sure PRIEST_ADDRESS is YOUR wallet in .env
npm run deploy

# Note the CONTRACT_ADDRESS that gets deployed
# Example: 0x4f580c02de3f3c56c5c8ebbdffb81c335a6a160d
```

### 3. Start the Service
```bash
# Start the service with your existing .env
npm start

# You should see:
# ✅ Token-Gated API initialized
# ✅ Telegram client connected
# ✅ API server running on port 3002
```

### 4. Create Your First Temple (Auto Group Creation)

Open browser and go to:
```
http://localhost:3002/priest.html
```

Follow these steps:
1. **Connect Wallet** - Use the PRIEST_ADDRESS wallet
2. **Enter Contract Address** - The one you just deployed
3. **Enter Group Name** - e.g., "Test Premium Group"
4. **Enter Your Telegram Username** - Without @, e.g., "yourusername"
5. **Click "Create Temple"**

You'll see 5 steps complete:
- ✅ Verifying contract on BASE
- ✅ Creating Telegram group
- ✅ Adding priest as admin
- ✅ Adding TEMPL bot
- ✅ Registering in database

**RESULT**: You get a purchase URL like:
```
http://localhost:3002/purchase.html?contract=0x4f580c02de3f3c56c5c8ebbdffb81c335a6a160d
```

### 5. Check Your Telegram
1. Open Telegram
2. You should see a new group created
3. You should be admin in this group
4. The TEMPL bot should be in the group
5. Type `/contract` in the group - bot should respond with contract info

### 6. Test Member Join Flow

**Option A: Test with Same Wallet (Quick Test)**
1. Open the purchase URL in browser
2. Connect with priest wallet (for testing)
3. Approve tokens
4. Purchase access
5. Enter a Telegram username
6. Receive invitation

**Option B: Test with Different Wallet (Proper Test)**
1. Send the purchase URL to a friend or use different wallet
2. They connect wallet
3. They approve and pay tokens (30/30/30/10 split)
4. They enter their Telegram username
5. They receive group invitation

### 7. Verify Everything Works

Check these:
- [ ] Group was created in Telegram
- [ ] You're admin in the group
- [ ] `/contract` command works in group
- [ ] Purchase flow completes
- [ ] User receives invitation after payment
- [ ] Database shows the purchase
- [ ] Member pool accumulates (30% of fee)

### 8. Check Database
```sql
-- See all contracts and their groups
SELECT contract_address, telegram_group_id, group_title 
FROM contracts;

-- See recent purchases
SELECT * FROM purchases 
ORDER BY created_at DESC LIMIT 5;

-- See access claims
SELECT * FROM access_claims 
WHERE invitation_sent = true;
```

## Complete Test Checklist

### Phase 1: Setup ✅
- [ ] Old .env file exists with core settings
- [ ] Remove TELEGRAM_GROUP_ID from .env
- [ ] Deploy new contract with `npm run deploy`
- [ ] Start service with `npm start`

### Phase 2: Temple Creation 🛕
- [ ] Open http://localhost:3002/priest.html
- [ ] Connect priest wallet
- [ ] Enter contract address
- [ ] Enter group name
- [ ] Enter your Telegram username
- [ ] Click "Create Temple"
- [ ] Copy purchase URL

### Phase 3: Telegram Verification 💬
- [ ] New group appears in Telegram
- [ ] You are admin in the group
- [ ] TEMPL bot is in the group
- [ ] `/contract` command works

### Phase 4: Member Join Test 🎟️
- [ ] Open purchase URL
- [ ] Connect wallet (different one ideally)
- [ ] Approve token spending
- [ ] Purchase access (watch for 30/30/30/10 split)
- [ ] Enter Telegram username
- [ ] Receive group invitation

### Phase 5: Rewards Test 💰
- [ ] First member joins (no rewards)
- [ ] Second member joins (first member can claim 30% of their fee)
- [ ] Check claimable amount on contract
- [ ] Claim rewards if available

## Troubleshooting

### "You are not the priest of this contract"
- Make sure you're connected with the wallet that deployed the contract
- The wallet must match PRIEST_ADDRESS in contract

### Group not created
- Check Telegram API credentials in .env
- Make sure SESSION_STRING is valid
- Run `./first-run.sh` if needed to re-authenticate

### Bot doesn't respond to /contract
- Make sure BOT_USERNAME is set in .env
- Bot might not have been added properly
- Check bot has message permissions in group

### Users don't receive invitations
- Check their Telegram privacy settings
- Make sure they entered username correctly (no @)
- Check logs for invitation errors

## Production Deployment

Once testing is complete:
1. Deploy contract to BASE mainnet
2. Update FRONTEND_URL in .env to production domain
3. Use https://yourdomain.com/priest.html to create temples
4. Share purchase URLs with your community
5. Monitor treasury and member pool growth

## Key Differences from Old Flow

| Old Flow | New Flow |
|----------|----------|
| Manual group creation | Automatic via priest.html |
| One group per deployment | Multiple groups per priest |
| Fixed TELEGRAM_GROUP_ID in .env | Dynamic group IDs in database |
| Manual bot addition | Automatic bot addition |
| Manual database entry | Automatic registration |

## Commands Reference

```bash
# Deploy new contract
npm run deploy

# Start service
npm start

# Check system
npm run verify

# View logs
journalctl -u templ -f  # If using systemd
```

## URLs to Remember

- **Priest Dashboard**: http://localhost:3002/priest.html
- **Purchase Page**: http://localhost:3002/purchase.html?contract=0xYOUR_CONTRACT
- **Health Check**: http://localhost:3002/health

Now you can create unlimited temples (groups) for different contracts, all managed from one deployment!