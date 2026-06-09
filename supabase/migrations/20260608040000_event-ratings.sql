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
