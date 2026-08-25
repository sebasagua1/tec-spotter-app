-- ============================================================
-- Paginar amigos y solicitudes en el servidor.
--
-- El cliente traía TODAS las amistades y luego pedía los perfiles con
-- `.in('id', [...])`, metiendo la lista entera de uuid en la URL. Son unos
-- 37 bytes por uuid contra un límite de ~8 kB: pasados unos 200 amigos la
-- petición se rechaza con 414 y la pestaña se queda vacía del todo.
--
-- De paso arregla dos cosas más que venían con ello:
--
--   · `.range()` iba sin `.order()`. Postgres no garantiza ningún orden sin
--     ORDER BY, así que con LIMIT/OFFSET se podían repetir y saltar filas
--     entre páginas. Aquí el orden es total (nombre, y el id para desempatar).
--
--   · El contador de la cabecera enseñaba los amigos CARGADOS, no los que
--     hay. Ahora viene el total de verdad, gratis con una función de ventana:
--     se evalúa antes del LIMIT.
--
-- SECURITY INVOKER (lo de por defecto), a propósito y no DEFINER: así la RLS
-- de `friendships` sigue aplicándose y `public_profiles` filtra por su cuenta
-- (bloqueos e institución). La función no puede enseñar nada que el cliente
-- no pudiera pedir ya por su cuenta; solo lo hace en una consulta en vez de
-- en dos y sin meter nada en la URL.
--
-- Idempotente: pensada para pegarse en el SQL Editor, incluso dos veces.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Una página de mis amigos
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.friends_page(
  _limit  integer DEFAULT 15,
  _offset integer DEFAULT 0
)
RETURNS TABLE (
  id         uuid,
  name       text,
  avatar_url text,
  major      text,
  total      bigint
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    p.id,
    p.name,
    p.avatar_url,
    p.major,
    -- Antes del LIMIT: da cuántos hay, no cuántos caben en la página.
    count(*) OVER () AS total
  FROM public.friendships f
  JOIN public.public_profiles p
    ON p.id = CASE
                WHEN f.requester_id = auth.uid() THEN f.addressee_id
                ELSE f.requester_id
              END
  WHERE f.status = 'accepted'
    AND (f.requester_id = auth.uid() OR f.addressee_id = auth.uid())
  -- El id desempata: sin él, dos personas con el mismo nombre podrían
  -- intercambiarse entre páginas y aparecer dos veces o ninguna.
  ORDER BY p.name NULLS LAST, p.id
  LIMIT  least(greatest(_limit, 1), 100)
  OFFSET greatest(_offset, 0);
$$;

REVOKE EXECUTE ON FUNCTION public.friends_page(integer, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.friends_page(integer, integer) TO authenticated;

-- ------------------------------------------------------------
-- 2. Las solicitudes de amistad que he recibido
--
-- Mismo problema de URL y misma solución. El tope es una válvula: una cuenta
-- que dispare solicitudes en masa no debe poder tumbar la pantalla.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.friend_requests_incoming(
  _limit integer DEFAULT 200
)
RETURNS TABLE (
  friendship_id uuid,
  id            uuid,
  name          text,
  avatar_url    text,
  major         text
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    f.id,
    p.id,
    p.name,
    p.avatar_url,
    p.major
  FROM public.friendships f
  JOIN public.public_profiles p ON p.id = f.requester_id
  WHERE f.addressee_id = auth.uid()
    AND f.status = 'pending'
  ORDER BY f.created_at DESC, f.id
  LIMIT least(greatest(_limit, 1), 500);
$$;

REVOKE EXECUTE ON FUNCTION public.friend_requests_incoming(integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.friend_requests_incoming(integer) TO authenticated;

COMMIT;

-- ============================================================
-- Comprobación (devuelve dos filas si ha ido bien).
-- ============================================================
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
FROM   pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE  n.nspname = 'public'
  AND  p.proname IN ('friends_page', 'friend_requests_incoming')
ORDER  BY p.proname;
