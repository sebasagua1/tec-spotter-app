// Borrado de cuenta (App Store guideline 5.1.1 v).
//
// El usuario solo puede borrarse a sí mismo: la identidad sale del JWT
// del Authorization header, nunca del body. La service_role vive solo
// aquí, en el servidor.
//
// auth.admin.deleteUser() borra la fila de auth.users y de ahí caen en
// cascada profiles, events, event_participants, friendships, groups
// creados, group_members, messages, badges, point_events y blocks.
// Storage no cae en cascada, así que la carpeta del avatar se borra
// explícitamente antes.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const APP_ORIGIN = Deno.env.get("APP_ORIGIN") ?? "*";

// El origen de la app nativa no es configurable por secreto: lo fija
// Capacitor y es siempre el mismo. Sin admitirlo aquí, CORS solo dejaba
// pasar al sitio web y la app de iOS —que llama a esta misma función—
// se quedaba sin poder borrar la cuenta ("Failed to send a request to
// the Edge Function", que es como supabase-js reporta un fetch bloqueado
// por CORS, no un error de la función).
const NATIVE_ORIGINS = ["capacitor://localhost", "http://localhost"];

function resolveOrigin(req: Request): string {
  if (APP_ORIGIN === "*") return "*";
  const origin = req.headers.get("Origin") ?? "";
  return origin === APP_ORIGIN || NATIVE_ORIGINS.includes(origin) ? origin : APP_ORIGIN;
}

serve(async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": resolveOrigin(req),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  // Validar el JWT con la anon key: no hace falta la service_role para esto.
  const jwt = authHeader.slice("Bearer ".length);
  const anon = createClient(SUPABASE_URL, ANON_KEY);
  const { data: { user }, error: authError } = await anon.auth.getUser(jwt);
  if (authError || !user) return json({ error: "Unauthorized" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  // 1. Avatares del usuario (Storage no se borra en cascada).
  const { data: files } = await admin.storage.from("avatars").list(user.id);
  if (files?.length) {
    await admin.storage
      .from("avatars")
      .remove(files.map((f) => `${user.id}/${f.name}`));
  }

  // 2. La cuenta. El resto cae por CASCADE desde auth.users.
  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    console.error("deleteUser failed", user.id, deleteError.message);
    return json({ error: "DELETE_FAILED" }, 500);
  }

  return json({ deleted: true });
});
