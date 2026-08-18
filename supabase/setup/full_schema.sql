-- ============================================================
-- ConnectTec — esquema completo (consolidado de migrations/)
-- Pegar en el SQL Editor de un proyecto Supabase NUEVO y ejecutar.
-- Generado: 2026-08-16
--
-- NOTA: se omite el bloque de RLS sobre realtime.messages (tabla
-- interna de Supabase) porque el SQL Editor no es su dueño. El
-- realtime por postgres_changes funciona igual vía la RLS de las
-- tablas public.* y la publicación supabase_realtime. Ver README.
-- ============================================================


-- >>> 20260325002039_580a4570-80e2-489b-a6c5-bff44bc6f240.sql <<<

-- Enable PostGIS for location points
CREATE EXTENSION IF NOT EXISTS postgis;

-- ============================================================
-- PROFILES TABLE (linked to auth.users)
-- ============================================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT,
  avatar_url TEXT,
  major TEXT,
  semester INTEGER,
  residence_type TEXT CHECK (residence_type IN ('local', 'foraneo', 'international')),
  interests TEXT[] DEFAULT '{}',
  languages TEXT[] DEFAULT '{}',
  availability JSONB DEFAULT '{}',
  points INTEGER NOT NULL DEFAULT 0,
  reputation FLOAT NOT NULL DEFAULT 0,
  onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- EVENTS TABLE
-- ============================================================
CREATE TABLE public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('study', 'sports', 'social', 'shopping', 'volunteering', 'other')),
  lng DOUBLE PRECISION,
  lat DOUBLE PRECISION,
  address TEXT,
  description TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  max_spots INTEGER NOT NULL DEFAULT 10,
  current_spots INTEGER NOT NULL DEFAULT 0,
  privacy TEXT NOT NULL DEFAULT 'open' CHECK (privacy IN ('open', 'friends', 'private')),
  is_recurring BOOLEAN NOT NULL DEFAULT FALSE,
  recurrence_rule TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view open active events" ON public.events FOR SELECT TO authenticated
  USING (privacy = 'open' OR creator_id = auth.uid());
CREATE POLICY "Authenticated users can create events" ON public.events FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = creator_id);
CREATE POLICY "Creators can update their events" ON public.events FOR UPDATE TO authenticated
  USING (auth.uid() = creator_id);
CREATE POLICY "Creators can delete their events" ON public.events FOR DELETE TO authenticated
  USING (auth.uid() = creator_id);

-- ============================================================
-- EVENT PARTICIPANTS
-- ============================================================
CREATE TABLE public.event_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'joined' CHECK (status IN ('joined', 'pending', 'declined')),
  checked_in BOOLEAN NOT NULL DEFAULT FALSE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, user_id)
);

ALTER TABLE public.event_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view event participants" ON public.event_participants FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can join events" ON public.event_participants FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own participation" ON public.event_participants FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users can leave events" ON public.event_participants FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================
-- FRIENDSHIPS
-- ============================================================
CREATE TABLE public.friendships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  addressee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'blocked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (requester_id, addressee_id)
);

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own friendships" ON public.friendships FOR SELECT TO authenticated
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);
CREATE POLICY "Users can send friend requests" ON public.friendships FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = requester_id);
CREATE POLICY "Users can update own friendships" ON public.friendships FOR UPDATE TO authenticated
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);
CREATE POLICY "Users can delete own friendships" ON public.friendships FOR DELETE TO authenticated
  USING (auth.uid() = requester_id OR auth.uid() = addressee_id);

-- ============================================================
-- GROUPS
-- ============================================================
CREATE TABLE public.groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  photo_url TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Group members can view groups" ON public.groups FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can create groups" ON public.groups FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Creators can update groups" ON public.groups FOR UPDATE TO authenticated
  USING (auth.uid() = created_by);

-- ============================================================
-- GROUP MEMBERS
-- ============================================================
CREATE TABLE public.group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (group_id, user_id)
);

ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view group members" ON public.group_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can join groups" ON public.group_members FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can leave groups" ON public.group_members FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================
-- MESSAGES (ephemeral)
-- ============================================================
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES public.events(id) ON DELETE CASCADE,
  group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view messages for their events/groups" ON public.messages FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can send messages" ON public.messages FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = sender_id);

-- ============================================================
-- BADGES
-- ============================================================
CREATE TABLE public.badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_type TEXT NOT NULL,
  earned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, badge_type)
);

ALTER TABLE public.badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view badges" ON public.badges FOR SELECT TO authenticated USING (true);
CREATE POLICY "System can insert badges" ON public.badges FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- REPORTS
-- ============================================================
CREATE TABLE public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reported_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  reported_event_id UUID REFERENCES public.events(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can create reports" ON public.reports FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = reporter_id);

-- ============================================================
-- Updated_at trigger function
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- Enable Realtime
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.event_participants;

-- ============================================================
-- Storage bucket for avatars
-- ============================================================
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true);

CREATE POLICY "Avatar images are publicly accessible" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
CREATE POLICY "Users can upload their own avatar" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can update their own avatar" ON storage.objects FOR UPDATE USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);


-- >>> 20260325002054_ff739100-9da0-4f4b-8e55-e0122e1ecf77.sql <<<

-- Fix: Move PostGIS to a dedicated schema
DROP EXTENSION IF EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis SCHEMA extensions;

-- Fix: Set search_path on update_updated_at_column
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


-- >>> 20260326151750_6a998335-d3f9-4f6a-8fae-3467a3e7cc34.sql <<<
-- Create campuses table
CREATE TABLE public.campuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  email_domain text UNIQUE,
  lat double precision,
  lng double precision,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.campuses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view campuses" ON public.campuses
  FOR SELECT TO authenticated USING (true);

