-- Add email column to user_subscriptions table for easier querying
ALTER TABLE user_subscriptions ADD COLUMN IF NOT EXISTS email TEXT;

-- Create index for email lookups
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_email ON user_subscriptions (email);

-- Update existing records with email from auth.users
UPDATE user_subscriptions 
SET email = (
  SELECT au.email 
  FROM auth.users au 
  WHERE au.id = user_subscriptions.user_id
)
WHERE email IS NULL;
