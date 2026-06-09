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
