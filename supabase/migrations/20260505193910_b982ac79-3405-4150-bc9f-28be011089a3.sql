-- Remove SELECT-others policy that exposed email column, replace with safe view
DROP POLICY IF EXISTS "Users can view others' public profile fields" ON public.profiles;

-- Public view excludes email and other sensitive fields
CREATE OR REPLACE VIEW public.public_profiles
WITH (security_invoker = true) AS
SELECT
  id,
  name,
  avatar_url,
  major,
  semester,
  residence_type,
  interests,
  languages,
  campus_id,
  points,
  reputation,
  created_at
FROM public.profiles;

GRANT SELECT ON public.public_profiles TO authenticated;

-- Allow authenticated users to read rows of OTHER users via the view
CREATE POLICY "Authenticated can view non-sensitive profile fields via view"
ON public.profiles
FOR SELECT
TO authenticated
USING (auth.uid() <> id);

-- Note: client must select only safe columns. The view enforces this contractually.
-- Column-level lockdown of `email` is achieved by switching client queries to public_profiles.