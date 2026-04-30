-- 1. ORDERS: add comment field
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS comment text;

-- 2. PRODUCTS: add supplier phone
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS phone text;

-- 3. ORDER STAGES: add planned dates and handover comment
ALTER TABLE public.order_stages ADD COLUMN IF NOT EXISTS planned_start date;
ALTER TABLE public.order_stages ADD COLUMN IF NOT EXISTS planned_end date;
ALTER TABLE public.order_stages ADD COLUMN IF NOT EXISTS handover_comment text;
ALTER TABLE public.order_stages ADD COLUMN IF NOT EXISTS worker_name text;

-- 4. STOCK MOVEMENTS: add supplier phone snapshot, image url, reason for "other" outputs
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS reason text;

-- 5. CHAT MESSAGES: media support
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='chat_messages' AND column_name='media_url') THEN
    ALTER TABLE public.chat_messages ADD COLUMN media_url text;
    ALTER TABLE public.chat_messages ADD COLUMN media_type text; -- 'audio' | 'video' | null
    ALTER TABLE public.chat_messages ALTER COLUMN body DROP NOT NULL;
  END IF;
END $$;

-- 6. STORAGE: chat media bucket (public for simple playback)
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-media', 'chat-media', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for chat-media
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='chat_media_read') THEN
    CREATE POLICY "chat_media_read" ON storage.objects FOR SELECT USING (bucket_id = 'chat-media');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='chat_media_insert') THEN
    CREATE POLICY "chat_media_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'chat-media');
  END IF;
END $$;

-- Allow warehouse role to also INSERT 'in' movements (currently only supply/admin)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='stock_movements' AND policyname='mv_warehouse_in') THEN
    CREATE POLICY "mv_warehouse_in" ON public.stock_movements
      FOR INSERT TO authenticated
      WITH CHECK ((direction = 'in'::movement_direction) AND (has_role(auth.uid(), 'warehouse'::app_role) OR has_role(auth.uid(), 'admin'::app_role)));
  END IF;
END $$;