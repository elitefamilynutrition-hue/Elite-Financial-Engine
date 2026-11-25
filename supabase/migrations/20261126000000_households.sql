-- Household tenancy (opt-in). Sellable default remains single-user until membership exists.
CREATE TABLE IF NOT EXISTS public.households (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  invite_code text NOT NULL UNIQUE,
  created_by uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.household_members (
  household_id uuid NOT NULL REFERENCES public.households (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (household_id, user_id)
);

CREATE INDEX IF NOT EXISTS household_members_user_id_idx ON public.household_members (user_id);

ALTER TABLE public.households ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.household_members ENABLE ROW LEVEL SECURITY;

-- Members can read households they belong to.
DROP POLICY IF EXISTS households_select_member ON public.households;
CREATE POLICY households_select_member ON public.households
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.household_members m
      WHERE m.household_id = households.id AND m.user_id = auth.uid()
    )
  );

-- Creator can insert their household (service role used by API for atomic create+member).
DROP POLICY IF EXISTS households_insert_own ON public.households;
CREATE POLICY households_insert_own ON public.households
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS household_members_select_own ON public.household_members;
CREATE POLICY household_members_select_own ON public.household_members
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.household_members m
      WHERE m.household_id = household_members.household_id AND m.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS household_members_insert_self ON public.household_members;
CREATE POLICY household_members_insert_self ON public.household_members
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

COMMENT ON TABLE public.households IS 'Opt-in shared household; ECE default remains personal tenant.';
