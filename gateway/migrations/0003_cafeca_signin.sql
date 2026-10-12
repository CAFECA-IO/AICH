-- Sign in with CAFECA: users may exist without email/password; the CAFECA identity
-- contract address (lower-case 0x…) is their stable ID.
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ADD COLUMN cafeca_account TEXT UNIQUE;
ALTER TABLE users ADD COLUMN cafeca_handle TEXT;
ALTER TABLE users ADD COLUMN last_login_at TIMESTAMPTZ;
ALTER TABLE users ADD CONSTRAINT users_has_login CHECK (email IS NOT NULL OR cafeca_account IS NOT NULL);
