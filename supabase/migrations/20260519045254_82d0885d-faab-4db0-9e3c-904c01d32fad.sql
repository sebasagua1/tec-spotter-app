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