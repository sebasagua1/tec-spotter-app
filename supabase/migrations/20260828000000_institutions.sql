-- ============================================================
-- Instituciones genéricas + auto-join por dominio verificado en servidor
--
-- Antes: `campuses` tenía UNA columna email_domain, y el cliente decidía la
-- pertenencia con `email.endsWith('@tec.mx')` escrito a mano en Onboarding.
-- Eso significa que cualquiera podía asignarse el campus que quisiera desde
-- la API REST: el navegador no es un sitio donde verificar nada.
--
-- Después: `institutions` con una LISTA de dominios, y el servidor resuelve
-- la pertenencia en el trigger de alta. El cliente puede seguir *eligiendo*
-- una institución (queda sin verificar), pero no puede declararse verificado.
--
-- Idempotente: pensada para pegarse en el SQL Editor, incluso dos veces.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. campuses -> institutions
--
-- RENAME y no una tabla nueva: conserva los datos, la PK y la clave ajena
-- profiles.campus_id, que pasa a apuntar a institutions sin tocarla.
-- ------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'campuses')
     AND NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'institutions')
  THEN
    ALTER TABLE public.campuses RENAME TO institutions;

    IF EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'institutions'
        AND policyname = 'Anyone can view campuses'
    ) THEN
      ALTER POLICY "Anyone can view campuses" ON public.institutions
        RENAME TO "Anyone can view institutions";
    END IF;
  END IF;
END $$;

-- ------------------------------------------------------------
-- 2. Columnas nuevas
-- ------------------------------------------------------------
ALTER TABLE public.institutions
  ADD COLUMN IF NOT EXISTS slug          text,
  ADD COLUMN IF NOT EXISTS email_domains text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS is_active     boolean NOT NULL DEFAULT true;

-- Traspasa el dominio único al array, si la columna vieja sigue ahí.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'institutions' AND column_name = 'email_domain'
  ) THEN
    UPDATE public.institutions
    SET email_domains = ARRAY[lower(email_domain)]
    WHERE email_domain IS NOT NULL AND email_domains = '{}';
  END IF;
END $$;

-- ------------------------------------------------------------
-- 3. La fila existente pasa a ser una institución completa.
--
-- OJO, REVÍSAME ANTES DE EJECUTAR: las coordenadas del seed original eran
-- las de Monterrey (25.6514, -100.2899), pero el mapa de la app arranca en
-- Querétaro. Se unifican en Querétaro, que es lo que la app hace de verdad.
-- Si tu campus es otro, cambia estas dos líneas y el nombre.
-- ------------------------------------------------------------
UPDATE public.institutions
SET name          = 'Tec de Monterrey Campus Querétaro',
    slug          = 'tec-mty-qro',
    email_domains = ARRAY['tec.mx', 'exatec.mx', 'itesm.mx'],
    lat           = 20.6134,
    lng           = -100.4063
WHERE slug IS NULL
  AND 'tec.mx' = ANY (email_domains);

-- Cualquier otra fila sin slug recibe uno derivado del nombre.
UPDATE public.institutions
SET slug = regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g')
WHERE slug IS NULL;

-- ------------------------------------------------------------
-- 4. Restricciones, ya con los datos limpios
-- ------------------------------------------------------------
ALTER TABLE public.institutions ALTER COLUMN slug SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'institutions_slug_key'
  ) THEN
    ALTER TABLE public.institutions ADD CONSTRAINT institutions_slug_key UNIQUE (slug);
  END IF;
END $$;

-- El dominio único ya vive en el array; la columna sobra.
ALTER TABLE public.institutions DROP COLUMN IF EXISTS email_domain;

-- GIN, porque la búsqueda es "¿este dominio está en el array?".
CREATE INDEX IF NOT EXISTS institutions_email_domains_idx
  ON public.institutions USING gin (email_domains);

-- institution_for_email compara con `= ANY (email_domains)` para poder usar
-- ese índice, y eso exige que los dominios estén en minúsculas y sin espacios.
--
-- Se hace con un trigger y no con un CHECK por dos razones: Postgres no admite
-- subconsultas en un CHECK (y recorrer un array necesita unnest), y además
-- normalizar es mejor que rechazar — quien dé de alta una institución con
-- "TEC.MX" quiere decir tec.mx, no equivocarse.
CREATE OR REPLACE FUNCTION public.normalize_institution_domains()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.email_domains := ARRAY(
    SELECT lower(btrim(d))
    FROM unnest(COALESCE(NEW.email_domains, '{}')) AS d
    WHERE btrim(d) <> ''
  );
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.normalize_institution_domains() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_normalize_institution_domains ON public.institutions;
CREATE TRIGGER trg_normalize_institution_domains
  BEFORE INSERT OR UPDATE ON public.institutions
  FOR EACH ROW EXECUTE FUNCTION public.normalize_institution_domains();

