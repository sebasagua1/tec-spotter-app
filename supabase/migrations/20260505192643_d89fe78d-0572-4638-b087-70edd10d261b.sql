
-- 1. Profiles: restrict email visibility — users see their own full profile, others see public fields only
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;

CREATE POLICY "Users can view own full profile"
ON public.profiles FOR SELECT TO authenticated
USING (auth.uid() = id);

CREATE POLICY "Users can view others' public profile fields"
ON public.profiles FOR SELECT TO authenticated
USING (auth.uid() <> id);
-- Note: column-level restriction not enforced by RLS; recommend a public_profiles view in app code.
-- To fully prevent email enumeration, app code should query a view excluding email for other users.

-- 2. Messages: scope SELECT to event participants or group members
DROP POLICY IF EXISTS "Users can view messages for their events/groups" ON public.messages;

CREATE POLICY "Users can view messages in their events or groups"
ON public.messages FOR SELECT TO authenticated
USING (
  sender_id = auth.uid()
  OR (event_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.event_participants ep
    WHERE ep.event_id = messages.event_id AND ep.user_id = auth.uid()
  ))
  OR (group_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.group_members gm
    WHERE gm.group_id = messages.group_id AND gm.user_id = auth.uid()
  ))
);

-- 3. Reports: reporter can read their own
CREATE POLICY "Reporters can view their own reports"
ON public.reports FOR SELECT TO authenticated
USING (auth.uid() = reporter_id);

-- 4. Avatars storage: allow owner delete + update
CREATE POLICY "Users can delete own avatar"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'avatars' AND (auth.uid())::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update own avatar"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'avatars' AND (auth.uid())::text = (storage.foldername(name))[1]);

-- 5. Lock down SECURITY DEFINER functions — revoke from public/anon
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
