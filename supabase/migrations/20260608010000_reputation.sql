
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
