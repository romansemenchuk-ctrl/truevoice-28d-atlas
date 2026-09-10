-- HISTORICAL ONE-SHOT VERIFICATION SOURCE.
-- Applied to project aqskidnelqmowzfkjieg as migration version 20260910042445.
-- Do not replay as a normal schema migration. It creates one provider='test'
-- order, verifies that a fresh re-observation of the same Approved provider fact
-- resolves a newer review quarantine, then removes all test-only payment rows.
DO $$
DECLARE
  v_actor uuid := '88bb9cfc-8c3b-41f0-8203-8b5d91c47c95'::uuid;
  v_way_before bigint;
  v_auth_before bigint;
  v_result jsonb;
  v_cleanup jsonb;
BEGIN
  SELECT count(*) INTO v_way_before FROM tv_core.orders WHERE provider='wayforpay';
  SELECT count(*) INTO v_auth_before FROM auth.users WHERE lower(email) LIKE '%@example.test';
  IF EXISTS(SELECT 1 FROM tv_core.orders WHERE provider='test') THEN RAISE EXCEPTION 'test provider not clean before reverification QA'; END IF;

  PERFORM public.tv_register_order(
    'test','qa-review-reverify-cloud','qa+review-reverify@example.test','mini-base',NULL,
    1500,'USD','2026-09-01T00:00:00Z'::timestamptz,
    'qa-register:review-reverify-cloud','hash-register-review-reverify-cloud'
  );
  PERFORM public.tv_apply_payment_status(
    'test','qa-review-reverify-cloud','approved','2026-09-01T00:01:00Z'::timestamptz,
    'qa-approved-provider-fact','same-approved-provider-hash'
  );
  PERFORM public.tv_apply_payment_status(
    'test','qa-review-reverify-cloud','review','2026-09-02T00:00:00Z'::timestamptz,
    'qa-review-provider-fact','review-provider-hash'
  );

  SELECT public.tv_apply_payment_status(
    'test','qa-review-reverify-cloud','approved','2026-09-03T00:00:00Z'::timestamptz,
    'qa-approved-provider-fact','same-approved-provider-hash'
  ) INTO v_result;

  IF coalesce((v_result->>'duplicate')::boolean,false) IS DISTINCT FROM true
     OR coalesce((v_result->>'changed')::boolean,false) IS DISTINCT FROM true
     OR v_result->>'status' <> 'approved'
  THEN RAISE EXCEPTION 'fresh duplicate Approved did not resolve review: %',v_result; END IF;

  IF NOT EXISTS(
    SELECT 1 FROM tv_core.orders o
    JOIN tv_core.entitlements e ON e.order_id=o.id
    WHERE o.provider='test' AND o.reference='qa-review-reverify-cloud'
      AND o.status='approved'
      AND o.status_observed_at='2026-09-03T00:00:00Z'::timestamptz
      AND e.resource_key='atlas'
      AND e.revoked_at IS NULL
  ) THEN RAISE EXCEPTION 'review re-verification did not restore approved entitlement'; END IF;

  SELECT public.tv_admin_cleanup_qa(v_actor) INTO v_cleanup;
  IF (v_cleanup->>'orders')::int <> 1
     OR (v_cleanup->>'events')::int <> 3
     OR (v_cleanup->>'entitlements')::int <> 1
  THEN RAISE EXCEPTION 'review re-verification cleanup count wrong: %',v_cleanup; END IF;

  IF EXISTS(SELECT 1 FROM tv_core.orders WHERE provider='test') THEN RAISE EXCEPTION 'test order survived re-verification cleanup'; END IF;
  IF EXISTS(SELECT 1 FROM tv_core.payment_events WHERE provider='test') THEN RAISE EXCEPTION 'test event survived re-verification cleanup'; END IF;
  IF EXISTS(SELECT 1 FROM tv_core.entitlements WHERE order_id LIKE 'test:%') THEN RAISE EXCEPTION 'test entitlement survived re-verification cleanup'; END IF;
  IF (SELECT count(*) FROM tv_core.orders WHERE provider='wayforpay') <> v_way_before THEN RAISE EXCEPTION 'WayForPay rows changed during re-verification QA'; END IF;
  IF (SELECT count(*) FROM auth.users WHERE lower(email) LIKE '%@example.test') <> v_auth_before THEN RAISE EXCEPTION 'Auth rows changed during re-verification QA'; END IF;
END $$;
