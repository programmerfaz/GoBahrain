-- "Database error saving new user" = trigger on auth.users failing.
-- "u_type is of type user_u_type but expression is of type text" = trigger or old RPC inserting text.
-- Run the ENTIRE file in Supabase SQL Editor (New query → paste all → Run).

-- 1) List triggers on auth.users (optional: run alone to see what exists)
SELECT t.tgname AS trigger_name, p.proname AS function_name
FROM pg_trigger t
JOIN pg_proc p ON p.oid = t.tgfoid
JOIN pg_class c ON c.oid = t.tgrelid
WHERE c.oid = 'auth.users'::regclass
  AND NOT t.tgisinternal;

-- 2) Drop all custom triggers on auth.users
DO $$
DECLARE
  trg name;
BEGIN
  FOR trg IN
    SELECT t.tgname
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    WHERE c.oid = 'auth.users'::regclass
      AND NOT t.tgisinternal
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON auth.users', trg);
    RAISE NOTICE 'Dropped trigger % on auth.users', trg;
  END LOOP;
END $$;

-- 3) Recreate ensure_user_profile so u_type is cast to enum (fixes "expression is of type text")
CREATE OR REPLACE FUNCTION public.ensure_user_profile(
  p_user_name text,
  p_phone text,
  p_u_type text DEFAULT 'local'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_id uuid := auth.uid();
  v_email text;
  v_account_uuid uuid;
  v_u_type public.user_u_type;
BEGIN
  IF v_auth_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  SELECT email INTO v_email FROM auth.users WHERE id = v_auth_id;
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'User email not found';
  END IF;

  IF EXISTS (SELECT 1 FROM public.account WHERE auth_user_id = v_auth_id) THEN
    RETURN;
  END IF;

  v_u_type := CASE lower(coalesce(nullif(trim(p_u_type), ''), 'local'))
    WHEN 'tourist' THEN 'tourist'::public.user_u_type
    ELSE 'local'::public.user_u_type
  END;

  INSERT INTO public.account (auth_user_id, email, user_name, phone, account_type)
  VALUES (v_auth_id, v_email, nullif(trim(p_user_name), ''), nullif(trim(p_phone), ''), 'user')
  RETURNING account_uuid INTO v_account_uuid;

  INSERT INTO public."user" (account_uuid, u_type)
  VALUES (v_account_uuid, v_u_type);
END;
$$;

-- 4) Try sign up again in the app.