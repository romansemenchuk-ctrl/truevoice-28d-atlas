-- Historical one-shot cloud verification applied as
-- verify_academy_admin_classify_review_20260910.
-- Do not replay as a normal schema migration. It creates only provider='test'
-- rows, asserts the admin classification boundary, and deletes its exact QA data
-- before commit. Any failed assertion rolls back the entire migration.
DO $$
DECLARE
 v_actor uuid;
 v_order_id text;
 v_before record;
 v_after record;
 v_result jsonb;
 v_denied boolean := false;
 v_reclass_denied boolean := false;
 v_way_before bigint;
 v_way_after bigint;
BEGIN
 SELECT id INTO v_actor
 FROM auth.users
 WHERE lower(email)=lower('ceo@truevoice.academy')
   AND email_confirmed_at IS NOT NULL
 LIMIT 1;
 IF v_actor IS NULL THEN
   RAISE EXCEPTION 'confirmed ceo admin identity missing';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM tv_core.member_roles WHERE user_id=v_actor AND role='admin') THEN
   RAISE EXCEPTION 'ceo admin role missing';
 END IF;

 SELECT count(*) INTO v_way_before FROM tv_core.orders WHERE provider='wayforpay';

 DELETE FROM tv_core.audit_events
 WHERE action='review_classify' AND detail->>'reference'='qa-classify-20260910';
 DELETE FROM tv_core.payment_events
 WHERE order_id IN (SELECT id FROM tv_core.orders WHERE provider='test' AND reference='qa-classify-20260910');
 DELETE FROM tv_core.entitlements
 WHERE order_id IN (SELECT id FROM tv_core.orders WHERE provider='test' AND reference='qa-classify-20260910');
 DELETE FROM tv_core.orders WHERE provider='test' AND reference='qa-classify-20260910';

 PERFORM public.tv_register_order(
   'test','qa-classify-20260910','qa.classify@truevoice.test',NULL,'Legacy QA offer',1900::bigint,'USD',
   '2026-06-01T00:00:00Z'::timestamptz,'qa-register-classify-20260910',repeat('a',64)
 );
 SELECT id INTO v_order_id FROM tv_core.orders WHERE provider='test' AND reference='qa-classify-20260910';
 IF v_order_id IS NULL THEN RAISE EXCEPTION 'qa order not registered'; END IF;

 PERFORM public.tv_apply_payment_status(
   'test','qa-classify-20260910','review','2026-09-10T04:30:00Z'::timestamptz,
   'qa-review-classify-20260910',repeat('b',64)
 );

 SELECT buyer_email,amount_minor,currency,purchased_at,status,product_id
 INTO v_before FROM tv_core.orders WHERE id=v_order_id;
 IF v_before.status<>'review' OR v_before.product_id IS NOT NULL THEN
   RAISE EXCEPTION 'qa review precondition failed';
 END IF;

 BEGIN
   PERFORM public.tv_admin_classify_review(
     '00000000-0000-0000-0000-000000000000'::uuid,
     v_order_id,'mini-base','unauthorized classification attempt'
   );
 EXCEPTION WHEN insufficient_privilege THEN
   v_denied := true;
 END;
 IF NOT v_denied THEN RAISE EXCEPTION 'non-admin classification was not denied'; END IF;

 SELECT public.tv_admin_classify_review(
   v_actor,v_order_id,'mini-base','cloud QA mapped legacy offer'
 ) INTO v_result;
 IF v_result->>'productId' <> 'mini-base' OR v_result->>'status' <> 'review' THEN
   RAISE EXCEPTION 'classification result mismatch: %',v_result;
 END IF;

 SELECT buyer_email,amount_minor,currency,purchased_at,status,product_id
 INTO v_after FROM tv_core.orders WHERE id=v_order_id;
 IF v_after.buyer_email IS DISTINCT FROM v_before.buyer_email
    OR v_after.amount_minor IS DISTINCT FROM v_before.amount_minor
    OR v_after.currency IS DISTINCT FROM v_before.currency
    OR v_after.purchased_at IS DISTINCT FROM v_before.purchased_at THEN
   RAISE EXCEPTION 'financial identity changed during classification';
 END IF;
 IF v_after.status<>'review' OR v_after.product_id<>'mini-base' THEN
   RAISE EXCEPTION 'classification state mismatch';
 END IF;
 IF EXISTS (SELECT 1 FROM tv_core.entitlements WHERE order_id=v_order_id) THEN
   RAISE EXCEPTION 'classification granted entitlement unexpectedly';
 END IF;
 IF (SELECT count(*) FROM tv_core.audit_events WHERE action='review_classify' AND actor_id=v_actor AND detail->>'reference'='qa-classify-20260910') <> 1 THEN
   RAISE EXCEPTION 'classification audit event missing or duplicated';
 END IF;
 IF has_function_privilege('authenticated','public.tv_admin_classify_review(uuid,text,text,text)','execute')
    OR has_function_privilege('anon','public.tv_admin_classify_review(uuid,text,text,text)','execute') THEN
   RAISE EXCEPTION 'classification RPC exposed to browser roles';
 END IF;
 IF NOT has_function_privilege('service_role','public.tv_admin_classify_review(uuid,text,text,text)','execute') THEN
   RAISE EXCEPTION 'service role cannot execute classification RPC';
 END IF;

 BEGIN
   PERFORM public.tv_admin_classify_review(v_actor,v_order_id,'mini-pro','attempt reclassification');
 EXCEPTION WHEN invalid_parameter_value THEN
   v_reclass_denied := true;
 END;
 IF NOT v_reclass_denied THEN RAISE EXCEPTION 'reclassification was not denied'; END IF;

 DELETE FROM tv_core.audit_events
 WHERE action='review_classify' AND actor_id=v_actor AND detail->>'reference'='qa-classify-20260910';
 DELETE FROM tv_core.payment_events WHERE order_id=v_order_id;
 DELETE FROM tv_core.entitlements WHERE order_id=v_order_id;
 DELETE FROM tv_core.orders WHERE id=v_order_id;

 IF EXISTS (SELECT 1 FROM tv_core.orders WHERE provider='test' AND reference='qa-classify-20260910') THEN
   RAISE EXCEPTION 'qa order cleanup failed';
 END IF;
 SELECT count(*) INTO v_way_after FROM tv_core.orders WHERE provider='wayforpay';
 IF v_way_after IS DISTINCT FROM v_way_before THEN
   RAISE EXCEPTION 'wayforpay rows changed during QA';
 END IF;
END $$;
