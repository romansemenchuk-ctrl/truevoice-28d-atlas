-- Additive Academy access/payment state. Apply only after academy_core_v1 + academy_context_and_resume_v1.
ALTER TABLE tv_core.product_resources
  ADD COLUMN access_mode text,
  ADD COLUMN access_days integer;

UPDATE tv_core.product_resources
SET access_mode=CASE WHEN product_id='atlas-28d' THEN 'lifetime' ELSE 'duration' END,
    access_days=CASE WHEN product_id='atlas-28d' THEN NULL ELSE 210 END;

ALTER TABLE tv_core.product_resources
  ALTER COLUMN access_mode SET NOT NULL,
  ADD CONSTRAINT product_resources_access_chk CHECK(
    (access_mode='duration' AND access_days>0) OR
    (access_mode='lifetime' AND access_days IS NULL));

ALTER TABLE tv_core.orders
  ALTER COLUMN product_id DROP NOT NULL,
  ADD COLUMN product_hint text,
  ADD COLUMN purchased_at timestamptz,
  ADD COLUMN status_observed_at timestamptz,
  ADD COLUMN last_reconciled_at timestamptz;

UPDATE tv_core.orders
SET purchased_at=created_at,
    status_observed_at=coalesce(verified_at,created_at)
WHERE purchased_at IS NULL;
ALTER TABLE tv_core.orders ALTER COLUMN purchased_at SET NOT NULL;

ALTER TABLE tv_core.payment_events
  ADD COLUMN status text,
  ADD COLUMN observed_at timestamptz,
  ADD COLUMN payload_hash text;

ALTER TABLE tv_core.audit_events
  ADD COLUMN detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD CONSTRAINT audit_detail_object_chk CHECK(jsonb_typeof(detail)='object');

