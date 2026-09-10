-- HISTORICAL ONE-SHOT VERIFICATION SOURCE.
-- Applied to project aqskidnelqmowzfkjieg as migration version 20260910034713.
-- Do not replay as a normal schema migration. It seeds provider='test' rows,
-- asserts their lifecycle, and removes them again in the same migration.
DO $$
DECLARE
  v_actor uuid := '88bb9cfc-8c3b-41f0-8203-8b5d91c47c95'::uuid;
  v_way_before bigint;
  v_auth_before bigint;
  v_cleanup jsonb;
BEGIN
  SELECT count(*) INTO v_way_before FROM tv_core.orders WHERE provider='wayforpay';
  SELECT count(*) INTO v_auth_before FROM auth.users WHERE lower(email) LIKE '%@example.test';
  IF v_auth_before <> 0 THEN RAISE EXCEPTION 'synthetic auth users already exist'; END IF;
  IF EXISTS(SELECT 1 FROM tv_core.orders WHERE provider='test') THEN RAISE EXCEPTION 'test provider not clean before QA'; END IF;

  PERFORM public.tv_register_order('test','qa-active-mini-base','qa+active-base@example.test','mini-base',NULL,1500,'USD','2026-08-11T00:00:00Z'::timestamptz,'qa-register:qa-active-mini-base','b408b7c908de01e5fe91558332fa8cd72bcb192ceb6538189a41b35d1818e929');
  PERFORM public.tv_apply_payment_status('test','qa-active-mini-base','approved','2026-09-09T00:00:00Z'::timestamptz,'qa-status:qa-active-mini-base:approved','a1ce1af71c890f707f42711b09dac064243166ae84f92b55ff66a5c9ed025813');

  PERFORM public.tv_register_order('test','qa-active-mini-pro','qa+active-pro@example.test','mini-pro',NULL,2500,'USD','2026-07-12T00:00:00Z'::timestamptz,'qa-register:qa-active-mini-pro','da37e75f6141797e10bd6f68cb61e85aefc82e78cd68b3e3b7c037298bb388b9');
  PERFORM public.tv_apply_payment_status('test','qa-active-mini-pro','approved','2026-09-09T00:00:00Z'::timestamptz,'qa-status:qa-active-mini-pro:approved','36bcfb43c9b43682a8c3520b2a03ba5dbae01443c4f9c67af81f9d2f47c3ac38');

  PERFORM public.tv_register_order('test','qa-expired-mini-base','qa+expired@example.test','mini-base',NULL,1500,'USD','2026-02-11T00:00:00Z'::timestamptz,'qa-register:qa-expired-mini-base','920d934674f9345301cdef1f1ac9942781cb93113c553e68a15c44aa3dcfc10d');
  PERFORM public.tv_apply_payment_status('test','qa-expired-mini-base','approved','2026-09-09T00:00:00Z'::timestamptz,'qa-status:qa-expired-mini-base:approved','cb4da45f9f4bc706a002e3bc55fe2fc5713f294273119977f5020d5f5c9deb54');

  PERFORM public.tv_register_order('test','qa-lifetime-atlas','qa+lifetime@example.test','atlas-28d',NULL,3000,'USD','2026-08-31T00:00:00Z'::timestamptz,'qa-register:qa-lifetime-atlas','b1467ecabf165258caf1802268f9abdfa1abc828f15986de6fc2c234b9b0b05c');
  PERFORM public.tv_apply_payment_status('test','qa-lifetime-atlas','approved','2026-09-09T00:00:00Z'::timestamptz,'qa-status:qa-lifetime-atlas:approved','5738d8c0b1eb4093cbfe9862fd3c1b486c9d5e8e589a9ba4f589e17cea54b88c');

  PERFORM public.tv_register_order('test','qa-refunded','qa+refunded@example.test','mini-base',NULL,1500,'USD','2026-08-21T00:00:00Z'::timestamptz,'qa-register:qa-refunded','2515c6d7936dd59d17de4c9617f3b03041e46c2c690856645a310a8c288693cf');
  PERFORM public.tv_apply_payment_status('test','qa-refunded','approved','2026-08-21T00:01:00Z'::timestamptz,'qa-approved:qa-refunded','584c49401f244a8ca6ee22349a0e84a0c3531c9af681deac2bf123804aa6784b');
  PERFORM public.tv_apply_payment_status('test','qa-refunded','refunded','2026-09-09T00:00:00Z'::timestamptz,'qa-status:qa-refunded:refunded','2031866919bf5245f2d62e10794f0edef2e3dd97ef0119a45baa5392781e814a');

  PERFORM public.tv_register_order('test','qa-chargeback','qa+chargeback@example.test','mini-pro',NULL,2500,'USD','2026-08-21T00:00:00Z'::timestamptz,'qa-register:qa-chargeback','f660f6898a58fbfddcd94ebf291c8dafea277306a84045212b98bbf5eaea392a');
  PERFORM public.tv_apply_payment_status('test','qa-chargeback','approved','2026-08-21T00:01:00Z'::timestamptz,'qa-approved:qa-chargeback','7ab9f0641a109c1ddcad3ef76621b6989b85655d927b4934aa07be6bf6f4dfbc');
  PERFORM public.tv_apply_payment_status('test','qa-chargeback','chargeback','2026-09-09T00:00:00Z'::timestamptz,'qa-status:qa-chargeback:chargeback','d9341c5b929c24db4f44c9f5b34d07e6b9be3f3dd5ca3ec5b74b5cf89b5100d9');

  PERFORM public.tv_register_order('test','qa-review','qa+review@example.test',NULL::text,'Synthetic QA review',1900,'USD','2026-09-05T00:00:00Z'::timestamptz,'qa-register:qa-review','fec9d3a91bfa05baaebfcef54f0ccac41f55d597ddd60487cd361da5cae562a4');
  PERFORM public.tv_apply_payment_status('test','qa-review','review','2026-09-09T00:00:00Z'::timestamptz,'qa-status:qa-review:review','31225202187a09eda4cc1236f5fe18ba515cbcd5a5270d4d06c9d013461eda2b');

  PERFORM public.tv_admin_audit(v_actor,'qa_seed',jsonb_build_object('count',7,'verification','cloud_migration'));

  IF (SELECT count(*) FROM tv_core.orders WHERE provider='test') <> 7 THEN RAISE EXCEPTION 'expected seven QA orders'; END IF;
  IF (SELECT count(*) FROM auth.users WHERE lower(email) LIKE '%@example.test') <> 0 THEN RAISE EXCEPTION 'QA created auth users'; END IF;
  IF (SELECT count(*) FROM tv_core.entitlements e JOIN tv_core.orders o ON o.id=e.order_id WHERE o.provider='test') <> 6 THEN RAISE EXCEPTION 'expected six QA entitlements'; END IF;

  IF NOT EXISTS(SELECT 1 FROM tv_core.orders WHERE provider='test' AND reference='qa-active-mini-base' AND status='approved') THEN RAISE EXCEPTION 'active base state wrong'; END IF;
  IF NOT EXISTS(SELECT 1 FROM tv_core.orders WHERE provider='test' AND reference='qa-active-mini-pro' AND status='approved') THEN RAISE EXCEPTION 'active pro state wrong'; END IF;
  IF NOT EXISTS(SELECT 1 FROM tv_core.entitlements e JOIN tv_core.orders o ON o.id=e.order_id WHERE o.reference='qa-expired-mini-base' AND e.valid_until <= now() AND e.revoked_at IS NULL) THEN RAISE EXCEPTION 'expired Mini state wrong'; END IF;
  IF NOT EXISTS(SELECT 1 FROM tv_core.entitlements e JOIN tv_core.orders o ON o.id=e.order_id WHERE o.reference='qa-lifetime-atlas' AND e.valid_until IS NULL AND e.revoked_at IS NULL) THEN RAISE EXCEPTION 'lifetime Atlas state wrong'; END IF;
  IF NOT EXISTS(SELECT 1 FROM tv_core.entitlements e JOIN tv_core.orders o ON o.id=e.order_id WHERE o.reference='qa-refunded' AND o.status='refunded' AND e.revoked_at IS NOT NULL) THEN RAISE EXCEPTION 'refund state wrong'; END IF;
  IF NOT EXISTS(SELECT 1 FROM tv_core.entitlements e JOIN tv_core.orders o ON o.id=e.order_id WHERE o.reference='qa-chargeback' AND o.status='chargeback' AND e.revoked_at IS NOT NULL) THEN RAISE EXCEPTION 'chargeback state wrong'; END IF;
  IF NOT EXISTS(SELECT 1 FROM tv_core.orders o WHERE o.reference='qa-review' AND o.status='review' AND o.product_id IS NULL) OR EXISTS(SELECT 1 FROM tv_core.entitlements e JOIN tv_core.orders o ON o.id=e.order_id WHERE o.reference='qa-review') THEN RAISE EXCEPTION 'review state wrong'; END IF;

  SELECT public.tv_admin_cleanup_qa(v_actor) INTO v_cleanup;
  IF (v_cleanup->>'orders')::int <> 7 OR (v_cleanup->>'entitlements')::int <> 6 THEN RAISE EXCEPTION 'QA cleanup count wrong: %',v_cleanup; END IF;
  IF EXISTS(SELECT 1 FROM tv_core.orders WHERE provider='test') THEN RAISE EXCEPTION 'test orders survived cleanup'; END IF;
  IF EXISTS(SELECT 1 FROM tv_core.payment_events WHERE provider='test') THEN RAISE EXCEPTION 'test events survived cleanup'; END IF;
  IF EXISTS(SELECT 1 FROM tv_core.entitlements WHERE order_id LIKE 'test:%') THEN RAISE EXCEPTION 'test entitlements survived cleanup'; END IF;
  IF (SELECT count(*) FROM tv_core.orders WHERE provider='wayforpay') <> v_way_before THEN RAISE EXCEPTION 'WayForPay rows changed during QA'; END IF;
  IF (SELECT count(*) FROM auth.users WHERE lower(email) LIKE '%@example.test') <> v_auth_before THEN RAISE EXCEPTION 'Auth rows changed during QA'; END IF;
END $$;
