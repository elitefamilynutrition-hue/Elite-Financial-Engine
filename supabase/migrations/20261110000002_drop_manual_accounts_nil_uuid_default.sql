-- Optional tech-debt fix: remove nil-UUID default on manual_accounts.user_id.
-- App code always sets user_id explicitly; nil default breaks RLS ownership.

ALTER TABLE IF EXISTS public.manual_accounts
  ALTER COLUMN user_id DROP DEFAULT;
