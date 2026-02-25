-- =============================================================================
-- Go Bahrain: user profile table + RLS policies
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query).
-- =============================================================================

-- 0) Create account table if missing (one row per auth.users entry)
CREATE TABLE IF NOT EXISTS public.account (
  account_uuid uuid NOT NULL PRIMARY KEY,
  email text,
  password text,
  name text,
  phone text
);

-- 1) Ensure account table allows empty password when using Supabase Auth (skip if account does not exist)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'account') THEN
    ALTER TABLE public.account ALTER COLUMN password DROP NOT NULL;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 2) User profile table: references auth.users directly (no account table needed for trigger)
CREATE TABLE IF NOT EXISTS public."user" (
  account_uuid uuid NOT NULL,
  username text,
  age int NULL,
  user_type text NULL CHECK (user_type IN ('tourist', 'local')),
  avatar text NULL,
  latitude double precision NULL,
  longitude double precision NULL,
  created_at timestamptz NULL DEFAULT now(),
  updated_at timestamptz NULL DEFAULT now(),
  CONSTRAINT user_pkey PRIMARY KEY (account_uuid)
);
-- Switch FK from account to auth.users if needed (so trigger does not depend on account table)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_account_fkey') THEN
    ALTER TABLE public."user" DROP CONSTRAINT user_account_fkey;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_auth_fkey') THEN
    ALTER TABLE public."user" ADD CONSTRAINT user_auth_fkey
      FOREIGN KEY (account_uuid) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
COMMENT ON TABLE public."user" IS 'Profile and preferences; one row per auth user.';

-- 3) No trigger: Supabase was returning "Database error saving new user" when the trigger ran.
--    Profile is created by the app after signUp (client-side upsert in SignUpScreen) when the user has a session.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- 4) RLS for account (only if table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'account') THEN
    ALTER TABLE public.account ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "account_select_own" ON public.account;
    CREATE POLICY "account_select_own" ON public.account FOR SELECT USING (auth.uid() = account_uuid);
    DROP POLICY IF EXISTS "account_update_own" ON public.account;
    CREATE POLICY "account_update_own" ON public.account FOR UPDATE USING (auth.uid() = account_uuid);
    DROP POLICY IF EXISTS "account_insert_own" ON public.account;
    CREATE POLICY "account_insert_own" ON public.account FOR INSERT WITH CHECK (auth.uid() = account_uuid);
  END IF;
END $$;

-- 5) RLS for user
ALTER TABLE public."user" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_select_own" ON public."user";
CREATE POLICY "user_select_own"
  ON public."user" FOR SELECT
  USING (auth.uid() = account_uuid);

DROP POLICY IF EXISTS "user_update_own" ON public."user";
CREATE POLICY "user_update_own"
  ON public."user" FOR UPDATE
  USING (auth.uid() = account_uuid);

CREATE POLICY "user_insert_own"
  ON public."user" FOR INSERT
  WITH CHECK (auth.uid() = account_uuid);
-- No DELETE if you want to preserve profiles.

-- 6) Optional: allow anon to read nothing; service role bypasses RLS.
--    Authenticated users can only read/update their own account and user rows.
