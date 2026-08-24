-- ============================================================
-- Aislamiento por institución
--
-- Hasta ahora la institución ETIQUETABA a la gente pero no SEPARABA nada:
-- la política de eventos era "cualquiera ve los abiertos" y la búsqueda de
-- personas iba contra public_profiles sin filtro. Un correo genérico veía
-- exactamente lo mismo que alguien del campus.
--
-- A partir de aquí cada institución es un entorno cerrado: solo ves eventos y
-- personas de la tuya. Lo impone la RLS, no el cliente, así que no se salta
-- llamando a la API directamente.
--
-- Se conserva SIEMPRE la visibilidad de lo propio: tus eventos y tu perfil los
-- ves aunque tu institución cambie o falte, para no dejar a nadie encerrado
-- fuera de sus propias cosas.
--
-- Idempotente: pensada para pegarse en el SQL Editor, incluso dos veces.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. ¿Son de la misma institución?
--
-- SECURITY DEFINER porque tiene que leer profiles saltándose la RLS: si no,
-- la propia política que la usa entraría en recursión.
-- STABLE para que el planificador la evalúe una vez por consulta, no por fila.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.same_institution(_a uuid, _b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles pa
    JOIN public.profiles pb ON pb.id = _b
    WHERE pa.id = _a
      AND pa.campus_id IS NOT NULL
      AND pa.campus_id = pb.campus_id
  );
$$;

REVOKE EXECUTE ON FUNCTION public.same_institution(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.same_institution(uuid, uuid) TO authenticated;

-- ------------------------------------------------------------
-- 2. Eventos: se acotan a la institución de quien los crea
--
-- Se desnormaliza en una columna en vez de resolverlo con un JOIN dentro de la
-- política: la RLS se evalúa por fila y en el mapa eso son cientos de filas.
-- ------------------------------------------------------------
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS institution_id uuid REFERENCES public.institutions(id);

-- El cliente no la manda: la pone el servidor a partir del perfil del creador.
CREATE OR REPLACE FUNCTION public.set_event_institution()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SELECT campus_id INTO NEW.institution_id
  FROM public.profiles
  WHERE id = NEW.creator_id;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_event_institution() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_set_event_institution ON public.events;
CREATE TRIGGER trg_set_event_institution
  BEFORE INSERT ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.set_event_institution();

-- Eventos que ya existen.
UPDATE public.events e
SET institution_id = p.campus_id
FROM public.profiles p
WHERE p.id = e.creator_id
  AND e.institution_id IS DISTINCT FROM p.campus_id;

CREATE INDEX IF NOT EXISTS events_institution_id_idx
  ON public.events (institution_id) WHERE is_active;

-- ------------------------------------------------------------
-- 3. La política de visibilidad, con la institución dentro
--
-- Parte de la de 20260819000000_join-requests.sql y le añade el corte por
-- institución. Lo propio se saca fuera del AND para que tus eventos sigan
-- siendo tuyos pase lo que pase.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS "Events visibility policy" ON public.events;

CREATE POLICY "Events visibility policy"
  ON public.events FOR SELECT TO authenticated
  USING (
    creator_id = auth.uid()
    OR (
      NOT public.is_blocked(auth.uid(), creator_id)
      AND public.same_institution(auth.uid(), creator_id)
      AND (
        privacy IN ('open', 'private')
        OR (privacy = 'friends' AND public.are_friends(creator_id, auth.uid()))
      )
    )
  );

-- ------------------------------------------------------------
-- 4. Personas: la vista pública también se acota
--
-- Es la que alimentan la búsqueda de amigos y las fichas de perfil. Sin esto,
-- acotar los eventos serviría de poco: se seguiría viendo a todo el mundo.
-- ------------------------------------------------------------
DROP VIEW IF EXISTS public.public_profiles;
CREATE VIEW public.public_profiles
WITH (security_invoker = false) AS
SELECT
  id,
  name,
  avatar_url,
  major,
  semester,
  residence_type,
  interests,
  languages,
  campus_id,
  points,
  reputation,
  created_at,
  origin,
  institution_verified
FROM public.profiles p
WHERE auth.uid() IS NOT NULL
  AND NOT public.is_blocked(auth.uid(), p.id)
  AND (p.id = auth.uid() OR public.same_institution(auth.uid(), p.id));

GRANT SELECT ON public.public_profiles TO authenticated;

-- ------------------------------------------------------------
-- 5. Sin institución no se termina el onboarding
--
-- El cliente ya lo exige (Onboarding.tsx no deja pasar el paso sin elegir),
-- pero eso es una comprobación de navegador: se salta con una llamada a la
-- API. Aquí se garantiza de verdad.
--
-- NOT VALID a propósito: solo se aplica a filas nuevas y a las que se
-- actualicen. Sin eso, la migración fallaría entera si existiera un perfil
-- antiguo con el onboarding hecho y sin campus, y no puedo comprobar desde
-- fuera si lo hay. Para exigirlo también a los viejos, cuando estés seguro:
--     ALTER TABLE public.profiles VALIDATE CONSTRAINT profiles_institution_required;
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_institution_required'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_institution_required
      CHECK (NOT onboarding_completed OR campus_id IS NOT NULL) NOT VALID;
  END IF;
END $$;

COMMIT;