CREATE OR REPLACE FUNCTION tv_core.can_access(resource text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT tv_core.is_admin() OR EXISTS(
   SELECT 1
   FROM tv_core.entitlements e
   JOIN tv_core.orders o ON o.id=e.order_id
   WHERE e.user_id=tv_core.member_id()
     AND e.resource_key=resource
     AND e.revoked_at IS NULL
     AND e.valid_from<=now()
     AND (e.valid_until IS NULL OR e.valid_until>now())
     AND o.status='approved'
     AND o.verified_at IS NOT NULL
 );
$$;
REVOKE ALL ON FUNCTION tv_core.can_access(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION tv_core.can_access(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.tv_register_order(
 p_provider text,p_reference text,p_buyer_email text,p_product_id text,p_product_hint text,
 p_amount_minor bigint,p_currency text,p_purchased_at timestamptz,p_event_key text,p_payload_hash text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 v_email text:=lower(btrim(coalesce(p_buyer_email,'')));
 v_currency text:=upper(btrim(coalesce(p_currency,'')));
 v_id text;
 v_order tv_core.orders;
 v_event tv_core.payment_events;
 v_created boolean:=false;
BEGIN
 IF p_provider IS NULL OR p_provider !~ '^[a-z0-9_-]{1,32}$'
    OR p_reference IS NULL OR length(p_reference) NOT BETWEEN 1 AND 180
    OR v_email='' OR v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    OR p_amount_minor IS NULL OR p_amount_minor<=0
    OR v_currency !~ '^[A-Z]{3}$'
    OR p_purchased_at IS NULL
    OR p_event_key IS NULL OR length(p_event_key) NOT BETWEEN 1 AND 180
    OR p_payload_hash IS NULL OR length(p_payload_hash) NOT BETWEEN 1 AND 180
 THEN RAISE EXCEPTION 'invalid order' USING ERRCODE='22023'; END IF;

 IF p_product_id IS NOT NULL AND NOT EXISTS(
   SELECT 1 FROM tv_core.products p WHERE p.id=p_product_id AND p.enabled
 ) THEN RAISE EXCEPTION 'invalid product' USING ERRCODE='22023'; END IF;

 SELECT * INTO v_order FROM tv_core.orders
 WHERE provider=p_provider AND reference=p_reference FOR UPDATE;

 IF FOUND THEN
   IF v_order.buyer_email IS DISTINCT FROM v_email
      OR v_order.product_id IS DISTINCT FROM p_product_id
      OR v_order.product_hint IS DISTINCT FROM p_product_hint
      OR v_order.amount_minor IS DISTINCT FROM p_amount_minor
      OR v_order.currency IS DISTINCT FROM v_currency
      OR v_order.purchased_at IS DISTINCT FROM p_purchased_at
   THEN RAISE EXCEPTION 'order identity mismatch' USING ERRCODE='22023'; END IF;
 ELSE
   v_id:=p_provider||':'||p_reference;
   INSERT INTO tv_core.orders(
     id,provider,reference,buyer_email,product_id,product_hint,amount_minor,currency,status,
     purchased_at,status_observed_at,created_at
   ) VALUES(
     v_id,p_provider,p_reference,v_email,p_product_id,p_product_hint,p_amount_minor,v_currency,'pending',
     p_purchased_at,p_purchased_at,now()
   ) RETURNING * INTO v_order;
   v_created:=true;
 END IF;

 SELECT * INTO v_event FROM tv_core.payment_events
 WHERE provider=p_provider AND event_key=p_event_key;
 IF FOUND THEN
   IF v_event.order_id IS DISTINCT FROM v_order.id OR v_event.payload_hash IS DISTINCT FROM p_payload_hash
   THEN RAISE EXCEPTION 'event identity mismatch' USING ERRCODE='22023'; END IF;
 ELSE
   INSERT INTO tv_core.payment_events(provider,event_key,order_id,verified,status,observed_at,payload_hash)
   VALUES(p_provider,p_event_key,v_order.id,false,'pending',p_purchased_at,p_payload_hash);
 END IF;

 RETURN jsonb_build_object('orderId',v_order.id,'reference',v_order.reference,'status',v_order.status,'created',v_created);
END $$;

CREATE OR REPLACE FUNCTION public.tv_apply_payment_status(
 p_provider text,p_reference text,p_status text,p_observed_at timestamptz,p_event_key text,p_payload_hash text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 v_order tv_core.orders;
 v_event tv_core.payment_events;
 v_changed boolean:=false;
 v_next text;
BEGIN
 IF p_provider IS NULL OR p_provider !~ '^[a-z0-9_-]{1,32}$'
    OR p_reference IS NULL OR length(p_reference) NOT BETWEEN 1 AND 180
    OR p_status NOT IN ('pending','approved','declined','refunded','chargeback','review')
    OR p_observed_at IS NULL
    OR p_event_key IS NULL OR length(p_event_key) NOT BETWEEN 1 AND 180
    OR p_payload_hash IS NULL OR length(p_payload_hash) NOT BETWEEN 1 AND 180
 THEN RAISE EXCEPTION 'invalid payment event' USING ERRCODE='22023'; END IF;

 SELECT * INTO v_order FROM tv_core.orders
 WHERE provider=p_provider AND reference=p_reference FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'unknown order' USING ERRCODE='22023'; END IF;

 SELECT * INTO v_event FROM tv_core.payment_events
 WHERE provider=p_provider AND event_key=p_event_key;
 IF FOUND THEN
   IF v_event.order_id IS DISTINCT FROM v_order.id
      OR v_event.payload_hash IS DISTINCT FROM p_payload_hash
      OR v_event.status IS DISTINCT FROM p_status
   THEN RAISE EXCEPTION 'event identity mismatch' USING ERRCODE='22023'; END IF;
   RETURN jsonb_build_object('orderId',v_order.id,'status',v_order.status,'changed',false,'duplicate',true);
 END IF;

 INSERT INTO tv_core.payment_events(provider,event_key,order_id,verified,status,observed_at,payload_hash)
 VALUES(p_provider,p_event_key,v_order.id,true,p_status,p_observed_at,p_payload_hash);

 v_next:=v_order.status;
 IF v_order.status IN ('refunded','chargeback') THEN
   v_next:=v_order.status;
 ELSIF p_status IN ('refunded','chargeback') THEN
   v_next:=p_status;
 ELSIF v_order.status='approved' THEN
   v_next:='approved';
 ELSIF p_status='approved' THEN
   v_next:='approved';
 ELSIF p_observed_at>=coalesce(v_order.status_observed_at,'-infinity'::timestamptz) THEN
   v_next:=p_status;
 END IF;

 IF v_next IS DISTINCT FROM v_order.status
    OR p_observed_at>coalesce(v_order.status_observed_at,'-infinity'::timestamptz)
    OR v_order.verified_at IS NULL
 THEN
   UPDATE tv_core.orders SET
     status=v_next,
     status_observed_at=greatest(coalesce(status_observed_at,p_observed_at),p_observed_at),
     verified_at=coalesce(verified_at,p_observed_at)
   WHERE id=v_order.id
   RETURNING * INTO v_order;
   v_changed:=true;
 END IF;

 IF v_order.status='approved' AND v_order.product_id IS NOT NULL THEN
   INSERT INTO tv_core.entitlements(order_id,resource_key,valid_from,valid_until)
   SELECT v_order.id,pr.resource_key,v_order.purchased_at,
          CASE WHEN pr.access_mode='lifetime' THEN NULL
               ELSE v_order.purchased_at + (pr.access_days * interval '1 day') END
   FROM tv_core.product_resources pr
   WHERE pr.product_id=v_order.product_id
   ON CONFLICT(order_id,resource_key) DO NOTHING;
 END IF;

 IF v_order.status IN ('refunded','chargeback') THEN
   UPDATE tv_core.entitlements
   SET revoked_at=coalesce(revoked_at,p_observed_at)
   WHERE order_id=v_order.id AND revoked_at IS NULL;
 END IF;

 RETURN jsonb_build_object('orderId',v_order.id,'status',v_order.status,'changed',v_changed,'duplicate',false);
END $$;

CREATE OR REPLACE FUNCTION public.tv_reconcile_candidates(p_limit integer DEFAULT 50) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE out jsonb;
BEGIN
 IF p_limit IS NULL OR p_limit<1 OR p_limit>100 THEN
   RAISE EXCEPTION 'invalid limit' USING ERRCODE='22023';
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
   'orderId',q.id,'reference',q.reference,'amountMinor',q.amount_minor,'currency',q.currency,
   'status',q.status,'lastReconciledAt',q.last_reconciled_at
 ) ORDER BY q.last_reconciled_at NULLS FIRST,q.created_at),'[]'::jsonb)
 INTO out
 FROM (
   SELECT * FROM tv_core.orders
   WHERE provider='wayforpay' AND status NOT IN ('refunded','chargeback')
   ORDER BY last_reconciled_at NULLS FIRST,created_at
   LIMIT p_limit
 ) q;
 RETURN out;
END $$;

REVOKE ALL ON FUNCTION public.tv_register_order(text,text,text,text,text,bigint,text,timestamptz,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.tv_apply_payment_status(text,text,text,timestamptz,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.tv_reconcile_candidates(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tv_register_order(text,text,text,text,text,bigint,text,timestamptz,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.tv_apply_payment_status(text,text,text,timestamptz,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.tv_reconcile_candidates(integer) TO service_role;
