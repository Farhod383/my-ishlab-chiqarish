
-- 1) Stock movements: unit price for cost reporting
ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS unit_price numeric NOT NULL DEFAULT 0;

-- 2) Products: keep last received price for cost calculation
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS last_price numeric NOT NULL DEFAULT 0;

-- Trigger: when an "in" movement is recorded with unit_price > 0, update product.last_price
CREATE OR REPLACE FUNCTION public.update_product_last_price()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.direction = 'in' AND NEW.product_id IS NOT NULL AND COALESCE(NEW.unit_price, 0) > 0 THEN
    UPDATE public.products SET last_price = NEW.unit_price WHERE id = NEW.product_id;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_update_last_price ON public.stock_movements;
CREATE TRIGGER trg_update_last_price
AFTER INSERT ON public.stock_movements
FOR EACH ROW EXECUTE FUNCTION public.update_product_last_price();

-- Make sure stock movement quantity update trigger exists (apply_stock_movement)
DROP TRIGGER IF EXISTS trg_apply_stock_movement ON public.stock_movements;
CREATE TRIGGER trg_apply_stock_movement
AFTER INSERT ON public.stock_movements
FOR EACH ROW EXECUTE FUNCTION public.apply_stock_movement();

-- 3) Stage OTK fields
ALTER TABLE public.order_stages
  ADD COLUMN IF NOT EXISTS otk_comment text,
  ADD COLUMN IF NOT EXISTS otk_checked_at timestamptz;

-- 4) Chat system
CREATE TABLE IF NOT EXISTS public.chat_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_global boolean NOT NULL DEFAULT false,
  title text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.chat_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL,
  sender_name text,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_conv ON public.chat_messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_participants_user ON public.chat_participants(user_id);

ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- helper: is user a participant
CREATE OR REPLACE FUNCTION public.is_chat_participant(_conv uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_participants WHERE conversation_id = _conv AND user_id = _user
  );
$$;

-- conversations
CREATE POLICY "conv_read" ON public.chat_conversations FOR SELECT TO authenticated
  USING (is_global = true OR public.is_chat_participant(id, auth.uid()) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "conv_insert" ON public.chat_conversations FOR INSERT TO authenticated
  WITH CHECK (true);

-- participants
CREATE POLICY "part_read" ON public.chat_participants FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_chat_participant(conversation_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "part_insert" ON public.chat_participants FOR INSERT TO authenticated
  WITH CHECK (true);
CREATE POLICY "part_delete_self" ON public.chat_participants FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- messages
CREATE POLICY "msg_read" ON public.chat_messages FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.is_chat_participant(conversation_id, auth.uid())
    OR EXISTS (SELECT 1 FROM public.chat_conversations c WHERE c.id = conversation_id AND c.is_global = true)
  );
CREATE POLICY "msg_insert" ON public.chat_messages FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid() AND (
      public.has_role(auth.uid(), 'admin')
      OR public.is_chat_participant(conversation_id, auth.uid())
      OR EXISTS (SELECT 1 FROM public.chat_conversations c WHERE c.id = conversation_id AND c.is_global = true)
    )
  );

-- realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_participants;
ALTER TABLE public.chat_messages REPLICA IDENTITY FULL;

-- ensure global chat exists
INSERT INTO public.chat_conversations (id, is_global, title)
SELECT gen_random_uuid(), true, 'Umumiy chat'
WHERE NOT EXISTS (SELECT 1 FROM public.chat_conversations WHERE is_global = true);

-- 5) Remove worker role assignments (we keep enum for safety)
DELETE FROM public.user_roles WHERE role = 'worker';
