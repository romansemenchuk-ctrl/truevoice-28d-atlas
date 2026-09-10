-- Re-observing the exact same verified Approved provider fact is idempotent at
-- the payment-event level, but it may legitimately resolve a newer review
-- quarantine when the re-verification itself happened later.
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

   IF v_order.status='review'
      AND p_status='approved'
      AND p_observed_at>coalesce(v_order.status_observed_at,'-infinity'::timestamptz)
   THEN
     UPDATE tv_core.orders SET
       status='approved',
       status_observed_at=p_observed_at,
       verified_at=coalesce(verified_at,p_observed_at)
     WHERE id=v_order.id
     RETURNING * INTO v_order;

     IF v_order.product_id IS NOT NULL THEN
       INSERT INTO tv_core.entitlements(order_id,resource_key,valid_from,valid_until)
       SELECT v_order.id,pr.resource_key,v_order.purchased_at,
              CASE WHEN pr.access_mode='lifetime' THEN NULL
                   ELSE v_order.purchased_at + (pr.access_days * interval '1 day') END
       FROM tv_core.product_resources pr
       WHERE pr.product_id=v_order.product_id
       ON CONFLICT(order_id,resource_key) DO NOTHING;
     END IF;

     RETURN jsonb_build_object('orderId',v_order.id,'status',v_order.status,'changed',true,'duplicate',true);
   END IF;

   RETURN jsonb_build_object('orderId',v_order.id,'status',v_order.status,'changed',false,'duplicate',true);
 END IF;

 INSERT INTO tv_core.payment_events(provider,event_key,order_id,verified,status,observed_at,payload_hash)
 VALUES(p_provider,p_event_key,v_order.id,true,p_status,p_observed_at,p_payload_hash);

 v_next:=v_order.status;
 IF v_order.status IN ('refunded','chargeback') THEN
   v_next:=v_order.status;
 ELSIF p_status IN ('refunded','chargeback') THEN
   v_next:=p_status;
 ELSIF v_order.status='review' THEN
   IF p_status='approved'
      AND p_observed_at>coalesce(v_order.status_observed_at,'-infinity'::timestamptz) THEN
     v_next:='approved';
   ELSE
     v_next:='review';
   END IF;
 ELSIF p_status='review'
       AND p_observed_at>=coalesce(v_order.status_observed_at,'-infinity'::timestamptz) THEN
   v_next:='review';
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

REVOKE ALL ON FUNCTION public.tv_apply_payment_status(text,text,text,timestamptz,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tv_apply_payment_status(text,text,text,timestamptz,text,text) TO service_role;
