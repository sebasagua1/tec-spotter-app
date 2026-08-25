-- ============================================================
-- Aviso de "aquí se crean los eventos", una sola vez por persona
--
-- Va en profiles y no en localStorage a propósito: tiene que
-- sobrevivir a un cambio de dispositivo. Mismo patrón que
-- `onboarding_completed`, que ya vive aquí.
--
-- NO hace falta tocar RLS: las políticas de profiles ya dejan a cada
-- usuario leer y actualizar su propia fila, así que la columna queda
-- cubierta por las que hay.
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS create_tip_seen boolean NOT NULL DEFAULT false;


-- ============================================================
-- Comprobación (se ejecuta y devuelve filas): debe salir UNA fila,
-- con el tipo boolean y default false.
-- ============================================================
SELECT column_name, data_type, column_default, is_nullable
FROM   information_schema.columns
WHERE  table_schema = 'public'
  AND  table_name   = 'profiles'
  AND  column_name  = 'create_tip_seen';
