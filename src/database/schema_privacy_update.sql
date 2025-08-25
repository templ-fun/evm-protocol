-- Privacy-focused schema update
-- Removes Telegram username storage while maintaining claim tracking

-- Drop the username columns (backup data first if needed)
ALTER TABLE access_claims 
DROP COLUMN IF EXISTS telegram_username,
DROP COLUMN IF EXISTS telegram_user_id;

-- The table now only tracks that a wallet has claimed for a contract
-- No personal Telegram information is stored