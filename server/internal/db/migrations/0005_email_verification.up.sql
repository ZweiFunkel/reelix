ALTER TABLE user ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0;

-- Reused for both "forgot password" and "verify email" codes — same
-- shape (user, code, expiry, used-once), just a different purpose.
ALTER TABLE password_reset_token ADD COLUMN purpose TEXT NOT NULL DEFAULT 'password_reset';
