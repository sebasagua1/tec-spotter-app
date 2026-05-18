
-- =========================
-- Profiles: drop overly broad read
-- =========================
DROP POLICY IF EXISTS "Authenticated can view non-sensitive profile fields via view" ON public.profiles;

-- =========================
-- Friendships: only addressee can update status
-- =========================
DROP POLICY IF EXISTS "Users can update own friendships" ON public.friendships;

CREATE POLICY "Addressee can update friendship"
ON public.friendships
FOR UPDATE
TO authenticated
USING (auth.uid() = addressee_id)
WITH CHECK (auth.uid() = addressee_id);

-- =========================
-- Security definer helpers (avoid recursive RLS)
-- =========================
CREATE OR REPLACE FUNCTION public.is_event_participant(_event_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.event_participants
    WHERE event_id = _event_id AND user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_event_creator(_event_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.events
    WHERE id = _event_id AND creator_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_group_member(_group_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = _group_id AND user_id = _user_id
  );
$$;

-- =========================
-- Event participants: restrict SELECT
-- =========================
DROP POLICY IF EXISTS "Users can view event participants" ON public.event_participants;

CREATE POLICY "Participants and creators can view event participants"
ON public.event_participants
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_event_creator(event_id, auth.uid())
  OR public.is_event_participant(event_id, auth.uid())
);

-- =========================
-- Group members: restrict SELECT to fellow members
-- =========================
DROP POLICY IF EXISTS "Members can view group members" ON public.group_members;

CREATE POLICY "Members can view fellow group members"
ON public.group_members
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_group_member(group_id, auth.uid())
);

-- =========================
-- Groups: restrict SELECT to members/creators
-- =========================
DROP POLICY IF EXISTS "Group members can view groups" ON public.groups;

CREATE POLICY "Members and creators can view groups"
ON public.groups
FOR SELECT
TO authenticated
USING (
  created_by = auth.uid()
  OR public.is_group_member(id, auth.uid())
);

-- =========================
-- Storage: avatars — remove duplicate public-role policies, no listing
-- =========================
DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;

-- Authenticated upload to own folder
CREATE POLICY "Authenticated can upload own avatar"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Public read of individual objects (no listing — list requires broader access)
CREATE POLICY "Public can read avatar objects"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (bucket_id = 'avatars');

-- =========================
-- Realtime: lock down channel subscriptions
-- =========================
ALTER TABLE IF EXISTS realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can use scoped realtime topics" ON realtime.messages;

CREATE POLICY "Authenticated can use scoped realtime topics"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  -- Allow general postgres_changes channels (no topic-scoped private data)
  realtime.topic() IN ('messages', 'events')
  OR (
    realtime.topic() LIKE 'event:%'
    AND public.is_event_participant(
      NULLIF(split_part(realtime.topic(), ':', 2), '')::uuid,
      auth.uid()
    )
  )
  OR (
    realtime.topic() LIKE 'group:%'
    AND public.is_group_member(
      NULLIF(split_part(realtime.topic(), ':', 2), '')::uuid,
      auth.uid()
    )
  )
);

CREATE POLICY "Authenticated can broadcast on scoped topics"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  realtime.topic() IN ('messages', 'events')
  OR (
    realtime.topic() LIKE 'event:%'
    AND public.is_event_participant(
      NULLIF(split_part(realtime.topic(), ':', 2), '')::uuid,
      auth.uid()
    )
  )
  OR (
    realtime.topic() LIKE 'group:%'
    AND public.is_group_member(
      NULLIF(split_part(realtime.topic(), ':', 2), '')::uuid,
      auth.uid()
    )
  )
);
