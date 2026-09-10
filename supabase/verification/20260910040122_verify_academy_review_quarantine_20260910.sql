-- HISTORICAL ONE-SHOT VERIFICATION SOURCE.
-- Applied to project aqskidnelqmowzfkjieg as migration version 20260910040122.
-- Do not replay as a normal schema migration. It creates one provider='test'
-- order, verifies review quarantine against stale approval, then removes it.
DO $$
DECLARE
  v_actor uuid := '88bb9cfc-8c3b-41f0-8203-8b5d91c47c95'::uuid;
  v_way_before bigint;
  v_auth_before bigint;
  v_cleanup jsonb;
BEGIN
  SELECT count(*) INTO v_way_before FROM tv_core.orders WHERE provider='wayforpay';
  SELECT count(*) INTO v_auth_before FROM auth.users WHERE lower(email) LIKE '%@example.test';
  IF EXISTS(SELECT 1 FROM tv_core.orders WHERE provider='test') THEN RAISE EXCEPTION 'test provider not clean before review verification'; END IF;

  PERFORM public.tv_register_order(
    'test','qa-review-quarantine-cloud','qa+review-quarantine@example.test','mini-base',NULL,
    1500,'USD','2026-09-01T00:00:00Z'::timestamptz,
    'qa-register:review-quarantine-cloud','hash-register-review-quarantine-cloud'
  );
  PERFORM public.tv_apply_payment_status(
    'test','qa-review-quarantine-cloud','approved','2026-09-01T00:01:00Z'::timestamptz,
    'qa-approved:review-quarantine-cloud','hash-approved-review-quarantine-cloud'
  );
  IF NOT EXISTS(
    SELECT 1 FROM tv_core.orders o JOIN tv_core.entitlements e ON e.order_id=o.id
    WHERE o.provider='test' AND o.reference='qa-review-quarantine-cloud'
      AND o.status='approved' AND e.revoked_at IS NULL
  ) THEN RAISE EXCEPTION 'approval did not create entitlement'; END IF;

  PERFORM public.tv_apply_payment_status(
    'test','qa-review-quarantine-cloud','review','2026-09-02T00:00:00Z'::timestamptz,
    'qa-review:review-quarantine-cloud','hash-review-review-quarantine-cloud'
  );
  IF NOT EXISTS(
    SELECT 1 FROM tv_core.orders
    WHERE provider='test' AND reference='qa-review-quarantine-cloud'
      AND status='review' AND status_observed_at='2026-09-02T00:00:00Z'::timestamptz
  ) THEN RAISE EXCEPTION 'newer review did not suspend approved order'; END IF;

  PERFORM public.tv_apply_payment_status(
    'test','qa-review-quarantine-cloud','approved','2026-09-01T00:01:00Z'::timestamptz,
    'qa-stale-approved:review-quarantine-cloud','hash-stale-approved-review-quarantine-cloud'
  );
  IF NOT EXISTS(
    SELECT 1 FROM tv_core.orders
    WHERE provider='test' AND reference='qa-review-quarantine-cloud'
      AND status='review' AND status_observed_at='2026-09-02T00:00:00Z'::timestamptz
  ) THEN RAISE EXCEPTION 'stale approved replay cleared review'; END IF;

  SELECT public.tv_admin_cleanup_qa(v_actor) INTO v_cleanup;
  IF (v_cleanup->>'orders')::int <> 1 OR (v_cleanup->>'entitlements')::int <> 1 OR (v_cleanup->>'events')::int <> 4
  THEN RAISE EXCEPTION 'review verification cleanup count wrong: %',v_cleanup; END IF;
  IF EXISTS(SELECT 1 FROM tv_core.orders WHERE provider='test') THEN RAISE EXCEPTION 'test order survived review verification cleanup'; END IF;
  IF (SELECT count(*) FROM tv_core.orders WHERE provider='wayforpay') <> v_way_before THEN RAISE EXCEPTION 'WayForPay rows changed during review verification'; END IF;
  IF (SELECT count(*) FROM auth.users WHERE lower(email) LIKE '%@example.test') <> v_auth_before THEN RAISE EXCEPTION 'Auth rows changed during review verification'; END IF;
END $$;
