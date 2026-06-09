
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
