GRANT EXECUTE ON FUNCTION public.stock_balance_check() TO service_role;
GRANT EXECUTE ON FUNCTION public.log_scan(text,text,text,uuid,text,uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_scan(uuid,text,numeric,numeric) TO service_role;