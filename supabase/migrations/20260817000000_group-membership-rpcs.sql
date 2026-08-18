-- ============================================================
-- Membresía de grupos vía RPC (arregla DMs, invitaciones y el
-- hueco de auto-unirse a grupos ajenos).
--
-- Problema que resuelve:
--   La política "Users can join groups" solo permitía
--   WITH CHECK (auth.uid() = user_id). El cliente intentaba
--   insertar a OTRA persona (al crear un DM y al invitar a un
--   grupo), la fila ajena violaba el WITH CHECK y la sentencia
--   entera fallaba: no se insertaba nadie. Los DMs quedaban sin
--   miembros y ningún mensaje se podía enviar.
--   Además esa misma política dejaba que cualquiera se metiera
--   en cualquier grupo con solo conocer su UUID.
--
-- Solución: la membresía deja de ser escribible desde el cliente.
--   - El creador entra automáticamente por trigger.
--   - Los DMs se crean con create_dm() (atómico, exige amistad).
--   - Las invitaciones pasan por add_group_member() (exige que
--     quien invita ya sea miembro y que el invitado sea su amigo).
--   Salir del grupo sigue siendo un DELETE directo del propio row.
-- ============================================================


-- ============================================================
-- 1. El creador de un grupo entra siempre como miembro.
--
-- Antes lo hacía el cliente con un INSERT aparte, que se queda
-- sin política. Con el trigger no hay ventana en la que un grupo
-- exista sin su creador dentro.
-- ============================================================
CREATE OR REPLACE FUNCTION public.on_group_created_add_creator()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.group_members (group_id, user_id)
  VALUES (NEW.id, NEW.created_by)
  ON CONFLICT (group_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.on_group_created_add_creator() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_group_created_add_creator ON public.groups;
CREATE TRIGGER trg_group_created_add_creator
  AFTER INSERT ON public.groups
  FOR EACH ROW EXECUTE FUNCTION public.on_group_created_add_creator();


-- ============================================================
-- 2. create_dm(_other_user_id) → uuid del grupo DM
--
-- Idempotente: si el DM ya existe devuelve el mismo grupo, mire
-- quien lo mire. El nombre es determinista (__dm_<uuid menor>_<uuid mayor>)
-- para que ambas partes lleguen al mismo registro; la búsqueda va
-- por dentro de la función (SECURITY DEFINER), así que funciona
-- aunque quien llama todavía no sea miembro y no pueda verlo por RLS.
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_dm(_other_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_name     text;
  v_group_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  IF _other_user_id IS NULL OR _other_user_id = v_uid THEN
    RAISE EXCEPTION 'INVALID_TARGET' USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.are_friends(v_uid, _other_user_id) THEN
    RAISE EXCEPTION 'NOT_FRIENDS' USING ERRCODE = '42501';
  END IF;

  v_name := '__dm_' || least(v_uid, _other_user_id)::text
                    || '_' || greatest(v_uid, _other_user_id)::text;

  -- ORDER BY created_at: el bug anterior pudo dejar más de un grupo con
  -- el mismo nombre __dm_ (cada parte creó el suyo, sin miembros). Quedarse
  -- siempre con el más antiguo hace que ambas partes converjan en uno solo;
  -- el INSERT de abajo lo repara metiendo a los dos.
  SELECT id INTO v_group_id
  FROM   public.groups
  WHERE  name = v_name
  ORDER  BY created_at
  LIMIT  1;

  IF v_group_id IS NULL THEN
    INSERT INTO public.groups (name, created_by)
    VALUES (v_name, v_uid)
    RETURNING id INTO v_group_id;
    -- el trigger ya metió a v_uid; falta la otra parte
  END IF;

  INSERT INTO public.group_members (group_id, user_id)
  VALUES (v_group_id, v_uid), (v_group_id, _other_user_id)
  ON CONFLICT (group_id, user_id) DO NOTHING;

  RETURN v_group_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_dm(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.create_dm(uuid) TO authenticated;


-- ============================================================
-- 3. add_group_member(_group_id, _user_id)
--
-- Quien invita tiene que ser ya miembro del grupo, y solo puede
-- invitar a sus amigos aceptados. Los grupos DM no admiten gente
-- nueva: son de dos y su nombre determinista dejaría de cuadrar.
-- ============================================================
CREATE OR REPLACE FUNCTION public.add_group_member(_group_id uuid, _user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_name text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED' USING ERRCODE = '42501';
  END IF;

  SELECT name INTO v_name FROM public.groups WHERE id = _group_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'GROUP_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_name LIKE '\_\_dm\_%' THEN
    RAISE EXCEPTION 'CANNOT_INVITE_TO_DM' USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.is_group_member(_group_id, v_uid) THEN
    RAISE EXCEPTION 'NOT_A_MEMBER' USING ERRCODE = '42501';
  END IF;

  IF NOT public.are_friends(v_uid, _user_id) THEN
    RAISE EXCEPTION 'NOT_FRIENDS' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.group_members (group_id, user_id)
  VALUES (_group_id, _user_id)
  ON CONFLICT (group_id, user_id) DO NOTHING;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.add_group_member(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.add_group_member(uuid, uuid) TO authenticated;


-- ============================================================
-- 4. Cerrar el INSERT directo sobre group_members.
--
-- Sin política de INSERT para authenticated, la RLS bloquea toda
-- escritura del cliente: la membresía solo se crea por el trigger
-- y por las dos RPC de arriba (que corren como postgres/BYPASSRLS).
-- Esto cierra el hueco de meterse en cualquier grupo conociendo
-- su UUID. El DELETE ("Users can leave groups") se queda: salirse
-- sigue siendo cosa de cada quien.
-- ============================================================
DROP POLICY IF EXISTS "Users can join groups" ON public.group_members;


-- ============================================================
-- 5. El creador puede ver la lista de miembros aunque se haya
--    salido del grupo (la política de SELECT de groups ya le
--    dejaba ver el grupo; esto alinea las dos).
-- ============================================================
DROP POLICY IF EXISTS "Members can view fellow group members" ON public.group_members;

CREATE POLICY "Members and creators can view group members"
ON public.group_members
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_group_member(group_id, auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.groups g
    WHERE g.id = group_members.group_id AND g.created_by = auth.uid()
  )
);


-- ============================================================
-- OPCIONAL (no se ejecuta): limpieza de los grupos DM huérfanos
-- que dejó el bug — creados sin miembros y sin un solo mensaje.
-- Revísalos antes de borrar nada.
--
--   SELECT g.id, g.name, g.created_at
--   FROM   public.groups g
--   WHERE  g.name LIKE '\_\_dm\_%'
--     AND  NOT EXISTS (SELECT 1 FROM public.group_members m WHERE m.group_id = g.id)
--     AND  NOT EXISTS (SELECT 1 FROM public.messages     x WHERE x.group_id = g.id);
--
-- create_dm() no los necesita: si quedan, simplemente reutiliza el
-- más antiguo y le añade a las dos personas.
-- ============================================================
