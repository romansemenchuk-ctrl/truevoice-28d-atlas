-- Authorization returns no notes, avoiding repeated large account reads on each asset request.
CREATE FUNCTION public.tv_authorize() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid:=tv_core.member_id();
BEGIN
 IF uid IS NULL OR NOT tv_core.can_access('atlas') THEN RAISE EXCEPTION 'access denied' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('user',jsonb_build_object('id',uid,'role',CASE WHEN tv_core.is_admin() THEN 'admin' ELSE 'student' END));
END $$;
CREATE FUNCTION public.tv_set_resume(p_lesson text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE uid uuid:=tv_core.member_id();
BEGIN
 IF uid IS NULL OR NOT tv_core.can_access('atlas') THEN RAISE EXCEPTION 'access denied' USING ERRCODE='42501'; END IF;
 IF p_lesson IS NULL OR NOT EXISTS(SELECT 1 FROM tv_core.lesson_catalog WHERE key=p_lesson) THEN RAISE EXCEPTION 'invalid lesson' USING ERRCODE='22023'; END IF;
 INSERT INTO tv_core.profiles(user_id,last_lesson) VALUES(uid,p_lesson) ON CONFLICT(user_id) DO UPDATE SET last_lesson=excluded.last_lesson,updated_at=now();
 RETURN jsonb_build_object('lastLesson',p_lesson);
END $$;
REVOKE ALL ON FUNCTION public.tv_authorize(),public.tv_set_resume(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tv_authorize(),public.tv_set_resume(text) TO authenticated;
