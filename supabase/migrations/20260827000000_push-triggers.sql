-- ============================================================
-- Disparadores de notificaciones push.
--
-- Hasta ahora send-push solo se podía llamar a mano. Esto conecta los
-- cuatro momentos en los que la app debería avisar aunque esté cerrada:
--   1. Alguien pide unirse a un evento mío.
--   2. Me aprueban la solicitud.
--   3. Me llega un mensaje.
--   4. Me llega una solicitud de amistad.
--
-- Todo es servidor: la base llama a la Edge Function por HTTP (pg_net).
-- No hace falta build nuevo de la app.
--
-- REQUISITOS antes de ejecutar este script:
--   a) La extensión pg_net habilitada (el CREATE EXTENSION de abajo la
--      pone; si el plan no la trae, se habilita en Database → Extensions).
--   b) El secreto 'service_role_key' guardado en Vault. Va en su propio
--      script porque lleva la clave dentro y esto se versiona en git.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_net;


-- ============================================================
-- 1. push_send() — el único sitio que habla con la Edge Function.
--
-- Tres decisiones que importan:
--   · La clave sale de Vault, nunca de este archivo (esto va a git).
--   · Si la persona no tiene ningún dispositivo registrado, ni se hace
--     la llamada. Es la mayoría de los casos mientras solo iOS registre.
--   · El EXCEPTION del final es lo más importante del script: una push
--     que falla no puede tumbar el mensaje, la solicitud ni la
--     aprobación que la provocó. Se queda en WARNING y la vida sigue.
--
-- net.http_post es asíncrono (encola y devuelve un id), así que esto no
-- añade espera a la escritura del usuario.
-- ============================================================
CREATE OR REPLACE FUNCTION public.push_send(
    _user_id uuid,
    _title   text,
    _body    text,
    _data    jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
-- public al final a propósito: así nadie puede colar un http_post suyo
-- que se resuelva antes que el de pg_net.
SET search_path = extensions, net, public
AS $$
DECLARE
  v_key text;
BEGIN
  IF _user_id IS NULL OR _title IS NULL OR _body IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.device_tokens WHERE user_id = _user_id) THEN
    RETURN;
  END IF;

  SELECT decrypted_secret INTO v_key
  FROM   vault.decrypted_secrets
  WHERE  name = 'service_role_key';

  IF v_key IS NULL THEN
    RAISE WARNING 'push_send: falta el secreto service_role_key en Vault';
    RETURN;
  END IF;

  PERFORM http_post(
    url     := 'https://myarlozvkbebygwszgkf.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || v_key
               ),
    body    := jsonb_build_object(
                 'user_id', _user_id,
                 'title',   _title,
                 'body',    _body,
                 'data',    COALESCE(_data, '{}'::jsonb)
               )
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'push_send falló (%): %', SQLSTATE, SQLERRM;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.push_send(uuid, text, text, jsonb) FROM PUBLIC, anon, authenticated;


-- ============================================================
-- 2. Alguien pide unirse a un evento mío.
--
-- Solo eventos privados generan 'pending' (lo fija
-- set_participant_initial_status), así que este trigger no se dispara
-- en los abiertos.
-- ============================================================
CREATE OR REPLACE FUNCTION public.on_join_request_push()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_creator uuid;
  v_event   text;
  v_who     text;
BEGIN
  SELECT e.creator_id, e.title INTO v_creator, v_event
  FROM   public.events e WHERE e.id = NEW.event_id;

  IF v_creator IS NULL OR v_creator = NEW.user_id THEN RETURN NEW; END IF;
  IF public.is_blocked(v_creator, NEW.user_id)     THEN RETURN NEW; END IF;

  SELECT COALESCE(NULLIF(p.name, ''), 'Alguien') INTO v_who
  FROM   public.profiles p WHERE p.id = NEW.user_id;

  PERFORM public.push_send(
    v_creator,
    'Nueva solicitud',
    COALESCE(v_who, 'Alguien') || ' quiere unirse a ' || COALESCE(v_event, 'tu evento'),
    jsonb_build_object('type', 'join_request', 'event_id', NEW.event_id)
  );
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.on_join_request_push() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_join_request_push ON public.event_participants;
CREATE TRIGGER trg_join_request_push
  AFTER INSERT ON public.event_participants
  FOR EACH ROW
  WHEN (NEW.status = 'pending')
  EXECUTE FUNCTION public.on_join_request_push();


