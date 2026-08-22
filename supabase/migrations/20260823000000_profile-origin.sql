-- ============================================================
-- De dónde es quien no vive en la ciudad del campus.
--
-- residence_type ya distinguía local / foráneo / internacional, pero no
-- guardaba de dónde, que es justo lo que hace que alguien recién llegado
-- encuentre a gente de su tierra.
--
-- Un solo campo de texto con el valor canónico:
--   internacional -> código ISO de dos letras ('CO')
--   foráneo       -> nombre del estado ('Jalisco')
-- El cliente traduce los códigos con Intl.DisplayNames, así que la lista
-- de países no hay que mantenerla en cada idioma ni en la base.
-- ============================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS origin text;


-- ============================================================
-- Y que se vea en el perfil público.
--
-- La columna va AL FINAL: CREATE OR REPLACE VIEW deja añadir columnas
-- por el final, pero no reordenar ni cambiar las que ya están.
-- ============================================================
CREATE OR REPLACE VIEW public.public_profiles
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
  origin
FROM public.profiles p
WHERE auth.uid() IS NOT NULL
  AND NOT public.is_blocked(auth.uid(), p.id);

GRANT SELECT ON public.public_profiles TO authenticated;
