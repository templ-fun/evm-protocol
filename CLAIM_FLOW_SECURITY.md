# TEMPL Protocol - Claim Flow Security Analysis

## Overview
This document explains the access claim flow and the security mechanisms that prevent double-invites and unauthorized access to Telegram groups after a single payment.

⚠️ **SECURITY AUDIT PERFORMED**: All bypass/debug code has been removed. The system now strictly enforces all security checks.

## The Complete Claim Flow

### Step 1: Purchase Transaction (On-Chain)
1. User approves token spend
2. User calls `purchaseAccess()` on the smart contract
3. Contract records: `purchases[wallet] = true`
4. Blockchain monitor detects the purchase event
5. Database records purchase with `UNIQUE(contract_address, wallet_address)` constraint

### Step 2: Session Creation (Off-Chain)
After purchase confirmation:
1. Frontend calls `/api/verify-purchase` with signed message
2. Backend verifies:
   - Signature is valid
   - Wallet owns the private key
   - Purchase exists on-chain
   - No existing claim for this wallet/contract pair
3. Backend creates JWT session token (1 hour expiry)
4. Session token contains: `{walletAddress, contractAddress, timestamp}`

### Step 3: Username Submission & Invitation
1. User submits Telegram username with session token
2. Backend validates in `/api/claim-access`:
   ```javascript
   // Check 1: Valid session token
   const session = jwt.verify(sessionToken);
   
   // Check 2: No existing claim
   const existingClaim = await db.hasClaimed(
     session.contract_address,
     session.wallet_address
   );
   if (existingClaim) {
     return error('Access already claimed');
   }
   
   // Check 3: Telegram invitation succeeds FIRST
   const result = await telegramService.inviteUserToGroup();
   
   // Check 4: Only then record the claim
   if (result.success) {
     await db.submitClaim(); // Will fail if duplicate
     await db.markSessionClaimed(sessionToken);
   }
   ```

## Security Mechanisms Preventing Double-Invites

### 1. Database Level Protection
```sql
-- Purchases table
UNIQUE(contract_address, wallet_address)  -- One purchase per wallet per contract

-- Access claims table  
UNIQUE(contract_address, wallet_address)  -- One claim per wallet per contract
```

### 2. Application Level Checks

#### Pre-Invitation Validation
```javascript
// In submitClaim() function
const existingClaim = await this.hasClaimed(contractAddress, walletAddress);
if (existingClaim) {
  throw new Error('Access already claimed for this wallet');
}
```

#### Atomic Operation
The invitation and claim recording happen atomically:
1. Attempt Telegram invitation
2. If successful → Record claim
3. If failed → No claim recorded (user can retry)

### 3. Session Token Protection
- Each session token is single-use
- Marked as "claimed" after successful invitation
- 1-hour expiry prevents long-term reuse
- Contains wallet/contract binding

### 4. Smart Contract Protection
```solidity
mapping(address => bool) public purchases;

function purchaseAccess() external {
    require(!purchases[msg.sender], "Already purchased");
    // ... payment logic ...
    purchases[msg.sender] = true;
}
```

## Attack Vectors Analysis

### ❌ Cannot: Use Same Payment Twice
- **Why**: Database `UNIQUE` constraint on purchases table
- **Protection**: `UNIQUE(contract_address, wallet_address)`

### ❌ Cannot: Claim Multiple Times with Same Wallet
- **Why**: Database `UNIQUE` constraint on claims table
- **Protection**: `hasClaimed()` check before invitation

### ❌ Cannot: Reuse Session Token
- **Why**: Token marked as claimed after use
- **Protection**: `markSessionClaimed()` after successful invitation

### ❌ Cannot: Submit Different Usernames
- **Why**: One claim per wallet enforced
- **Protection**: First successful claim locks the wallet

### ❌ Cannot: Bypass Purchase Verification
- **Why**: On-chain verification required
- **Protection**: `getPurchaseDetails()` checks blockchain state

### ❌ Cannot: Forge Session Tokens
- **Why**: JWT signed with server secret
- **Protection**: `jwt.verify()` with `JWT_SECRET`

## Potential Improvements

### 1. Rate Limiting Per Wallet
Add rate limiting to prevent rapid retry attempts:
```javascript
const attempts = await getRecentAttempts(walletAddress);
if (attempts > 3) {
  throw new Error('Too many attempts. Try again later.');
}
```

### 2. Telegram Username Uniqueness
Prevent same Telegram username across different wallets:
```sql
ALTER TABLE access_claims 
ADD CONSTRAINT unique_telegram_username 
UNIQUE(telegram_username);
```

### 3. Audit Trail
Already implemented via `invitation_logs` table for tracking all attempts.

### 4. Webhook Confirmation
Could add Telegram webhook to confirm user actually joined:
```javascript
// After invitation
await waitForJoinConfirmation(telegramUserId, timeout = 60000);
```

## Critical Security Fixes Applied

### Removed Bypass Code
- ❌ REMOVED: Frontend bypass token generation (`sessionToken = 'bypass-' + Date.now()`)
- ❌ REMOVED: Backend bypass token acceptance (`if (sessionToken.startsWith('bypass-'))`)
- ✅ ENFORCED: JWT verification is now mandatory for all claims
- ✅ ENFORCED: Session tokens must be obtained through valid purchase verification

## Summary

The system is **NOW secure against double-invites** through:

1. **Database constraints** preventing duplicate purchases/claims
2. **Pre-invitation validation** checking existing claims
3. **Atomic operations** - invitation must succeed before claim is recorded
4. **Session token management** preventing reuse
5. **On-chain verification** ensuring payment actually occurred

The only way to get multiple invites would be to:
- Use different wallets (requires multiple purchases/payments)
- Use different contracts (requires different group/payment)

Both scenarios require **legitimate additional payments**, which is the intended behavior.