-- ============================================================
-- 3. Me aprobaron la solicitud.
--
-- Acotado a pending → joined: la otra transición hacia 'joined' es
-- entrar directo a un evento abierto, y ahí no hay nada que avisar.
-- ============================================================
CREATE OR REPLACE FUNCTION public.on_approval_push()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event text;
BEGIN
  SELECT e.title INTO v_event
  FROM   public.events e WHERE e.id = NEW.event_id;

  PERFORM public.push_send(
    NEW.user_id,
    'Ya estás dentro',
    'Te aprobaron en ' || COALESCE(v_event, 'el evento'),
    jsonb_build_object('type', 'approval', 'event_id', NEW.event_id)
  );
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.on_approval_push() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_approval_push ON public.event_participants;
CREATE TRIGGER trg_approval_push
  AFTER UPDATE OF status ON public.event_participants
  FOR EACH ROW
  WHEN (OLD.status = 'pending' AND NEW.status = 'joined')
  EXECUTE FUNCTION public.on_approval_push();


-- ============================================================
-- 4. Mensaje nuevo.
--
-- Los DM son grupos llamados '__dm_<uuid>_<uuid>' (ver create_dm), y ese
-- nombre no se le enseña a nadie: en un DM el título es el nombre de
-- quien escribe, y en un grupo el nombre del grupo con el remitente
-- delante del texto.
--
-- Se respeta is_blocked: en un DM el bloqueo ya saca a las dos partes,
-- pero en un grupo de tres o más la persona bloqueada sigue dentro.
-- ============================================================
CREATE OR REPLACE FUNCTION public.on_message_push()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group  text;
  v_sender text;
  v_title  text;
  v_body   text;
  r        RECORD;
BEGIN
  -- El chat de evento nunca llegó a usarse (messages.event_id está muerto);
  -- si algún día se usa, aquí es donde iría.
  IF NEW.group_id IS NULL THEN RETURN NEW; END IF;

  SELECT g.name INTO v_group FROM public.groups g WHERE g.id = NEW.group_id;

  SELECT COALESCE(NULLIF(p.name, ''), 'Alguien') INTO v_sender
  FROM   public.profiles p WHERE p.id = NEW.sender_id;
  v_sender := COALESCE(v_sender, 'Alguien');

  v_body := left(NEW.content, 120);
  IF length(NEW.content) > 120 THEN v_body := v_body || '…'; END IF;

  IF left(COALESCE(v_group, ''), 5) = '__dm_' THEN
    v_title := v_sender;
  ELSE
    v_title := COALESCE(v_group, 'Grupo');
    v_body  := v_sender || ': ' || v_body;
  END IF;

  FOR r IN
    SELECT gm.user_id
    FROM   public.group_members gm
    WHERE  gm.group_id  = NEW.group_id
      AND  gm.user_id  <> NEW.sender_id
      AND  NOT public.is_blocked(gm.user_id, NEW.sender_id)
  LOOP
    PERFORM public.push_send(
      r.user_id, v_title, v_body,
      jsonb_build_object('type', 'message', 'group_id', NEW.group_id)
    );
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.on_message_push() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_message_push ON public.messages;
CREATE TRIGGER trg_message_push
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.on_message_push();


-- ============================================================
-- 5. Solicitud de amistad.
-- ============================================================
CREATE OR REPLACE FUNCTION public.on_friend_request_push()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_who text;
BEGIN
  IF NEW.addressee_id = NEW.requester_id THEN RETURN NEW; END IF;
  IF public.is_blocked(NEW.addressee_id, NEW.requester_id) THEN RETURN NEW; END IF;

  SELECT COALESCE(NULLIF(p.name, ''), 'Alguien') INTO v_who
  FROM   public.profiles p WHERE p.id = NEW.requester_id;

  PERFORM public.push_send(
    NEW.addressee_id,
    'Solicitud de amistad',
    COALESCE(v_who, 'Alguien') || ' te quiere agregar',
    jsonb_build_object('type', 'friend_request', 'requester_id', NEW.requester_id)
  );
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.on_friend_request_push() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_friend_request_push ON public.friendships;
CREATE TRIGGER trg_friend_request_push
  AFTER INSERT ON public.friendships
  FOR EACH ROW
  WHEN (NEW.status = 'pending')
  EXECUTE FUNCTION public.on_friend_request_push();


-- ============================================================
-- Comprobación: deben salir los cuatro disparadores.
-- ============================================================
SELECT c.relname AS tabla, t.tgname AS disparador
FROM   pg_trigger t
JOIN   pg_class   c ON c.oid = t.tgrelid
WHERE  NOT t.tgisinternal
  AND  t.tgname IN ('trg_join_request_push', 'trg_approval_push',
                    'trg_message_push', 'trg_friend_request_push')
ORDER  BY 1, 2;
