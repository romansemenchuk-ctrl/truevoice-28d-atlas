-- Admin payment operations. All functions are service-role only and validate the verified admin actor id.
CREATE OR REPLACE FUNCTION tv_core.valid_admin_actor(p_actor uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(
   SELECT 1
   FROM tv_core.member_roles r
   JOIN auth.users u ON u.id=r.user_id
   WHERE r.user_id=p_actor AND r.role='admin'
     AND u.email_confirmed_at IS NOT NULL
     AND u.deleted_at IS NULL
     AND (u.banned_until IS NULL OR u.banned_until<=now())
 );
$$;
REVOKE ALL ON FUNCTION tv_core.valid_admin_actor(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION tv_core.valid_admin_actor(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.tv_admin_registry(p_actor uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE out jsonb;
BEGIN
 IF NOT tv_core.valid_admin_actor(p_actor) THEN RAISE EXCEPTION 'admin required' USING ERRCODE='42501'; END IF;
 SELECT jsonb_build_object(
   'orders',coalesce(jsonb_agg(jsonb_build_object(
     'orderId',q.id,'provider',q.provider,'reference',q.reference,'buyerEmail',q.buyer_email,
     'productId',q.product_id,'productTitle',q.product_title,'productHint',q.product_hint,
     'amountMinor',q.amount_minor,'currency',q.currency,'status',q.status,
     'purchasedAt',q.purchased_at,'verifiedAt',q.verified_at,'lastReconciledAt',q.last_reconciled_at,
     'resourceKey',q.resource_key,'userId',q.user_id,'userEmail',q.user_email,'profileName',q.profile_name,
     'validFrom',q.valid_from,'validUntil',q.valid_until,'revokedAt',q.revoked_at,'test',q.provider='test'
   ) ORDER BY q.purchased_at DESC,q.reference),'[]'::jsonb)
 ) INTO out
 FROM (
   SELECT o.*,p.title product_title,e.resource_key,e.user_id,e.valid_from,e.valid_until,e.revoked_at,
          lower(u.email) user_email,pr.display_name profile_name
   FROM tv_core.orders o
   LEFT JOIN tv_core.products p ON p.id=o.product_id
   LEFT JOIN tv_core.entitlements e ON e.order_id=o.id
   LEFT JOIN auth.users u ON u.id=e.user_id
   LEFT JOIN tv_core.profiles pr ON pr.user_id=e.user_id
 ) q;
 RETURN coalesce(out,jsonb_build_object('orders','[]'::jsonb));
END $$;

CREATE OR REPLACE FUNCTION public.tv_admin_audit(p_actor uuid,p_action text,p_detail jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE row_id bigint;
BEGIN
 IF NOT tv_core.valid_admin_actor(p_actor) THEN RAISE EXCEPTION 'admin required' USING ERRCODE='42501'; END IF;
 IF p_action IS NULL OR length(p_action) NOT BETWEEN 1 AND 120 OR p_detail IS NULL OR jsonb_typeof(p_detail)<>'object'
 THEN RAISE EXCEPTION 'invalid audit event' USING ERRCODE='22023'; END IF;
 INSERT INTO tv_core.audit_events(actor_id,action,detail) VALUES(p_actor,p_action,p_detail) RETURNING id INTO row_id;
 RETURN jsonb_build_object('id',row_id);
END $$;

CREATE OR REPLACE FUNCTION public.tv_admin_transfer_entitlement(
 p_actor uuid,p_order_id text,p_resource_key text,p_target_user uuid,p_reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE old_user uuid; target_email text;
BEGIN
 IF NOT tv_core.valid_admin_actor(p_actor) THEN RAISE EXCEPTION 'admin required' USING ERRCODE='42501'; END IF;
 IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 3 AND 500 THEN RAISE EXCEPTION 'reason required' USING ERRCODE='22023'; END IF;
 SELECT lower(email) INTO target_email FROM auth.users
 WHERE id=p_target_user AND email_confirmed_at IS NOT NULL AND deleted_at IS NULL
   AND (banned_until IS NULL OR banned_until<=now());
 IF target_email IS NULL THEN RAISE EXCEPTION 'invalid target user' USING ERRCODE='22023'; END IF;
 SELECT user_id INTO old_user FROM tv_core.entitlements
 WHERE order_id=p_order_id AND resource_key=p_resource_key FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'entitlement not found' USING ERRCODE='22023'; END IF;
 UPDATE tv_core.entitlements SET user_id=p_target_user,claimed_at=now()
 WHERE order_id=p_order_id AND resource_key=p_resource_key;
 INSERT INTO tv_core.audit_events(actor_id,action,detail) VALUES(
   p_actor,'entitlement_transfer',jsonb_build_object(
     'orderId',p_order_id,'resourceKey',p_resource_key,'fromUserId',old_user,'toUserId',p_target_user,
     'targetEmail',target_email,'reason',btrim(p_reason)
   ));
 RETURN jsonb_build_object('orderId',p_order_id,'resourceKey',p_resource_key,'userId',p_target_user,'targetEmail',target_email);
END $$;

CREATE OR REPLACE FUNCTION public.tv_admin_set_revoked(
 p_actor uuid,p_order_id text,p_resource_key text,p_revoked boolean,p_reason text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE order_status text; new_revoked timestamptz;
BEGIN
 IF NOT tv_core.valid_admin_actor(p_actor) THEN RAISE EXCEPTION 'admin required' USING ERRCODE='42501'; END IF;
 IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 3 AND 500 THEN RAISE EXCEPTION 'reason required' USING ERRCODE='22023'; END IF;
 SELECT o.status INTO order_status FROM tv_core.orders o WHERE o.id=p_order_id;
 IF order_status IS NULL THEN RAISE EXCEPTION 'order not found' USING ERRCODE='22023'; END IF;
 IF p_revoked=false AND order_status IN ('refunded','chargeback') THEN RAISE EXCEPTION 'terminal order cannot restore' USING ERRCODE='22023'; END IF;
 UPDATE tv_core.entitlements
 SET revoked_at=CASE WHEN p_revoked THEN coalesce(revoked_at,now()) ELSE NULL END
 WHERE order_id=p_order_id AND resource_key=p_resource_key
 RETURNING revoked_at INTO new_revoked;
 IF NOT FOUND THEN RAISE EXCEPTION 'entitlement not found' USING ERRCODE='22023'; END IF;
 INSERT INTO tv_core.audit_events(actor_id,action,detail) VALUES(
   p_actor,CASE WHEN p_revoked THEN 'entitlement_revoke' ELSE 'entitlement_restore' END,
   jsonb_build_object('orderId',p_order_id,'resourceKey',p_resource_key,'reason',btrim(p_reason),'orderStatus',order_status)
 );
 RETURN jsonb_build_object('orderId',p_order_id,'resourceKey',p_resource_key,'revokedAt',new_revoked);
END $$;

CREATE OR REPLACE FUNCTION public.tv_mark_reconciled(p_provider text,p_reference text,p_observed_at timestamptz) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE order_id text;
BEGIN
 IF p_provider IS NULL OR p_reference IS NULL OR p_observed_at IS NULL THEN RAISE EXCEPTION 'invalid reconciliation mark' USING ERRCODE='22023'; END IF;
 UPDATE tv_core.orders SET last_reconciled_at=greatest(coalesce(last_reconciled_at,p_observed_at),p_observed_at)
 WHERE provider=p_provider AND reference=p_reference RETURNING id INTO order_id;
 IF order_id IS NULL THEN RAISE EXCEPTION 'order not found' USING ERRCODE='22023'; END IF;
 RETURN jsonb_build_object('orderId',order_id,'lastReconciledAt',p_observed_at);
END $$;

REVOKE ALL ON FUNCTION public.tv_admin_registry(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.tv_admin_audit(uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.tv_admin_transfer_entitlement(uuid,text,text,uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.tv_admin_set_revoked(uuid,text,text,boolean,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.tv_mark_reconciled(text,text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tv_admin_registry(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.tv_admin_audit(uuid,text,jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.tv_admin_transfer_entitlement(uuid,text,text,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.tv_admin_set_revoked(uuid,text,text,boolean,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.tv_mark_reconciled(text,text,timestamptz) TO service_role;
