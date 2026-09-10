-- Member account shell remains usable without active Atlas entitlement.
DROP POLICY IF EXISTS own_profile_read ON tv_core.profiles;
CREATE POLICY own_profile_read ON tv_core.profiles FOR SELECT TO authenticated
USING(user_id=tv_core.member_id());

CREATE OR REPLACE FUNCTION public.tv_account() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 uid uuid:=tv_core.member_id();
 address text;
 info jsonb;
 access_info jsonb;
 items jsonb;
 states jsonb;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'access denied' USING ERRCODE='42501'; END IF;
 SELECT lower(email) INTO address FROM auth.users WHERE id=uid;

 UPDATE tv_core.entitlements e
 SET user_id=uid,claimed_at=coalesce(e.claimed_at,now())
 FROM tv_core.orders o
 WHERE e.order_id=o.id
   AND e.user_id IS NULL
   AND o.buyer_email=address;

 INSERT INTO tv_core.profiles(user_id) VALUES(uid) ON CONFLICT DO NOTHING;

 SELECT jsonb_build_object(
   'id',uid,
   'email',address,
   'name',p.display_name,
   'lastLesson',p.last_lesson,
   'role',CASE WHEN tv_core.is_admin() THEN 'admin' ELSE 'student' END
 ) INTO info
 FROM tv_core.profiles p WHERE p.user_id=uid;

 access_info:=jsonb_build_object('atlas',tv_core.can_access('atlas'));

 SELECT coalesce(jsonb_agg(jsonb_build_object(
   'reference',o.reference,
   'productId',o.product_id,
   'title',coalesce(p.title,o.product_hint,'Платіж TrueVoice'),
   'status',o.status,
   'resourceKey',e.resource_key,
   'active',o.status='approved' AND o.verified_at IS NOT NULL AND e.order_id IS NOT NULL
      AND e.revoked_at IS NULL AND e.valid_from<=now() AND (e.valid_until IS NULL OR e.valid_until>now()),
   'expiresAt',e.valid_until,
   'lifetime',e.order_id IS NOT NULL AND e.valid_until IS NULL,
   'purchasedAt',o.purchased_at,
   'test',o.provider='test'
 ) ORDER BY o.purchased_at DESC,o.reference),'[]'::jsonb)
 INTO items
 FROM tv_core.orders o
 LEFT JOIN tv_core.products p ON p.id=o.product_id
 LEFT JOIN tv_core.entitlements e ON e.order_id=o.id
 WHERE o.buyer_email=address OR e.user_id=uid;

 SELECT coalesce(jsonb_agg(to_jsonb(s)-'user_id' ORDER BY s.lesson_key),'[]'::jsonb)
 INTO states FROM tv_core.lesson_state s WHERE s.user_id=uid;

 RETURN jsonb_build_object('user',info,'access',access_info,'purchases',items,'lessons',states);
END $$;

CREATE OR REPLACE FUNCTION public.tv_save_profile(p_name text,p_last_lesson text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid:=tv_core.member_id();
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'access denied' USING ERRCODE='42501'; END IF;
 IF p_name IS NULL OR length(p_name)>80 OR p_last_lesson IS NULL
    OR NOT EXISTS(SELECT 1 FROM tv_core.lesson_catalog WHERE key=p_last_lesson)
 THEN RAISE EXCEPTION 'invalid profile' USING ERRCODE='22023'; END IF;
 INSERT INTO tv_core.profiles(user_id,display_name,last_lesson)
 VALUES(uid,btrim(p_name),p_last_lesson)
 ON CONFLICT(user_id) DO UPDATE SET
   display_name=excluded.display_name,last_lesson=excluded.last_lesson,updated_at=now();
 RETURN jsonb_build_object('name',btrim(p_name),'lastLesson',p_last_lesson);
END $$;

REVOKE ALL ON FUNCTION public.tv_account(),public.tv_save_profile(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tv_account(),public.tv_save_profile(text,text) TO authenticated;
