-- ============================================================
-- Tokens de dispositivo para notificaciones push.
--
-- Un token identifica a un iPhone concreto, no a una persona: si alguien
-- cierra sesión y entra otra cuenta en el mismo teléfono, el token debe
-- CAMBIAR de dueño, no duplicarse. De ahí el UNIQUE sobre token y el
-- upsert que reasigna user_id.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.device_tokens (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token      text NOT NULL,
  platform   text NOT NULL DEFAULT 'ios' CHECK (platform IN ('ios', 'android')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (token)
);

CREATE INDEX IF NOT EXISTS device_tokens_user_id_idx
  ON public.device_tokens (user_id);

ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;

-- Solo ves y borras los tuyos. El alta va por RPC (abajo): con una
-- política de INSERT abierta, cualquiera podría registrar el token de
-- otro dispositivo a su nombre y desviarle las notificaciones.
CREATE POLICY "Users can view own device tokens"
  ON public.device_tokens FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own device tokens"
  ON public.device_tokens FOR DELETE TO authenticated
  USING (user_id = auth.uid());


-- ============================================================
-- Alta / renovación del token.
--
-- APNs rota los tokens por su cuenta, así que esto se llama en cada
-- arranque y tiene que ser idempotente.
-- ============================================================
CREATE OR REPLACE FUNCTION public.register_device_token(_token text, _platform text DEFAULT 'ios')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '42501';
  END IF;
  IF _token IS NULL OR length(_token) = 0 THEN
    RAISE EXCEPTION 'EMPTY_TOKEN' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.device_tokens (user_id, token, platform)
  VALUES (auth.uid(), _token, COALESCE(_platform, 'ios'))
  ON CONFLICT (token) DO UPDATE
    SET user_id    = auth.uid(),
        platform   = COALESCE(EXCLUDED.platform, 'ios'),
        updated_at = now();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.register_device_token(text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.register_device_token(text, text) TO authenticated;


-- Baja al cerrar sesión: sin esto, el teléfono seguiría recibiendo
-- notificaciones de una cuenta de la que ya se salió.
CREATE OR REPLACE FUNCTION public.unregister_device_token(_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.device_tokens
  WHERE token = _token AND user_id = auth.uid();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.unregister_device_token(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.unregister_device_token(text) TO authenticated;


-- ============================================================
-- Comprobación: la tabla, sus dos políticas y las dos funciones.
-- ============================================================
SELECT 'tabla' AS que, tablename AS detalle FROM pg_tables
WHERE schemaname = 'public' AND tablename = 'device_tokens'
UNION ALL
SELECT 'politica', policyname FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'device_tokens'
UNION ALL
SELECT 'funcion', p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN ('register_device_token', 'unregister_device_token')
ORDER BY 1, 2;