-- Normaliza lo que ya hubiera en la tabla antes de este trigger.
UPDATE public.institutions
SET email_domains = ARRAY(SELECT lower(btrim(d)) FROM unnest(email_domains) AS d)
WHERE email_domains IS DISTINCT FROM ARRAY(SELECT lower(btrim(d)) FROM unnest(email_domains) AS d);

-- ------------------------------------------------------------
-- 5. Vista de compatibilidad
--
-- El cliente y src/integrations/supabase/types.ts siguen hablando de
-- `campuses`. La vista deja que ese código funcione sin cambios mientras se
-- migra, exponiendo el primer dominio como el `email_domain` de siempre.
-- ------------------------------------------------------------
DROP VIEW IF EXISTS public.campuses;
CREATE VIEW public.campuses WITH (security_invoker = true) AS
SELECT id,
       name,
       email_domains[1] AS email_domain,
       lat,
       lng,
       created_at
FROM public.institutions
WHERE is_active;

GRANT SELECT ON public.campuses TO authenticated;

-- ------------------------------------------------------------
-- 6. La marca de pertenencia verificada
-- ------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS institution_verified boolean NOT NULL DEFAULT false;

-- ------------------------------------------------------------
-- 7. Resolver institución a partir del correo
--
-- SECURITY DEFINER y sin permiso de ejecución para nadie: solo la llama el
-- trigger de alta, que corre como postgres.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.institution_for_email(_email text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id
  FROM public.institutions
  WHERE is_active
    AND lower(split_part(_email, '@', 2)) = ANY (email_domains)
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.institution_for_email(text) FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------
-- 8. El alta asigna la institución
--
-- Sustituye a handle_new_user() conservando lo que ya hacía (crear el
-- perfil); ahora además resuelve la institución por dominio.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_institution uuid;
BEGIN
  v_institution := public.institution_for_email(NEW.email);

  INSERT INTO public.profiles (id, email, campus_id, institution_verified)
  VALUES (NEW.id, NEW.email, v_institution, v_institution IS NOT NULL);

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------
-- 9. El cliente no puede declararse verificado
--
-- Mismo mecanismo que ya protege points y reputation: si quien escribe es el
-- rol `authenticated` (es decir, el navegador) y la bandera cambia, se
-- rechaza. Las funciones SECURITY DEFINER corren como postgres y pasan.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_score_tampering()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (NEW.points IS DISTINCT FROM OLD.points OR NEW.reputation IS DISTINCT FROM OLD.reputation)
     AND current_user = 'authenticated' THEN
    RAISE EXCEPTION 'permission denied: score fields are read-only for regular users'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.institution_verified IS DISTINCT FROM OLD.institution_verified
     AND current_user = 'authenticated' THEN
    RAISE EXCEPTION 'permission denied: institution_verified is set by the server, not the client'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.prevent_score_tampering() FROM PUBLIC, anon, authenticated;

-- El trigger ya existe desde 20260604120000, pero recrearlo hace que esta
-- migración no dependa de ello.
DROP TRIGGER IF EXISTS trg_prevent_score_tampering ON public.profiles;
CREATE TRIGGER trg_prevent_score_tampering
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_score_tampering();

-- ------------------------------------------------------------
-- 10. Perfiles que ya existen
--
-- Quien se registró con un correo institucional antes de esta migración
-- queda verificado y adscrito, aunque hubiera elegido otra cosa a mano.
-- ------------------------------------------------------------
UPDATE public.profiles p
SET campus_id            = i.id,
    institution_verified = true
FROM public.institutions i
WHERE i.is_active
  AND lower(split_part(p.email, '@', 2)) = ANY (i.email_domains)
  AND (p.campus_id IS DISTINCT FROM i.id OR NOT p.institution_verified);

-- ------------------------------------------------------------
-- 11. La vista pública expone la insignia
--
-- DROP + CREATE y no CREATE OR REPLACE: este último exige que las columnas
-- que ya existen coincidan en nombre y ORDEN, y si la vista de producción
-- hubiera derivado un milímetro respecto al esquema del repo, fallaría. Nada
-- depende de esta vista, así que recrearla es seguro.
--
-- Se conserva security_invoker = false, que es como estaba
-- (ver 20260604120000_fix-three-security-bugs.sql).
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
  AND NOT public.is_blocked(auth.uid(), p.id);

GRANT SELECT ON public.public_profiles TO authenticated;

COMMIT;
