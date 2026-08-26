REVOKE ALL ON FUNCTION public.create_notification_user_states() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_notification_user_states() FROM anon;
REVOKE ALL ON FUNCTION public.create_notification_user_states() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_notification_user_states() TO service_role;