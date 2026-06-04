
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NULL,
  sender_id uuid NULL,
  sender_name text NULL,
  type text NOT NULL,
  title text NOT NULL,
  body text NULL,
  link text NULL,
  entity text NULL,
  entity_id uuid NULL,
  read_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_recipient_idx ON public.notifications (recipient_id, read_at, created_at DESC);
CREATE INDEX notifications_broadcast_idx ON public.notifications (created_at DESC) WHERE recipient_id IS NULL;

GRANT SELECT, INSERT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;

CREATE POLICY notifications_select ON public.notifications FOR SELECT TO authenticated
  USING (recipient_id IS NULL OR recipient_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY notifications_insert ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY notifications_update_self ON public.notifications FOR UPDATE TO authenticated
  USING (recipient_id IS NULL OR recipient_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (recipient_id IS NULL OR recipient_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'order_stages'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.order_stages';
  END IF;
END $$;

ALTER TABLE public.order_stages REPLICA IDENTITY FULL;
