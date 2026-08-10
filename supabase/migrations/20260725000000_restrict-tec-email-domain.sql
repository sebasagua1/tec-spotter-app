-- ============================================================
-- Restringe el registro a correos institucionales del Tec.
--
-- Se aplica con un trigger BEFORE INSERT sobre auth.users, así
-- que bloquea TODOS los caminos de alta (email+contraseña y
-- OAuth de Google por igual) a nivel de base de datos — no se
-- puede saltar desde el cliente.
--
-- Dominios permitidos:
--   tec.mx     — estudiantes y colaboradores
--   exatec.mx  — egresados
--   itesm.mx   — dominio institucional heredado
-- Edita la lista en la función si necesitas ajustar el alcance.
-- ============================================================

CREATE OR REPLACE FUNCTION public.enforce_tec_email()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_domain text := lower(split_part(NEW.email, '@', 2));
BEGIN
  IF v_domain NOT IN ('tec.mx', 'exatec.mx', 'itesm.mx') THEN
    RAISE EXCEPTION 'EMAIL_DOMAIN_NOT_ALLOWED'
      USING ERRCODE = '42501',
            HINT = 'Solo se permiten correos institucionales del Tec (@tec.mx, @exatec.mx).';
  END IF;
  RETURN NEW;
END;
$$;

-- Solo el servidor debe poder ejecutarla; nunca los roles de cliente.
REVOKE EXECUTE ON FUNCTION public.enforce_tec_email() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_enforce_tec_email ON auth.users;
CREATE TRIGGER trg_enforce_tec_email
  BEFORE INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.enforce_tec_email();
