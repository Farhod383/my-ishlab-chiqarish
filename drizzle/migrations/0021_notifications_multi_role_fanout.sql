ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS recipient_roles text[];

CREATE OR REPLACE FUNCTION public.create_notification_user_states()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.notification_user_states (notification_id, user_id, is_read, read_at, created_at)
  SELECT DISTINCT
    NEW.id,
    p.id,
    false,
    NULL::timestamptz,
    NEW.created_at
  FROM public.profiles p
  WHERE
    public.has_role(p.id, 'admin'::public.app_role)
    OR public.has_role(p.id, 'manager'::public.app_role)
    OR (NEW.recipient_id IS NOT NULL AND p.id = NEW.recipient_id)
    OR (
      NEW.recipient_id IS NULL
      AND NEW.recipient_role IS NOT NULL
      AND public.has_role(p.id, NEW.recipient_role::public.app_role)
    )
    OR (
      NEW.recipient_id IS NULL
      AND NEW.recipient_roles IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = p.id AND ur.role::text = ANY (NEW.recipient_roles)
      )
    )
  ON CONFLICT (notification_id, user_id) DO NOTHING;

  RETURN NEW;
END;
$function$;

INSERT INTO public.notification_user_states (notification_id, user_id, is_read, read_at, created_at)
SELECT DISTINCT n.id, p.id, false, NULL::timestamptz, n.created_at
FROM public.notifications n
JOIN public.profiles p ON (
  public.has_role(p.id, 'admin'::public.app_role)
  OR public.has_role(p.id, 'manager'::public.app_role)
  OR (n.recipient_id IS NOT NULL AND p.id = n.recipient_id)
  OR (n.recipient_id IS NULL AND n.recipient_role IS NOT NULL
      AND public.has_role(p.id, n.recipient_role::public.app_role))
)
ON CONFLICT (notification_id, user_id) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_nus_user_unread ON public.notification_user_states (user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications (created_at DESC);