
DROP POLICY IF EXISTS msg_insert ON public.chat_messages;
DROP POLICY IF EXISTS msg_insert_global_all ON public.chat_messages;

CREATE POLICY msg_insert ON public.chat_messages
FOR INSERT TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND (
    public.is_chat_participant(conversation_id, auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.chat_conversations c
      WHERE c.id = chat_messages.conversation_id AND c.is_global = true
    )
  )
);

INSERT INTO public.chat_conversations (is_global, title)
SELECT true, 'Global'
WHERE NOT EXISTS (SELECT 1 FROM public.chat_conversations WHERE is_global = true);
