CREATE TABLE public.notification_user_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (notification_id, user_id)
);

GRANT SELECT, INSERT, UPDATE ON public.notification_user_states TO authenticated;
GRANT ALL ON public.notification_user_states TO service_role;

ALTER TABLE public.notification_user_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_user_states REPLICA IDENTITY FULL;

CREATE POLICY "notification_states_select_own"
ON public.notification_user_states
FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "notification_states_insert_own"
ON public.notification_user_states
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "notification_states_update_own"
ON public.notification_user_states
FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE INDEX notification_user_states_user_unread_idx
ON public.notification_user_states (user_id, is_read, created_at DESC);

CREATE INDEX notification_user_states_notification_idx
ON public.notification_user_states (notification_id);

CREATE OR REPLACE FUNCTION public.create_notification_user_states()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notification_user_states (notification_id, user_id, is_read, read_at, created_at)
  SELECT DISTINCT
    NEW.id,
    p.id,
    false,
    NULL,
    NEW.created_at
  FROM public.profiles p
  WHERE
    (NEW.recipient_id IS NOT NULL AND p.id = NEW.recipient_id)
    OR (
      NEW.recipient_id IS NULL
      AND NEW.recipient_role IS NOT NULL
      AND (
        public.has_role(p.id, NEW.recipient_role::public.app_role)
        OR public.has_role(p.id, 'admin'::public.app_role)
        OR public.has_role(p.id, 'manager'::public.app_role)
      )
    )
    OR (
      NEW.recipient_id IS NULL
      AND NEW.recipient_role IS NULL
      AND (
        public.has_role(p.id, 'admin'::public.app_role)
        OR public.has_role(p.id, 'manager'::public.app_role)
      )
    )
  ON CONFLICT (notification_id, user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_create_notification_user_states
AFTER INSERT ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.create_notification_user_states();

INSERT INTO public.notification_user_states (notification_id, user_id, is_read, read_at, created_at)
SELECT DISTINCT
  n.id,
  p.id,
  (n.read_at IS NOT NULL),
  n.read_at,
  n.created_at
FROM public.notifications n
JOIN public.profiles p ON
  (n.recipient_id IS NOT NULL AND p.id = n.recipient_id)
  OR (
    n.recipient_id IS NULL
    AND n.recipient_role IS NOT NULL
    AND (
      public.has_role(p.id, n.recipient_role::public.app_role)
      OR public.has_role(p.id, 'admin'::public.app_role)
      OR public.has_role(p.id, 'manager'::public.app_role)
    )
  )
  OR (
    n.recipient_id IS NULL
    AND n.recipient_role IS NULL
    AND (
      public.has_role(p.id, 'admin'::public.app_role)
      OR public.has_role(p.id, 'manager'::public.app_role)
    )
  )
ON CONFLICT (notification_id, user_id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'notification_user_states'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notification_user_states;
  END IF;
END
$$;