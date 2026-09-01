-- ============================================================
-- Constancia de que la persona aceptó los términos y confirmó
-- ser mayor de edad
--
-- La app se publica con clasificación 18+ y los términos exigen
-- 18 años, pero hasta ahora eso solo estaba ESCRITO: nadie lo
-- confirmaba y no quedaba constancia de nada. Una casilla que no
-- se guarda no sirve de prueba, así que el onboarding escribe
-- aquí el momento exacto.
--
-- Dos columnas y no una porque son dos afirmaciones distintas:
-- "acepto este contrato" y "declaro tener 18 años". Se marcan en
-- el mismo instante, pero cada una se sostiene por su cuenta si
-- alguna vez hay que demostrarla.
--
-- Nullable a propósito: las cuentas que ya existen no han pasado
-- por esta pantalla, y ponerles una fecha inventada sería
-- justamente falsificar la constancia. NULL significa "no consta",
-- que es la verdad.
--
-- NO hace falta tocar RLS: las políticas de profiles ya dejan a
-- cada usuario leer y actualizar su propia fila, así que las
-- columnas quedan cubiertas por las que hay. Mismo patrón que
-- `onboarding_completed` y `create_tip_seen`.
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS age_confirmed_at  timestamptz;


-- ============================================================
-- Comprobación (se ejecuta y devuelve filas): deben salir DOS
-- filas, ambas timestamp with time zone y ambas nullable.
-- ============================================================
SELECT column_name, data_type, is_nullable
FROM   information_schema.columns
WHERE  table_schema = 'public'
  AND  table_name   = 'profiles'
  AND  column_name  IN ('terms_accepted_at', 'age_confirmed_at')
ORDER  BY column_name;
