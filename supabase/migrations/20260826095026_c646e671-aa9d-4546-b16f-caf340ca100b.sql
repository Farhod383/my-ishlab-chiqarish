DROP POLICY IF EXISTS "notification_states_insert_own" ON public.notification_user_states;
REVOKE INSERT ON public.notification_user_states FROM authenticated;

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
    public.has_role(p.id, 'admin'::public.app_role)
    OR (NEW.recipient_id IS NOT NULL AND p.id = NEW.recipient_id)
    OR (
      NEW.recipient_id IS NULL
      AND NEW.recipient_role IS NOT NULL
      AND (
        public.has_role(p.id, NEW.recipient_role::public.app_role)
        OR public.has_role(p.id, 'manager'::public.app_role)
      )
    )
    OR (
      NEW.recipient_id IS NULL
      AND NEW.recipient_role IS NULL
      AND public.has_role(p.id, 'manager'::public.app_role)
    )
  ON CONFLICT (notification_id, user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.create_notification_user_states() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_notification_user_states() FROM anon;
REVOKE ALL ON FUNCTION public.create_notification_user_states() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_notification_user_states() TO service_role;

INSERT INTO public.notification_user_states (notification_id, user_id, is_read, read_at, created_at)
SELECT
  n.id,
  p.id,
  (n.read_at IS NOT NULL),
  n.read_at,
  n.created_at
FROM public.notifications n
CROSS JOIN public.profiles p
WHERE public.has_role(p.id, 'admin'::public.app_role)
ON CONFLICT (notification_id, user_id) DO NOTHING;