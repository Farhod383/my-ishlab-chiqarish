
-- Tighten chat insert policies (was WITH CHECK true)
DROP POLICY IF EXISTS "conv_insert" ON public.chat_conversations;
CREATE POLICY "conv_insert" ON public.chat_conversations FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "part_insert" ON public.chat_participants;
CREATE POLICY "part_insert" ON public.chat_participants FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL AND (
      user_id = auth.uid()
      OR public.has_role(auth.uid(), 'admin')
      OR public.is_chat_participant(conversation_id, auth.uid())
    )
  );
