-- Allows support/admin to classify a historical payment that was deliberately
-- persisted as review because its product could not be mapped. Classification
-- never rewrites financial identity and never grants access by itself; the order
-- stays in review until a fresh verified provider observation resolves it.
CREATE OR REPLACE FUNCTION public.tv_admin_classify_review(
 p_actor uuid,p_order_id text,p_product_id text,p_reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 v_order tv_core.orders;
BEGIN
 IF NOT tv_core.valid_admin_actor(p_actor) THEN
   RAISE EXCEPTION 'admin required' USING ERRCODE='42501';
 END IF;
 IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 3 AND 500 THEN
   RAISE EXCEPTION 'reason required' USING ERRCODE='22023';
 END IF;
 IF p_product_id IS NULL OR NOT EXISTS(
   SELECT 1 FROM tv_core.products p WHERE p.id=p_product_id AND p.enabled
 ) THEN
   RAISE EXCEPTION 'invalid product' USING ERRCODE='22023';
 END IF;

 SELECT * INTO v_order
 FROM tv_core.orders
 WHERE id=p_order_id
 FOR UPDATE;
 IF NOT FOUND THEN
   RAISE EXCEPTION 'order not found' USING ERRCODE='22023';
 END IF;
 IF v_order.status<>'review' THEN
   RAISE EXCEPTION 'order is not review' USING ERRCODE='22023';
 END IF;
 IF v_order.product_id IS NOT NULL THEN
   RAISE EXCEPTION 'review is already classified' USING ERRCODE='22023';
 END IF;

 UPDATE tv_core.orders
 SET product_id=p_product_id
 WHERE id=v_order.id
 RETURNING * INTO v_order;

 INSERT INTO tv_core.audit_events(actor_id,action,detail)
 VALUES(
   p_actor,
   'review_classify',
   jsonb_build_object(
     'orderId',v_order.id,
     'provider',v_order.provider,
     'reference',v_order.reference,
     'productId',p_product_id,
     'productHint',v_order.product_hint,
     'reason',btrim(p_reason)
   )
 );

 RETURN jsonb_build_object(
   'orderId',v_order.id,
   'reference',v_order.reference,
   'provider',v_order.provider,
   'productId',v_order.product_id,
   'status',v_order.status
 );
END $$;

REVOKE ALL ON FUNCTION public.tv_admin_classify_review(uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tv_admin_classify_review(uuid,text,text,text) TO service_role;
