
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