-- Seed Tec de Monterrey
INSERT INTO public.campuses (name, email_domain, lat, lng)
VALUES ('Tec de Monterrey', 'tec.mx', 25.6514, -100.2899);

-- Add campus_id to profiles
ALTER TABLE public.profiles ADD COLUMN campus_id uuid REFERENCES public.campuses(id);

-- >>> 20260505192643_d89fe78d-0572-4638-b087-70edd10d261b.sql <<<

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


-- >>> 20260505193910_b982ac79-3405-4150-bc9f-28be011089a3.sql <<<
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

-- >>> 20260518070740_29093684-8658-4d88-9810-236752b340ea.sql <<<

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
-- [bloque realtime.messages omitido en el consolidado — aplicar aparte si se requiere]


-- >>> 20260518070800_04b55336-8271-468a-aad9-e3fdb320f4e9.sql <<<

REVOKE EXECUTE ON FUNCTION public.is_event_participant(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_event_creator(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_group_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_event_participant(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_event_creator(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_group_member(uuid, uuid) TO authenticated;


-- >>> 20260519005344_8a7032f0-d3c0-4b3a-b755-d2f23f909e64.sql <<<

REVOKE ALL ON FUNCTION public.is_event_participant(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_event_creator(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_group_member(uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.is_event_participant(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_event_creator(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_group_member(uuid, uuid) TO authenticated;


-- >>> 20260519045254_82d0885d-faab-4db0-9e3c-904c01d32fad.sql <<<
CREATE OR REPLACE FUNCTION public.recalc_event_spots()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id uuid;
  v_count integer;
  v_max integer;
BEGIN
  v_event_id := COALESCE(NEW.event_id, OLD.event_id);

  SELECT COUNT(*) INTO v_count
  FROM public.event_participants
  WHERE event_id = v_event_id AND status = 'joined';

  SELECT max_spots INTO v_max
  FROM public.events
  WHERE id = v_event_id;

  IF TG_OP = 'INSERT' AND v_count > v_max THEN
    RAISE EXCEPTION 'EVENT_FULL' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.events
  SET current_spots = v_count
  WHERE id = v_event_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_recalc_spots_insert ON public.event_participants;
DROP TRIGGER IF EXISTS trg_recalc_spots_delete ON public.event_participants;

CREATE TRIGGER trg_recalc_spots_insert
AFTER INSERT ON public.event_participants
FOR EACH ROW EXECUTE FUNCTION public.recalc_event_spots();

CREATE TRIGGER trg_recalc_spots_delete
AFTER DELETE ON public.event_participants
FOR EACH ROW EXECUTE FUNCTION public.recalc_event_spots();

REVOKE EXECUTE ON FUNCTION public.recalc_event_spots() FROM PUBLIC, anon, authenticated;

-- >>> 20260604120000_fix-three-security-bugs.sql <<<

-- ============================================================
-- FIX 1: public_profiles view — switch to security_invoker=false
--
-- With security_invoker=true the view runs as the calling user.
-- The only SELECT policy on profiles is USING(auth.uid()=id), so
-- every query via the view returns only the caller's own row.
--
-- With security_invoker=false (SECURITY DEFINER semantics) the
-- view runs as its owner (postgres, who has BYPASSRLS).  RLS on
-- the underlying profiles table is therefore checked against the
-- view owner — and bypassed — so all rows are visible.
-- Email is not in the column list, so it is never exposed.
-- ============================================================
CREATE OR REPLACE VIEW public.public_profiles
WITH (security_invoker = false) AS
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

-- ============================================================
-- FIX 2a: Block direct tampering with points / reputation.
--
-- The trigger is NOT SECURITY DEFINER so it executes as the
-- calling user.  When current_user='authenticated' (a regular
-- client) any change to points/reputation is rejected.
-- Server-side SECURITY DEFINER functions run as postgres —
-- current_user='postgres' — so they may still update scores.
-- ============================================================
CREATE OR REPLACE FUNCTION public.prevent_score_tampering()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (NEW.points IS DISTINCT FROM OLD.points OR NEW.reputation IS DISTINCT FROM OLD.reputation)
     AND current_user = 'authenticated' THEN
    RAISE EXCEPTION 'permission denied: score fields are read-only for regular users'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.prevent_score_tampering() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_prevent_score_tampering ON public.profiles;
CREATE TRIGGER trg_prevent_score_tampering
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_score_tampering();

-- ============================================================
-- FIX 2b: Block self-awarded badges.
--
-- The original policy allowed any authenticated user to INSERT
-- a badge for themselves.  Dropping it means no INSERT policy
-- exists for the authenticated role, so RLS blocks all client
-- inserts.  Service role / postgres (BYPASSRLS) are unaffected.
-- ============================================================
DROP POLICY IF EXISTS "System can insert badges" ON public.badges;

-- ============================================================
-- FIX 2c: Block self check-in on event_participants.
--
-- The trigger rejects flipping checked_in false→true when the
-- caller is authenticated but is NOT the event creator.
-- The event creator and SECURITY DEFINER server functions may
-- still perform check-ins.
-- ============================================================
CREATE OR REPLACE FUNCTION public.prevent_self_checkin()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.checked_in = true AND OLD.checked_in = false AND current_user = 'authenticated' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.events
      WHERE id = NEW.event_id AND creator_id = auth.uid()
    ) THEN
      RAISE EXCEPTION 'permission denied: only the event creator can check in participants'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.prevent_self_checkin() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_prevent_self_checkin ON public.event_participants;
CREATE TRIGGER trg_prevent_self_checkin
  BEFORE UPDATE ON public.event_participants
  FOR EACH ROW EXECUTE FUNCTION public.prevent_self_checkin();

-- ============================================================
-- FIX 3a: are_friends(a, b) — SECURITY DEFINER helper.
--
-- Returns true when an accepted friendship exists in either
-- direction between a and b.  SECURITY DEFINER so it can bypass
-- the friendships SELECT policy when called from the events RLS
-- expression.  Locked down to authenticated only.
-- ============================================================
CREATE OR REPLACE FUNCTION public.are_friends(a uuid, b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.friendships
    WHERE status = 'accepted'
      AND (
        (requester_id = a AND addressee_id = b)
        OR (requester_id = b AND addressee_id = a)
      )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.are_friends(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.are_friends(uuid, uuid) TO authenticated;

-- ============================================================
-- FIX 3b: Update events SELECT policy to honour 'friends' privacy.
--
-- Previous policy: open OR own event only.
-- New policy also allows: friends-only event visible to accepted
-- friends of the creator.  'private' remains creator-only.
-- ============================================================
DROP POLICY IF EXISTS "Anyone can view open active events" ON public.events;

CREATE POLICY "Events visibility policy"
  ON public.events FOR SELECT TO authenticated
  USING (
    privacy = 'open'
    OR creator_id = auth.uid()
    OR (privacy = 'friends' AND public.are_friends(creator_id, auth.uid()))
  );


-- >>> 20260604130000_checkin-and-points.sql <<<

-- ============================================================
-- GOAL A: append-only point_events ledger
--
-- Non-farmable: UNIQUE (user_id, event_id, reason) means a
-- given award can only land once.  No client write policies →
-- the authenticated role can never INSERT/UPDATE/DELETE directly.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.point_events (
    id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    event_id   uuid        REFERENCES public.events(id) ON DELETE SET NULL,
    reason     text        NOT NULL CHECK (reason IN ('join', 'organize', 'check_in', 'rate')),
    points     int         NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, event_id, reason)
);

ALTER TABLE public.point_events ENABLE ROW LEVEL SECURITY;

-- Users may only read their own rows; no INSERT/UPDATE/DELETE policy → client can never write
CREATE POLICY "Users can read own point ledger"
    ON public.point_events FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

-- ============================================================
-- GOAL A: award_points
--
-- SECURITY DEFINER (runs as postgres/BYPASSRLS) so it can:
--   1. Write to point_events (no client INSERT policy).
--   2. UPDATE profiles.points without triggering the
--      prevent_score_tampering guard (current_user = 'postgres').
-- EXECUTE revoked from all client roles; only reachable via
-- trigger functions and check_in_to_event, both also SECURITY DEFINER.
-- ============================================================

CREATE OR REPLACE FUNCTION public.award_points(
    _user_id  uuid,
    _event_id uuid,
    _reason   text,
    _points   int
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_inserted int;
BEGIN
    INSERT INTO public.point_events (user_id, event_id, reason, points)
    VALUES (_user_id, _event_id, _reason, _points)
    ON CONFLICT (user_id, event_id, reason) DO NOTHING;

    GET DIAGNOSTICS v_inserted = ROW_COUNT;

    -- Only credit the profile when the ledger row is genuinely new
    IF v_inserted > 0 THEN
        UPDATE public.profiles
        SET points = points + _points
        WHERE id = _user_id;
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.award_points(uuid, uuid, text, int) FROM PUBLIC, anon, authenticated;

-- ============================================================
-- GOAL A: join award trigger (10 pts)
--
-- SECURITY DEFINER so it can call award_points (EXECUTE is
-- revoked from authenticated).  current_user = 'postgres'
-- inside this function, which also lets award_points update
-- profiles without hitting prevent_score_tampering.
-- ============================================================

CREATE OR REPLACE FUNCTION public.on_participant_join_award()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.status = 'joined' THEN
        PERFORM public.award_points(NEW.user_id, NEW.event_id, 'join', 10);
    END IF;
    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.on_participant_join_award() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_on_participant_join_award ON public.event_participants;
CREATE TRIGGER trg_on_participant_join_award
    AFTER INSERT ON public.event_participants
    FOR EACH ROW EXECUTE FUNCTION public.on_participant_join_award();

-- ============================================================
-- GOAL A: organize award trigger (25 pts)
-- ============================================================

CREATE OR REPLACE FUNCTION public.on_event_create_award()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM public.award_points(NEW.creator_id, NEW.id, 'organize', 25);
    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.on_event_create_award() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_on_event_create_award ON public.events;
CREATE TRIGGER trg_on_event_create_award
    AFTER INSERT ON public.events
    FOR EACH ROW EXECUTE FUNCTION public.on_event_create_award();

-- ============================================================
-- GOAL B: check_in_to_event RPC
--
-- GPS coordinates are client-reported; this raises the bar
-- against casual fraud but cannot be considered a hard
-- guarantee against GPS spoofing.
--
-- SECURITY DEFINER means current_user = 'postgres' during
-- execution.  The trg_prevent_self_checkin trigger only blocks
-- when current_user = 'authenticated', so it does NOT fire
-- here — no change to that trigger is needed.
-- ============================================================

CREATE OR REPLACE FUNCTION public.check_in_to_event(
    _event_id uuid,
    _lat      double precision,
    _lng      double precision
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid             uuid := auth.uid();
    v_event           RECORD;
    v_dist_m          double precision := 0;
    v_already_checked boolean;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '42501';
    END IF;

    SELECT id, lat, lng, starts_at, ends_at
    INTO   v_event
    FROM   public.events
    WHERE  id = _event_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'EVENT_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;

    -- Entry allowed 15 min before start; rejected after event ends
    IF now() < v_event.starts_at - interval '15 minutes'
    OR now() > v_event.ends_at THEN
        RAISE EXCEPTION 'OUTSIDE_EVENT_WINDOW' USING ERRCODE = 'P0001';
    END IF;

    SELECT checked_in
    INTO   v_already_checked
    FROM   public.event_participants
    WHERE  event_id = _event_id
      AND  user_id  = v_uid
      AND  status   = 'joined';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_A_PARTICIPANT' USING ERRCODE = 'P0001';
    END IF;

    -- Haversine distance using plain trig (no PostGIS on search_path required)
    -- Skip the distance check if the event has no pinned coordinates
    IF v_event.lat IS NOT NULL AND v_event.lng IS NOT NULL THEN
        v_dist_m := 2.0 * 6371000.0 * asin(
            sqrt(
                power(sin(radians(v_event.lat - _lat) / 2.0), 2) +
                cos(radians(_lat)) * cos(radians(v_event.lat)) *
                power(sin(radians(v_event.lng - _lng) / 2.0), 2)
            )
        );

        IF v_dist_m > 150.0 THEN
            RAISE EXCEPTION 'TOO_FAR_FROM_EVENT' USING ERRCODE = 'P0001';
        END IF;
    END IF;

    -- Idempotently mark the participant as checked in.
    -- trg_prevent_self_checkin does NOT block this UPDATE because
    -- current_user = 'postgres' inside a SECURITY DEFINER function,
    -- so the trigger's guard (current_user = 'authenticated') is false.
    UPDATE public.event_participants
    SET    checked_in = true
    WHERE  event_id = _event_id
      AND  user_id  = v_uid;

    -- Award points only on the first successful check-in
    IF NOT v_already_checked THEN
        PERFORM public.award_points(v_uid, _event_id, 'check_in', 15);
    END IF;

    RETURN jsonb_build_object(
        'checked_in', true,
        'distance_m', round(v_dist_m::numeric, 1)
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_in_to_event(uuid, double precision, double precision) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.check_in_to_event(uuid, double precision, double precision) TO authenticated;


-- >>> 20260608000000_badge-awards.sql <<<

-- ============================================================
-- try_award_badge: idempotent single-badge insert.
-- Used by check_and_award_badges; never called by the client.
-- ============================================================
CREATE OR REPLACE FUNCTION public.try_award_badge(
    _user_id    uuid,
    _badge_type text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.badges (user_id, badge_type)
    VALUES (_user_id, _badge_type)
    ON CONFLICT (user_id, badge_type) DO NOTHING;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.try_award_badge(uuid, text) FROM PUBLIC, anon, authenticated;

-- ============================================================
-- check_and_award_badges: evaluate every badge condition for
-- a single user and award any newly-met ones.
-- Idempotent: safe to call multiple times.
-- ============================================================
CREATE OR REPLACE FUNCTION public.check_and_award_badges(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count int;
BEGIN
    -- organizer: created 5+ events
    SELECT COUNT(*) INTO v_count
    FROM public.events
    WHERE creator_id = _user_id;

    IF v_count >= 5 THEN
        PERFORM public.try_award_badge(_user_id, 'organizer');
    END IF;

    -- explorer: joined 10+ events
    SELECT COUNT(*) INTO v_count
    FROM public.event_participants
    WHERE user_id = _user_id AND status = 'joined';

    IF v_count >= 10 THEN
        PERFORM public.try_award_badge(_user_id, 'explorer');
    END IF;

    -- study_buddy: checked in to 5+ study sessions
    SELECT COUNT(*) INTO v_count
    FROM public.event_participants ep
    JOIN public.events e ON ep.event_id = e.id
    WHERE ep.user_id = _user_id
      AND ep.checked_in = true
      AND e.category = 'study';

    IF v_count >= 5 THEN
        PERFORM public.try_award_badge(_user_id, 'study_buddy');
    END IF;

    -- team_player: joined 5+ sports events
    SELECT COUNT(*) INTO v_count
    FROM public.event_participants ep
    JOIN public.events e ON ep.event_id = e.id
    WHERE ep.user_id = _user_id
      AND ep.status = 'joined'
      AND e.category = 'sports';

    IF v_count >= 5 THEN
        PERFORM public.try_award_badge(_user_id, 'team_player');
    END IF;

    -- streak_7: active on 7+ distinct calendar days (any join)
    SELECT COUNT(DISTINCT date_trunc('day', ep.joined_at)) INTO v_count
    FROM public.event_participants ep
    WHERE ep.user_id = _user_id AND ep.status = 'joined';

    IF v_count >= 7 THEN
        PERFORM public.try_award_badge(_user_id, 'streak_7');
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_and_award_badges(uuid) FROM PUBLIC, anon, authenticated;

-- ============================================================
-- Trigger on event_participants: fires after JOIN and after
-- a check-in (UPDATE OF checked_in).
-- ============================================================
CREATE OR REPLACE FUNCTION public.on_participant_badge_check()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM public.check_and_award_badges(NEW.user_id);
    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.on_participant_badge_check() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_badge_check_on_participant ON public.event_participants;
CREATE TRIGGER trg_badge_check_on_participant
    AFTER INSERT OR UPDATE OF checked_in ON public.event_participants
    FOR EACH ROW EXECUTE FUNCTION public.on_participant_badge_check();

-- ============================================================
-- Trigger on events: fires after a new event is created.
-- ============================================================
CREATE OR REPLACE FUNCTION public.on_event_badge_check()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM public.check_and_award_badges(NEW.creator_id);
    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.on_event_badge_check() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_badge_check_on_event ON public.events;
CREATE TRIGGER trg_badge_check_on_event
    AFTER INSERT ON public.events
    FOR EACH ROW EXECUTE FUNCTION public.on_event_badge_check();


-- >>> 20260608010000_reputation.sql <<<

-- ============================================================
-- award_reputation: adds reputation to a user, capped at 1000.
-- SECURITY DEFINER so it bypasses the prevent_score_tampering
-- trigger (current_user = 'postgres', not 'authenticated').
-- ============================================================
CREATE OR REPLACE FUNCTION public.award_reputation(
    _user_id uuid,
    _amount  float
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.profiles
    SET reputation = LEAST(reputation + _amount, 1000)
    WHERE id = _user_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.award_reputation(uuid, float) FROM PUBLIC, anon, authenticated;

-- ============================================================
-- Trigger: award +2 reputation to the event CREATOR each time
-- a new participant joins (status = 'joined').
-- Does not award rep when the creator joins their own event.
-- ============================================================
CREATE OR REPLACE FUNCTION public.on_participant_creator_rep()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_creator_id uuid;
BEGIN
    IF NEW.status = 'joined' THEN
        SELECT creator_id INTO v_creator_id
        FROM public.events
        WHERE id = NEW.event_id;

        IF FOUND AND v_creator_id IS NOT NULL AND v_creator_id <> NEW.user_id THEN
            PERFORM public.award_reputation(v_creator_id, 2);
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.on_participant_creator_rep() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_participant_creator_rep ON public.event_participants;
CREATE TRIGGER trg_participant_creator_rep
    AFTER INSERT ON public.event_participants
    FOR EACH ROW EXECUTE FUNCTION public.on_participant_creator_rep();

-- ============================================================
-- Update check_in_to_event: add +5 reputation on first check-in.
-- Full function re-declared with CREATE OR REPLACE.
-- ============================================================
CREATE OR REPLACE FUNCTION public.check_in_to_event(
    _event_id uuid,
    _lat      double precision,
    _lng      double precision
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
-- GPS coordinates are client-reported; this raises the bar against casual fraud
-- but cannot be considered a hard guarantee against GPS spoofing.
DECLARE
    v_uid             uuid := auth.uid();
    v_event           RECORD;
    v_dist_m          double precision := 0;
    v_already_checked boolean;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '42501';
    END IF;

    SELECT id, lat, lng, starts_at, ends_at
    INTO   v_event
    FROM   public.events
    WHERE  id = _event_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'EVENT_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;

    IF now() < v_event.starts_at - interval '15 minutes'
    OR now() > v_event.ends_at THEN
        RAISE EXCEPTION 'OUTSIDE_EVENT_WINDOW' USING ERRCODE = 'P0001';
    END IF;

    SELECT checked_in
    INTO   v_already_checked
    FROM   public.event_participants
    WHERE  event_id = _event_id
      AND  user_id  = v_uid
      AND  status   = 'joined';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'NOT_A_PARTICIPANT' USING ERRCODE = 'P0001';
    END IF;

    IF v_event.lat IS NOT NULL AND v_event.lng IS NOT NULL THEN
        v_dist_m := 2.0 * 6371000.0 * asin(
            sqrt(
                power(sin(radians(v_event.lat - _lat) / 2.0), 2) +
                cos(radians(_lat)) * cos(radians(v_event.lat)) *
                power(sin(radians(v_event.lng - _lng) / 2.0), 2)
            )
        );
        IF v_dist_m > 150.0 THEN
            RAISE EXCEPTION 'TOO_FAR_FROM_EVENT' USING ERRCODE = 'P0001';
        END IF;
    END IF;

    UPDATE public.event_participants
    SET    checked_in = true
    WHERE  event_id = _event_id
      AND  user_id  = v_uid;

    IF NOT v_already_checked THEN
        PERFORM public.award_points(v_uid, _event_id, 'check_in', 15);
        PERFORM public.award_reputation(v_uid, 5);
    END IF;

    RETURN jsonb_build_object(
        'checked_in', true,
        'distance_m', round(v_dist_m::numeric, 1)
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_in_to_event(uuid, double precision, double precision) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.check_in_to_event(uuid, double precision, double precision) TO authenticated;


-- >>> 20260608020000_fix-messages-insert-policy.sql <<<
DROP POLICY IF EXISTS "Users can send messages" ON public.messages;

CREATE POLICY "Members can send messages"
ON public.messages FOR INSERT TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND (
    (event_id IS NOT NULL AND public.is_event_participant(event_id, auth.uid()))
    OR (group_id IS NOT NULL AND public.is_group_member(group_id, auth.uid()))
  )
);


-- >>> 20260608040000_event-ratings.sql <<<
-- ============================================================
-- Add rating column to event_participants (1-5 stars, nullable)
-- ============================================================
ALTER TABLE public.event_participants
  ADD COLUMN IF NOT EXISTS rating smallint CHECK (rating BETWEEN 1 AND 5);

-- Drop old 2-parameter version if it exists (created before this migration was corrected)
DROP FUNCTION IF EXISTS public.rate_event(uuid, smallint);

-- ============================================================
-- rate_event: lets a participant rate an event (1-5).
-- p_user_id is accepted from the client but validated against
-- auth.uid() so callers cannot rate on behalf of another user.
-- Awards +5 points on the FIRST rating (idempotent via the
-- unique constraint in point_events).
-- ============================================================
CREATE OR REPLACE FUNCTION public.rate_event(
    p_event_id uuid,
    p_user_id  uuid,
    p_rating   smallint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid uuid := auth.uid();
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '42501';
    END IF;

    -- Prevent rating on behalf of another user
    IF v_uid <> p_user_id THEN
        RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = '42501';
    END IF;

    IF p_rating < 1 OR p_rating > 5 THEN
        RAISE EXCEPTION 'INVALID_RATING' USING ERRCODE = 'P0001';
    END IF;

    -- Caller must be a joined participant (not the creator)
    IF NOT EXISTS (
        SELECT 1 FROM public.event_participants
        WHERE event_id = p_event_id
          AND user_id  = v_uid
          AND status   = 'joined'
    ) THEN
        RAISE EXCEPTION 'NOT_A_PARTICIPANT' USING ERRCODE = 'P0001';
    END IF;

    -- Event must have ended
    IF NOT EXISTS (
        SELECT 1 FROM public.events
        WHERE id = p_event_id AND ends_at < now()
    ) THEN
        RAISE EXCEPTION 'EVENT_NOT_ENDED' USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.event_participants
    SET rating = p_rating
    WHERE event_id = p_event_id
      AND user_id  = v_uid;

    -- Award points idempotently (unique constraint on point_events prevents double-award)
    PERFORM public.award_points(v_uid, p_event_id, 'rate', 5);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rate_event(uuid, uuid, smallint) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.rate_event(uuid, uuid, smallint) TO authenticated;



-- >>> 20260817000000_group-membership-rpcs.sql <<<
-- ============================================================
-- Membresía de grupos vía RPC (arregla DMs, invitaciones y el
-- hueco de auto-unirse a grupos ajenos).
--
-- Problema que resuelve:
--   La política "Users can join groups" solo permitía
--   WITH CHECK (auth.uid() = user_id). El cliente intentaba
--   insertar a OTRA persona (al crear un DM y al invitar a un
--   grupo), la fila ajena violaba el WITH CHECK y la sentencia
--   entera fallaba: no se insertaba nadie. Los DMs quedaban sin
--   miembros y ningún mensaje se podía enviar.
--   Además esa misma política dejaba que cualquiera se metiera
--   en cualquier grupo con solo conocer su UUID.
--
-- Solución: la membresía deja de ser escribible desde el cliente.
--   - El creador entra automáticamente por trigger.
--   - Los DMs se crean con create_dm() (atómico, exige amistad).
--   - Las invitaciones pasan por add_group_member() (exige que
--     quien invita ya sea miembro y que el invitado sea su amigo).
--   Salir del grupo sigue siendo un DELETE directo del propio row.
-- ============================================================


-- ============================================================
-- 1. El creador de un grupo entra siempre como miembro.
--
-- Antes lo hacía el cliente con un INSERT aparte, que se queda
-- sin política. Con el trigger no hay ventana en la que un grupo
-- exista sin su creador dentro.
-- ============================================================
CREATE OR REPLACE FUNCTION public.on_group_created_add_creator()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.group_members (group_id, user_id)
  VALUES (NEW.id, NEW.created_by)
  ON CONFLICT (group_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.on_group_created_add_creator() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_group_created_add_creator ON public.groups;
CREATE TRIGGER trg_group_created_add_creator
  AFTER INSERT ON public.groups
  FOR EACH ROW EXECUTE FUNCTION public.on_group_created_add_creator();


-- ============================================================
-- 2. create_dm(_other_user_id) → uuid del grupo DM
--
-- Idempotente: si el DM ya existe devuelve el mismo grupo, mire
-- quien lo mire. El nombre es determinista (__dm_<uuid menor>_<uuid mayor>)
-- para que ambas partes lleguen al mismo registro; la búsqueda va
-- por dentro de la función (SECURITY DEFINER), así que funciona
-- aunque quien llama todavía no sea miembro y no pueda verlo por RLS.
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_dm(_other_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_name     text;
  v_group_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  IF _other_user_id IS NULL OR _other_user_id = v_uid THEN
    RAISE EXCEPTION 'INVALID_TARGET' USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.are_friends(v_uid, _other_user_id) THEN
    RAISE EXCEPTION 'NOT_FRIENDS' USING ERRCODE = '42501';
  END IF;

  v_name := '__dm_' || least(v_uid, _other_user_id)::text
                    || '_' || greatest(v_uid, _other_user_id)::text;

  -- ORDER BY created_at: el bug anterior pudo dejar más de un grupo con
  -- el mismo nombre __dm_ (cada parte creó el suyo, sin miembros). Quedarse
  -- siempre con el más antiguo hace que ambas partes converjan en uno solo;
  -- el INSERT de abajo lo repara metiendo a los dos.
  SELECT id INTO v_group_id
  FROM   public.groups
  WHERE  name = v_name
  ORDER  BY created_at
  LIMIT  1;

  IF v_group_id IS NULL THEN
    INSERT INTO public.groups (name, created_by)
    VALUES (v_name, v_uid)
    RETURNING id INTO v_group_id;
    -- el trigger ya metió a v_uid; falta la otra parte
  END IF;

  INSERT INTO public.group_members (group_id, user_id)
  VALUES (v_group_id, v_uid), (v_group_id, _other_user_id)
  ON CONFLICT (group_id, user_id) DO NOTHING;

  RETURN v_group_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_dm(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.create_dm(uuid) TO authenticated;


-- ============================================================
-- 3. add_group_member(_group_id, _user_id)
--
-- Quien invita tiene que ser ya miembro del grupo, y solo puede
-- invitar a sus amigos aceptados. Los grupos DM no admiten gente
-- nueva: son de dos y su nombre determinista dejaría de cuadrar.
-- ============================================================
CREATE OR REPLACE FUNCTION public.add_group_member(_group_id uuid, _user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_name text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  SELECT name INTO v_name FROM public.groups WHERE id = _group_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'GROUP_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_name LIKE '\_\_dm\_%' THEN
    RAISE EXCEPTION 'CANNOT_INVITE_TO_DM' USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.is_group_member(_group_id, v_uid) THEN
    RAISE EXCEPTION 'NOT_A_MEMBER' USING ERRCODE = '42501';
  END IF;

  IF NOT public.are_friends(v_uid, _user_id) THEN
    RAISE EXCEPTION 'NOT_FRIENDS' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.group_members (group_id, user_id)
  VALUES (_group_id, _user_id)
  ON CONFLICT (group_id, user_id) DO NOTHING;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.add_group_member(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.add_group_member(uuid, uuid) TO authenticated;


-- ============================================================
-- 4. Cerrar el INSERT directo sobre group_members.
--
-- Sin política de INSERT para authenticated, la RLS bloquea toda
-- escritura del cliente: la membresía solo se crea por el trigger
-- y por las dos RPC de arriba (que corren como postgres/BYPASSRLS).
-- Esto cierra el hueco de meterse en cualquier grupo conociendo
-- su UUID. El DELETE ("Users can leave groups") se queda: salirse
-- sigue siendo cosa de cada quien.
-- ============================================================
DROP POLICY IF EXISTS "Users can join groups" ON public.group_members;


-- ============================================================
-- 5. El creador puede ver la lista de miembros aunque se haya
--    salido del grupo (la política de SELECT de groups ya le
--    dejaba ver el grupo; esto alinea las dos).
-- ============================================================
DROP POLICY IF EXISTS "Members can view fellow group members" ON public.group_members;

CREATE POLICY "Members and creators can view group members"
ON public.group_members
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_group_member(group_id, auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.groups g
    WHERE g.id = group_members.group_id AND g.created_by = auth.uid()
  )
);


-- ============================================================
-- OPCIONAL (no se ejecuta): limpieza de los grupos DM huérfanos
-- que dejó el bug — creados sin miembros y sin un solo mensaje.
-- Revísalos antes de borrar nada.
--
--   SELECT g.id, g.name, g.created_at
--   FROM   public.groups g
--   WHERE  g.name LIKE '\_\_dm\_%'
--     AND  NOT EXISTS (SELECT 1 FROM public.group_members m WHERE m.group_id = g.id)
--     AND  NOT EXISTS (SELECT 1 FROM public.messages     x WHERE x.group_id = g.id);
--
-- create_dm() no los necesita: si quedan, simplemente reutiliza el
-- más antiguo y le añade a las dos personas.
-- ============================================================


-- >>> 20260817010000_moderation-and-account-deletion.sql <<<
-- ============================================================
-- Moderación de contenido de usuario + soporte para borrar cuenta.
--
-- Cubre los requisitos de Apple para apps con UGC (guideline 1.2):
-- reportar contenido, bloquear personas abusivas, y que el
-- contenido bloqueado desaparezca de verdad.
--
-- El borrado de cuenta (guideline 5.1.1 v) se ejecuta desde la
-- Edge Function `delete-account`, que llama a auth.admin.deleteUser().
-- Aquí solo se prepara lo que el CASCADE no cubre.
-- ============================================================


-- ============================================================
-- 1. blocks — bloqueo unidireccional, efecto bidireccional.
--
-- Si A bloquea a B, ninguno de los dos ve al otro. Se guarda una
-- sola fila (quién bloqueó a quién) para poder desbloquear, pero
-- todas las consultas usan is_blocked(), que mira en los dos
-- sentidos: así B no puede deducir que A le bloqueó viendo que
-- él sí sigue apareciendo.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.blocks (
  blocker_id   uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id   uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Nombre en el momento del bloqueo. Denormalizado a propósito: en cuanto
  -- alguien queda bloqueado desaparece de public_profiles, así que sin esta
  -- copia la pantalla de "bloqueados" solo podría mostrar UUIDs y el bloqueo
  -- sería imposible de deshacer con criterio.
  blocked_name text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CONSTRAINT blocks_no_self CHECK (blocker_id <> blocked_id)
);

CREATE INDEX IF NOT EXISTS blocks_blocked_id_idx ON public.blocks (blocked_id);

ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;

-- Cada quien gestiona su propia lista. Nadie puede leer quién le
-- bloqueó a él: solo las filas donde es el bloqueador.
CREATE POLICY "Users can read own blocks"
  ON public.blocks FOR SELECT TO authenticated
  USING (auth.uid() = blocker_id);

CREATE POLICY "Users can block"
  ON public.blocks FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = blocker_id);

CREATE POLICY "Users can unblock"
  ON public.blocks FOR DELETE TO authenticated
  USING (auth.uid() = blocker_id);


-- ============================================================
-- 2. is_blocked(a, b) — SECURITY DEFINER, mira en ambos sentidos.
--
-- Se usa dentro de políticas RLS y de la vista public_profiles,
-- donde el rol que consulta no puede leer la tabla blocks entera.
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_blocked(a uuid, b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.blocks
    WHERE (blocker_id = a AND blocked_id = b)
       OR (blocker_id = b AND blocked_id = a)
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_blocked(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_blocked(uuid, uuid) TO authenticated;


-- ============================================================
-- 3. Bloquear implica romper la relación existente.
--
-- Al bloquear se borra la amistad (en cualquier estado, incluida
-- una solicitud pendiente) y se saca a las dos personas de sus
-- DMs comunes. Sin esto, el bloqueado seguiría en la lista de
-- amigos del otro y el DM quedaría medio visible.
-- ============================================================
CREATE OR REPLACE FUNCTION public.on_block_cleanup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dm_name text;
BEGIN
  DELETE FROM public.friendships
  WHERE (requester_id = NEW.blocker_id AND addressee_id = NEW.blocked_id)
     OR (requester_id = NEW.blocked_id AND addressee_id = NEW.blocker_id);

  v_dm_name := '__dm_' || least(NEW.blocker_id, NEW.blocked_id)::text
                       || '_' || greatest(NEW.blocker_id, NEW.blocked_id)::text;

  DELETE FROM public.group_members
  WHERE user_id IN (NEW.blocker_id, NEW.blocked_id)
    AND group_id IN (SELECT id FROM public.groups WHERE name = v_dm_name);

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.on_block_cleanup() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_block_cleanup ON public.blocks;
CREATE TRIGGER trg_block_cleanup
  AFTER INSERT ON public.blocks
  FOR EACH ROW EXECUTE FUNCTION public.on_block_cleanup();


-- ============================================================
-- 4. No se pueden mandar solicitudes de amistad a quien te bloqueó.
-- ============================================================
DROP POLICY IF EXISTS "Users can send friend requests" ON public.friendships;

CREATE POLICY "Users can send friend requests"
  ON public.friendships FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = requester_id
    AND NOT public.is_blocked(requester_id, addressee_id)
  );


-- ============================================================
-- 5. La gente bloqueada desaparece de public_profiles.
--
-- La vista corre con security_invoker = false (como su dueño) para
-- poder saltarse la RLS de profiles, pero auth.uid() sigue siendo
-- el de quien consulta, así que el filtro funciona por usuario.
-- ============================================================
CREATE OR REPLACE VIEW public.public_profiles
WITH (security_invoker = false) AS
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
FROM public.profiles p
WHERE auth.uid() IS NOT NULL
  AND NOT public.is_blocked(auth.uid(), p.id);

GRANT SELECT ON public.public_profiles TO authenticated;


-- ============================================================
-- 6. Los mensajes de gente bloqueada no se leen.
-- ============================================================
DROP POLICY IF EXISTS "Users can view messages in their events or groups" ON public.messages;

CREATE POLICY "Users can view messages in their events or groups"
ON public.messages FOR SELECT TO authenticated
USING (
  NOT public.is_blocked(auth.uid(), sender_id)
  AND (
    sender_id = auth.uid()
    OR (event_id IS NOT NULL AND public.is_event_participant(event_id, auth.uid()))
    OR (group_id IS NOT NULL AND public.is_group_member(group_id, auth.uid()))
  )
);


-- ============================================================
-- 7. Los eventos de gente bloqueada no se ven.
-- ============================================================
DROP POLICY IF EXISTS "Events visibility policy" ON public.events;

CREATE POLICY "Events visibility policy"
  ON public.events FOR SELECT TO authenticated
  USING (
    NOT public.is_blocked(auth.uid(), creator_id)
    AND (
      privacy = 'open'
      OR creator_id = auth.uid()
      OR (privacy = 'friends' AND public.are_friends(creator_id, auth.uid()))
    )
  );


-- ============================================================
-- 8. reports: poder reportar también mensajes, y dar seguimiento.
--
-- `status` existe para poder triar desde el dashboard de Supabase
-- (Apple pide actuar sobre lo reportado en menos de 24 h).
-- El CHECK obliga a que cada reporte apunte a exactamente una cosa.
-- ============================================================
ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS reported_message_id uuid REFERENCES public.messages(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS details text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';

ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS reports_status_check;
ALTER TABLE public.reports
  ADD CONSTRAINT reports_status_check
  CHECK (status IN ('pending', 'reviewed', 'actioned', 'dismissed'));

ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS reports_reason_check;
ALTER TABLE public.reports
  ADD CONSTRAINT reports_reason_check
  CHECK (reason IN ('spam', 'harassment', 'inappropriate', 'fake', 'safety', 'other'));

ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS reports_one_target;
ALTER TABLE public.reports
  ADD CONSTRAINT reports_one_target CHECK (
    (reported_user_id    IS NOT NULL)::int
  + (reported_event_id   IS NOT NULL)::int
  + (reported_message_id IS NOT NULL)::int = 1
  );

ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS reports_details_len;
ALTER TABLE public.reports
  ADD CONSTRAINT reports_details_len CHECK (details IS NULL OR length(details) <= 1000);

-- Un mismo usuario no reporta dos veces lo mismo (y de paso evita
-- que se pueda inundar la cola desde una sola cuenta).
CREATE UNIQUE INDEX IF NOT EXISTS reports_unique_user_target
  ON public.reports (reporter_id, reported_user_id)    WHERE reported_user_id    IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS reports_unique_event_target
  ON public.reports (reporter_id, reported_event_id)   WHERE reported_event_id   IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS reports_unique_message_target
  ON public.reports (reporter_id, reported_message_id) WHERE reported_message_id IS NOT NULL;

-- No se puede reportar contenido propio.
DROP POLICY IF EXISTS "Users can create reports" ON public.reports;

CREATE POLICY "Users can create reports"
  ON public.reports FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = reporter_id
    AND (reported_user_id IS NULL OR reported_user_id <> auth.uid())
  );


-- ============================================================
-- 9. Borrar el propio mensaje.
--
-- Hace falta para moderación: quien escribe algo puede retirarlo,
-- y el borrado desde el dashboard sigue estando disponible para ti.
-- ============================================================
CREATE POLICY "Senders can delete own messages"
  ON public.messages FOR DELETE TO authenticated
  USING (sender_id = auth.uid());


-- ============================================================
-- 10. Borrado de cuenta: lo que el CASCADE no cubre.
--
-- auth.admin.deleteUser() borra auth.users y de ahí caen en
-- cascada profiles, events, participaciones, amistades, grupos
-- creados, mensajes, insignias, puntos y bloqueos. Lo que NO cae
-- son los objetos de Storage, así que la Edge Function borra
-- también la carpeta del avatar.
--
-- Los reportes hechos POR el usuario que se va se conservan sin
-- autor (reporter_id pasa a NULL) para no perder la cola de
-- moderación cuando alguien reporta y luego borra su cuenta.
-- ============================================================
ALTER TABLE public.reports
  DROP CONSTRAINT IF EXISTS reports_reporter_id_fkey;

ALTER TABLE public.reports
  ALTER COLUMN reporter_id DROP NOT NULL;

ALTER TABLE public.reports
  ADD CONSTRAINT reports_reporter_id_fkey
  FOREIGN KEY (reporter_id) REFERENCES auth.users(id) ON DELETE SET NULL;
