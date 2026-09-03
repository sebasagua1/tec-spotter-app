-- ============================================================
-- Matrícula deducida del correo institucional
--
-- a01714719@tec.mx  ->  a01714719
--
-- Lo hace el SERVIDOR, en el trigger de alta, por la misma razón
-- que la institución: el correo lo ha verificado el proveedor de
-- autenticación, así que la parte de antes de la @ es un dato
-- acreditado. Si lo escribiera el cliente sería un campo de texto
-- cualquiera y no acreditaría nada.
--
-- SOLO cuando el correo pertenece a una institución reconocida.
-- Con un correo genérico la parte local no es ninguna matrícula
-- (de `pepe.lopez@gmail.com` no sale una matrícula, sale "pepe.lopez"),
-- así que ahí se queda en NULL.
--
-- No se valida el FORMATO a propósito. El de la matrícula del Tec
-- (una a y ocho dígitos) no es el de las otras dieciséis
-- instituciones sembradas, y una expresión regular pensada para una
-- de ellas dejaría al resto sin matrícula sin decir por qué.
--
-- NO se filtra a otros usuarios: la vista `public_profiles`, que es
-- por donde se leen los perfiles ajenos, enumera sus columnas una a
-- una y esta no está. Comprobado al escribir esta migración. Si
-- alguna vez se añade ahí, se estaría publicando la matrícula de
-- todo el mundo.
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS student_id text;

COMMENT ON COLUMN public.profiles.student_id IS
  'Matricula deducida de la parte local del correo institucional. La escribe el servidor en el alta; NULL si el correo no pertenece a ninguna institucion reconocida.';


-- ------------------------------------------------------------
-- 1. De dónde sale la matrícula
--
-- Función aparte para que el alta y el relleno de las cuentas que
-- ya existen usen exactamente la misma regla, y no dos copias que
-- se separen con el tiempo.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.student_id_for_email(_email text)
RETURNS text
LANGUAGE sql
-- STABLE y no IMMUTABLE: por dentro consulta la tabla de instituciones, así
-- que el resultado depende del contenido de la base y no solo del argumento.
-- Declararla IMMUTABLE invitaría al planificador a cachear resultados que
-- pueden cambiar al añadir un dominio.
STABLE
-- SECURITY DEFINER por lo mismo que institution_for_email, a la que llama:
-- esa tiene EXECUTE revocado para authenticated, así que sin esto una llamada
-- desde el navegador moriría con "permission denied" por dentro.
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _email IS NULL THEN NULL
    -- Sin institución no hay matrícula que deducir.
    WHEN public.institution_for_email(_email) IS NULL THEN NULL
    ELSE lower(btrim(split_part(_email, '@', 1)))
  END;
$$;

-- Nadie la llama desde fuera: solo el trigger de alta y el relleno de abajo,
-- que corren como postgres. Misma postura que institution_for_email.
REVOKE EXECUTE ON FUNCTION public.student_id_for_email(text) FROM PUBLIC, anon, authenticated;


-- ------------------------------------------------------------
-- 2. El alta la asigna
--
-- Se reescribe entera conservando lo que ya hacía (crear el perfil
-- y resolver la institución) y añadiendo la matrícula.
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

  INSERT INTO public.profiles (id, email, campus_id, institution_verified, student_id)
  VALUES (
    NEW.id,
    NEW.email,
    v_institution,
    v_institution IS NOT NULL,
    public.student_id_for_email(NEW.email)
  );

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;


-- ------------------------------------------------------------
-- 3. El cliente no puede reescribirla
--
-- Mismo mecanismo que ya protege points, reputation e
-- institution_verified: si quien escribe es el rol `authenticated`
-- (o sea, el navegador) y el valor cambia, se rechaza. Las
-- funciones SECURITY DEFINER corren como postgres y pasan.
--
-- Solo se protege cuando HAY matrícula puesta. Un perfil sin
-- institución la tiene en NULL, y ahí no hay nada que falsear:
-- si algún día se añade un campo para escribirla a mano, este
-- guardia no lo estorba.
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

  IF OLD.student_id IS NOT NULL
     AND NEW.student_id IS DISTINCT FROM OLD.student_id
     AND current_user = 'authenticated' THEN
    RAISE EXCEPTION 'permission denied: student_id is derived from the verified email, not set by the client'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.prevent_score_tampering() FROM PUBLIC, anon, authenticated;


-- ------------------------------------------------------------
-- 4. Las cuentas que ya existen
--
-- Solo las que tienen institución y aún no tienen matrícula. No se
-- pisa nada que ya tuviera valor.
-- ------------------------------------------------------------
UPDATE public.profiles
SET    student_id = public.student_id_for_email(email)
WHERE  student_id IS NULL
  AND  public.student_id_for_email(email) IS NOT NULL;


-- ============================================================
-- Comprobación (se ejecuta y devuelve filas)
--
-- La primera consulta prueba la regla con casos concretos: el de
-- Sebastián debe dar 'a01714719', y un correo genérico debe dar
-- NULL. La segunda cuenta cómo quedaron las cuentas existentes.
-- ============================================================
SELECT 'a01714719@tec.mx'      AS correo, public.student_id_for_email('a01714719@tec.mx')      AS matricula
UNION ALL
SELECT 'A01714719@TEC.MX',              public.student_id_for_email('A01714719@TEC.MX')
UNION ALL
SELECT 'pepe.lopez@gmail.com',          public.student_id_for_email('pepe.lopez@gmail.com')
UNION ALL
SELECT 'alguien@unam.mx',               public.student_id_for_email('alguien@unam.mx');

SELECT count(*) FILTER (WHERE student_id IS NOT NULL) AS con_matricula,
       count(*) FILTER (WHERE student_id IS NULL)     AS sin_matricula,
       count(*)                                        AS total
FROM   public.profiles;
