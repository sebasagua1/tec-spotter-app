-- ============================================================
-- Las insignias, solo las tuyas
--
-- `badges` se quedó con la política del primer día,
-- `FOR SELECT USING (true)`: cualquiera autenticado podía leer las filas
-- de todo el mundo. Era la única tabla de datos que seguía así, y
-- contradice el aislamiento por institución que impusieron
-- 20260828000000 y 20260829000000 — no filtra nombres, pero sí una
-- lista de UUIDs de usuarios de OTRAS instituciones.
--
-- Se cierra a lo que la app usa de verdad: Profile.tsx es el único sitio
-- que las lee, y siempre las del propio usuario. La hoja de perfil de
-- otra persona (UserProfileSheet) no las enseña.
-- ============================================================

DROP POLICY IF EXISTS "Users can view badges" ON public.badges;

CREATE POLICY "Users can view own badges"
  ON public.badges FOR SELECT TO authenticated
  USING (user_id = auth.uid());


-- ============================================================
-- Comprobación (se ejecuta y devuelve filas): debe salir UNA, la nueva.
-- Si aparece también "Users can view badges", el DROP no se aplicó.
-- ============================================================
SELECT policyname, cmd, qual
FROM   pg_policies
WHERE  schemaname = 'public' AND tablename = 'badges' AND cmd = 'SELECT';
