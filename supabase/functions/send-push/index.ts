// Envío de notificaciones push por APNs con autenticación por token (.p8).
//
// Quién puede llamar:
//   · Con la service_role (o sea, desde la propia base): puede enviar a
//     cualquier user_id. Es la vía que usarán los disparadores.
//   · Con el JWT de una persona: solo puede enviarse a SÍ MISMA. Sirve para
//     probar desde la app sin abrir un agujero.
//
// El .p8 nunca sale de los secretos de Supabase.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const APP_ORIGIN = Deno.env.get("APP_ORIGIN") ?? "*";

const APNS_KEY_ID = Deno.env.get("APNS_KEY_ID")!;
const APNS_TEAM_ID = Deno.env.get("APNS_TEAM_ID")!;
const APNS_BUNDLE_ID = Deno.env.get("APNS_BUNDLE_ID") ?? "mx.tec.connecttec";
const APNS_PRIVATE_KEY = Deno.env.get("APNS_PRIVATE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": APP_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// ---------------------------------------------------------------- JWT ES256

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function pemToPkcs8(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

// APNs acepta el mismo token durante una hora y se molesta si se regenera muy
// seguido, así que se reutiliza mientras siga fresco.
let cachedJwt: { value: string; madeAt: number } | null = null;
const JWT_TTL_MS = 45 * 60 * 1000;

async function apnsJwt(): Promise<string> {
  if (cachedJwt && Date.now() - cachedJwt.madeAt < JWT_TTL_MS) return cachedJwt.value;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(APNS_PRIVATE_KEY),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );

  const enc = new TextEncoder();
  const header = b64url(enc.encode(JSON.stringify({ alg: "ES256", kid: APNS_KEY_ID })));
  const payload = b64url(
    enc.encode(JSON.stringify({ iss: APNS_TEAM_ID, iat: Math.floor(Date.now() / 1000) })),
  );
  // WebCrypto firma ECDSA en formato r||s, que es justo lo que espera ES256.
  const sig = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(`${header}.${payload}`)),
  );

  const value = `${header}.${payload}.${b64url(sig)}`;
  cachedJwt = { value, madeAt: Date.now() };
  return value;
}

// ---------------------------------------------------------------- APNs

const HOSTS = {
  production: "https://api.push.apple.com",
  sandbox: "https://api.sandbox.push.apple.com",
};

type SendResult = { token: string; ok: boolean; status: number; reason?: string };

async function pushTo(
  host: string,
  token: string,
  jwt: string,
  payload: unknown,
): Promise<{ status: number; reason?: string }> {
  const res = await fetch(`${host}/3/device/${token}`, {
    method: "POST",
    headers: {
      authorization: `bearer ${jwt}`,
      "apns-topic": APNS_BUNDLE_ID,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (res.status === 200) return { status: 200 };
  let reason: string | undefined;
  try {
    reason = (await res.json())?.reason;
  } catch {
    reason = undefined;
  }
  return { status: res.status, reason };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  if (!APNS_KEY_ID || !APNS_TEAM_ID || !APNS_PRIVATE_KEY) {
    return json({ error: "APNs no configurado: faltan secretos" }, 500);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
  const bearer = authHeader.slice("Bearer ".length);

  let body: { user_id?: string; title?: string; body?: string; data?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body inválido" }, 400);
  }
  if (!body.title || !body.body) return json({ error: "Faltan title y body" }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

  // Quién manda decide a quién se puede enviar.
  let targetUserId: string;
  if (bearer === SERVICE_ROLE) {
    if (!body.user_id) return json({ error: "Falta user_id" }, 400);
    targetUserId = body.user_id;
  } else {
    const anon = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error } = await anon.auth.getUser();
    if (error || !userData.user) return json({ error: "Unauthorized" }, 401);
    // Con JWT de persona el destinatario es siempre quien llama, aunque el
    // body diga otra cosa.
    targetUserId = userData.user.id;
  }

  const { data: tokens, error: tokErr } = await admin
    .from("device_tokens")
    .select("token")
    .eq("user_id", targetUserId);
  if (tokErr) return json({ error: tokErr.message }, 500);
  if (!tokens?.length) return json({ sent: 0, results: [], note: "Sin dispositivos registrados" });

  const jwt = await apnsJwt();
  const payload = {
    aps: { alert: { title: body.title, body: body.body }, sound: "default" },
    ...(body.data ?? {}),
  };

  const results: SendResult[] = [];
  for (const { token } of tokens) {
    // Producción primero; si el token es de un build de desarrollo, APNs
    // responde BadDeviceToken y se reintenta en sandbox. Así la misma función
    // sirve para tu iPhone de pruebas y para TestFlight sin configurar nada.
    let r = await pushTo(HOSTS.production, token, jwt, payload);
    if (r.status === 400 && r.reason === "BadDeviceToken") {
      r = await pushTo(HOSTS.sandbox, token, jwt, payload);
    }

    // 410 Unregistered = la app se desinstaló. Se limpia para no arrastrar
    // tokens muertos que fallan en cada envío.
    if (r.status === 410 || r.reason === "Unregistered") {
      await admin.from("device_tokens").delete().eq("token", token);
    }

    results.push({ token: token.slice(0, 8) + "…", ok: r.status === 200, status: r.status, reason: r.reason });
  }

  return json({ sent: results.filter((r) => r.ok).length, results });
});
