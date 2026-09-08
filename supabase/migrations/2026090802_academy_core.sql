-- Shared Academy core; no customers or administrators seeded. Applied as academy_core_v1.
CREATE SCHEMA tv_core;
REVOKE ALL ON SCHEMA tv_core FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA tv_core TO authenticated, service_role;
CREATE TABLE tv_core.products (id text PRIMARY KEY CHECK(id ~ '^[a-z0-9-]{1,80}$'),title text NOT NULL,enabled boolean NOT NULL DEFAULT true);
CREATE TABLE tv_core.resources (key text PRIMARY KEY,title text NOT NULL);
CREATE TABLE tv_core.product_resources (product_id text REFERENCES tv_core.products ON DELETE CASCADE,resource_key text REFERENCES tv_core.resources,PRIMARY KEY(product_id,resource_key));
CREATE TABLE tv_core.orders (
 id text PRIMARY KEY,provider text NOT NULL,reference text NOT NULL,buyer_email text NOT NULL CHECK(buyer_email=lower(btrim(buyer_email))),
 product_id text NOT NULL REFERENCES tv_core.products,amount_minor bigint NOT NULL CHECK(amount_minor>0),currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','declined','refunded','chargeback','review')),verified_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(provider,reference));
CREATE INDEX tv_orders_email ON tv_core.orders(buyer_email);
CREATE TABLE tv_core.entitlements (
 order_id text NOT NULL REFERENCES tv_core.orders,resource_key text NOT NULL REFERENCES tv_core.resources,user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
 valid_from timestamptz NOT NULL DEFAULT now(),valid_until timestamptz,revoked_at timestamptz,claimed_at timestamptz,PRIMARY KEY(order_id,resource_key),CHECK(valid_until IS NULL OR valid_until>valid_from));
CREATE INDEX tv_entitlements_user ON tv_core.entitlements(user_id);
CREATE TABLE tv_core.member_roles (user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,role text NOT NULL CHECK(role='admin'),created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE tv_core.profiles (user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,display_name text NOT NULL DEFAULT '' CHECK(length(display_name)<=80),last_lesson text NOT NULL DEFAULT '1-1' CHECK(last_lesson ~ '^[1-4]-[1-7]$'),updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE tv_core.lesson_catalog (key text PRIMARY KEY CHECK(key ~ '^[1-4]-[1-7]$'),step_count integer NOT NULL CHECK(step_count BETWEEN 1 AND 20));
CREATE TABLE tv_core.lesson_state (user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,lesson_key text REFERENCES tv_core.lesson_catalog,version integer NOT NULL DEFAULT 0 CHECK(version>=0),completed boolean NOT NULL DEFAULT false,steps jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(steps)='array'),notes text NOT NULL DEFAULT '' CHECK(length(notes)<=30000),bookmarked boolean NOT NULL DEFAULT false,updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_id,lesson_key));
CREATE TABLE tv_core.payment_events (provider text NOT NULL,event_key text NOT NULL,order_id text REFERENCES tv_core.orders,verified boolean NOT NULL DEFAULT false,received_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(provider,event_key));
CREATE TABLE tv_core.audit_events (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,action text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
INSERT INTO tv_core.products VALUES ('mini-base','TrueVoice 7D',true),('mini-pro','TrueVoice 7D max',true),('mini-upgrade','TrueVoice 7D max — доплата',true),('atlas-28d','TrueVoice Atlas 28D',true);
INSERT INTO tv_core.resources VALUES ('atlas','TrueVoice Atlas 28D');
-- Eligibility is not a purchase. A bare upgrade does not grant access.
INSERT INTO tv_core.product_resources VALUES ('mini-base','atlas'),('mini-pro','atlas'),('atlas-28d','atlas');
INSERT INTO tv_core.lesson_catalog VALUES ('1-1',3),('1-2',3),('1-3',2),('1-4',3),('1-5',3),('1-6',2),('1-7',2),('2-1',3),('2-2',2),('2-3',3),('2-4',2),('2-5',2),('2-6',3),('2-7',2),('3-1',2),('3-2',2),('3-3',2),('3-4',2),('3-5',3),('3-6',2),('3-7',2),('4-1',1),('4-2',1),('4-3',1),('4-4',1),('4-5',1),('4-6',2),('4-7',1);
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['products','resources','product_resources','orders','entitlements','member_roles','profiles','lesson_catalog','lesson_state','payment_events','audit_events'] LOOP EXECUTE format('ALTER TABLE tv_core.%I ENABLE ROW LEVEL SECURITY',t); EXECUTE format('REVOKE ALL ON tv_core.%I FROM PUBLIC, anon, authenticated',t); END LOOP; END $$;
GRANT ALL ON ALL TABLES IN SCHEMA tv_core TO service_role;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA tv_core TO service_role;
CREATE FUNCTION tv_core.member_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT u.id FROM auth.users u JOIN auth.sessions s ON s.user_id=u.id WHERE u.id=auth.uid() AND s.id::text=auth.jwt()->>'session_id' AND u.email_confirmed_at IS NOT NULL AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until<=now()) AND (s.not_after IS NULL OR s.not_after>now()) AND s.created_at>now()-interval '12 hours' LIMIT 1;
$$;
CREATE FUNCTION tv_core.is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT EXISTS(SELECT 1 FROM tv_core.member_roles WHERE user_id=tv_core.member_id() AND role='admin'); $$;
CREATE FUNCTION tv_core.can_access(resource text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT tv_core.is_admin() OR EXISTS(SELECT 1 FROM tv_core.entitlements e JOIN tv_core.orders o ON o.id=e.order_id JOIN tv_core.products p ON p.id=o.product_id JOIN tv_core.product_resources pr ON pr.product_id=p.id AND pr.resource_key=e.resource_key WHERE e.user_id=tv_core.member_id() AND e.resource_key=resource AND e.revoked_at IS NULL AND e.valid_from<=now() AND (e.valid_until IS NULL OR e.valid_until>now()) AND o.status='approved' AND o.verified_at IS NOT NULL AND p.enabled);
$$;
REVOKE ALL ON FUNCTION tv_core.member_id(),tv_core.is_admin(),tv_core.can_access(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION tv_core.member_id(),tv_core.is_admin(),tv_core.can_access(text) TO authenticated;
GRANT SELECT ON tv_core.lesson_state,tv_core.profiles TO authenticated;
CREATE POLICY own_lesson_read ON tv_core.lesson_state FOR SELECT TO authenticated USING(user_id=tv_core.member_id() AND tv_core.can_access('atlas'));
CREATE POLICY own_profile_read ON tv_core.profiles FOR SELECT TO authenticated USING(user_id=tv_core.member_id() AND tv_core.can_access('atlas'));
CREATE FUNCTION public.tv_account() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid:=tv_core.member_id(); address text; info jsonb; items jsonb; states jsonb;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'access denied' USING ERRCODE='42501'; END IF;
 SELECT lower(email) INTO address FROM auth.users WHERE id=uid;
 UPDATE tv_core.entitlements e SET user_id=uid,claimed_at=now() FROM tv_core.orders o WHERE e.order_id=o.id AND e.user_id IS NULL AND e.claimed_at IS NULL AND o.buyer_email=address AND o.status='approved' AND o.verified_at IS NOT NULL AND e.revoked_at IS NULL;
 IF NOT tv_core.can_access('atlas') THEN RAISE EXCEPTION 'access denied' USING ERRCODE='42501'; END IF;
 INSERT INTO tv_core.profiles(user_id) VALUES(uid) ON CONFLICT DO NOTHING;
 SELECT jsonb_build_object('id',uid,'email',address,'name',p.display_name,'lastLesson',p.last_lesson,'role',CASE WHEN tv_core.is_admin() THEN 'admin' ELSE 'student' END) INTO info FROM tv_core.profiles p WHERE user_id=uid;
 SELECT coalesce(jsonb_agg(jsonb_build_object('reference',o.reference,'title',p.title,'status',o.status,'active',o.status='approved' AND o.verified_at IS NOT NULL AND e.revoked_at IS NULL AND p.enabled AND e.valid_from<=now() AND (e.valid_until IS NULL OR e.valid_until>now()),'expiresAt',e.valid_until) ORDER BY o.created_at DESC),'[]') INTO items FROM tv_core.orders o JOIN tv_core.products p ON p.id=o.product_id JOIN tv_core.entitlements e ON e.order_id=o.id WHERE e.user_id=uid AND e.resource_key='atlas';
 SELECT coalesce(jsonb_agg(to_jsonb(s)-'user_id'),'[]') INTO states FROM tv_core.lesson_state s WHERE s.user_id=uid;
 RETURN jsonb_build_object('user',info,'purchases',items,'lessons',states);
END $$;
CREATE FUNCTION public.tv_save_profile(p_name text,p_last_lesson text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid:=tv_core.member_id();
BEGIN
 IF uid IS NULL OR NOT tv_core.can_access('atlas') THEN RAISE EXCEPTION 'access denied' USING ERRCODE='42501'; END IF;
 IF p_name IS NULL OR length(p_name)>80 OR p_last_lesson IS NULL OR NOT EXISTS(SELECT 1 FROM tv_core.lesson_catalog WHERE key=p_last_lesson) THEN RAISE EXCEPTION 'invalid profile' USING ERRCODE='22023'; END IF;
 INSERT INTO tv_core.profiles(user_id,display_name,last_lesson) VALUES(uid,btrim(p_name),p_last_lesson) ON CONFLICT(user_id) DO UPDATE SET display_name=excluded.display_name,last_lesson=excluded.last_lesson,updated_at=now();
 RETURN jsonb_build_object('name',btrim(p_name),'lastLesson',p_last_lesson);
END $$;
CREATE FUNCTION public.tv_save_lesson(p_lesson text,p_version integer,p_data jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid:=tv_core.member_id(); n integer; s jsonb; st tv_core.lesson_state;
BEGIN
 IF uid IS NULL OR NOT tv_core.can_access('atlas') THEN RAISE EXCEPTION 'access denied' USING ERRCODE='42501'; END IF;
 SELECT step_count INTO n FROM tv_core.lesson_catalog WHERE key=p_lesson;
 s:=coalesce(p_data->'steps','[]');
 IF n IS NULL OR p_version IS NULL OR p_version<0 OR p_data IS NULL OR jsonb_typeof(p_data)<>'object' OR jsonb_typeof(s)<>'array' OR length(coalesce(p_data->>'notes',''))>30000 OR (p_data ? 'notes' AND jsonb_typeof(p_data->'notes')<>'string') OR (p_data ? 'completed' AND jsonb_typeof(p_data->'completed')<>'boolean') OR (p_data ? 'bookmarked' AND jsonb_typeof(p_data->'bookmarked')<>'boolean') THEN RAISE EXCEPTION 'invalid lesson state' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(s) x WHERE jsonb_typeof(x)<>'number' OR x::text !~ '^[0-9]+$') THEN RAISE EXCEPTION 'invalid lesson state' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(s) x WHERE x::text::numeric>=n) OR jsonb_array_length(s)>n THEN RAISE EXCEPTION 'invalid lesson state' USING ERRCODE='22023'; END IF;
 SELECT coalesce(jsonb_agg(v ORDER BY v),'[]') INTO s FROM (SELECT DISTINCT value::text::integer v FROM jsonb_array_elements(s)) q;
 IF coalesce((p_data->>'completed')::boolean,false) AND jsonb_array_length(s)<>n THEN RAISE EXCEPTION 'invalid lesson state' USING ERRCODE='22023'; END IF;
 INSERT INTO tv_core.lesson_state(user_id,lesson_key) VALUES(uid,p_lesson) ON CONFLICT DO NOTHING;
 SELECT * INTO st FROM tv_core.lesson_state WHERE user_id=uid AND lesson_key=p_lesson FOR UPDATE;
 IF st.version<>p_version THEN RETURN jsonb_build_object('conflict',true,'current',to_jsonb(st)-'user_id'); END IF;
 UPDATE tv_core.lesson_state SET version=version+1,completed=coalesce((p_data->>'completed')::boolean,false),steps=s,notes=coalesce(p_data->>'notes',''),bookmarked=coalesce((p_data->>'bookmarked')::boolean,false),updated_at=now() WHERE user_id=uid AND lesson_key=p_lesson RETURNING * INTO st;
 RETURN to_jsonb(st)-'user_id';
END $$;
REVOKE ALL ON FUNCTION public.tv_account(),public.tv_save_profile(text,text),public.tv_save_lesson(text,integer,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tv_account(),public.tv_save_profile(text,text),public.tv_save_lesson(text,integer,jsonb) TO authenticated;
