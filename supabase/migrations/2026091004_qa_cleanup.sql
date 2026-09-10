-- QA cleanup is deliberately isolated to provider='test'.
CREATE OR REPLACE FUNCTION public.tv_admin_cleanup_qa(p_actor uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE ids text[]; n_orders integer:=0; n_events integer:=0; n_entitlements integer:=0;
BEGIN
 IF NOT tv_core.valid_admin_actor(p_actor) THEN RAISE EXCEPTION 'admin required' USING ERRCODE='42501'; END IF;
 SELECT coalesce(array_agg(id),'{}'::text[]) INTO ids FROM tv_core.orders WHERE provider='test';
 IF coalesce(array_length(ids,1),0)>0 THEN
   DELETE FROM tv_core.payment_events WHERE order_id=ANY(ids); GET DIAGNOSTICS n_events=ROW_COUNT;
   DELETE FROM tv_core.entitlements WHERE order_id=ANY(ids); GET DIAGNOSTICS n_entitlements=ROW_COUNT;
   DELETE FROM tv_core.orders WHERE id=ANY(ids); GET DIAGNOSTICS n_orders=ROW_COUNT;
 END IF;
 INSERT INTO tv_core.audit_events(actor_id,action,detail)
 VALUES(p_actor,'qa_cleanup',jsonb_build_object('orders',n_orders,'events',n_events,'entitlements',n_entitlements));
 RETURN jsonb_build_object('orders',n_orders,'events',n_events,'entitlements',n_entitlements);
END $$;
REVOKE ALL ON FUNCTION public.tv_admin_cleanup_qa(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tv_admin_cleanup_qa(uuid) TO service_role;
