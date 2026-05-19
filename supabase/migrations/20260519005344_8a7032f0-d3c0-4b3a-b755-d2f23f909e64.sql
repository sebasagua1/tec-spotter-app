
REVOKE ALL ON FUNCTION public.is_event_participant(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_event_creator(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_group_member(uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.is_event_participant(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_event_creator(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_group_member(uuid, uuid) TO authenticated;
