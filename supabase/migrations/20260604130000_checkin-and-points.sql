
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
