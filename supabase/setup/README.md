# Levantar el backend en un proyecto Supabase nuevo

El proyecto original (creado por Lovable) fue **eliminado** (su dominio da NXDOMAIN),
así que hay que reconstruir el backend en un proyecto **tuyo**. Todo el esquema está
en `full_schema.sql` (consolidado de `../migrations/`).

## Pasos

1. **Crea el proyecto**: supabase.com/dashboard → **New Project**.
   - Elige tu organización, nombre (`ConnectTec`), una región cercana y guarda la
     **contraseña de la base** en un lugar seguro.

2. **Reconstruye el esquema**: cuando el proyecto esté listo, **SQL Editor** → pega el
   contenido completo de `full_schema.sql` → **Run**. Crea tablas, RLS, RPCs, triggers,
   sistema de puntos, bucket de avatars y realtime.

3. **Copia las credenciales**: Settings → **API** → toma:
   - **Project URL** (`https://XXXX.supabase.co`)
   - **anon public** key

4. **Repunta la app** con esos valores:
   - Local: `.env` → `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`.
   - Vercel: mismas 3 variables en Settings → Environment Variables → **Redeploy**.

5. **Auth → URL Configuration**:
   - Site URL: `https://tec-spotter-app.vercel.app`
   - Redirect URLs: `https://tec-spotter-app.vercel.app/**` y `http://localhost:8080/**`

6. *(Opcional)* **Google login en web**: Auth → Providers → Google (Client ID/Secret) y en
   Google Cloud agrega el callback `https://XXXX.supabase.co/auth/v1/callback`.

7. *(Opcional)* **Mapbox edge function**: solo si no usas `VITE_MAPBOX_TOKEN`. Con el token
   en las env vars, el mapa funciona sin la función.

## Nota
`full_schema.sql` es **generado** a partir de `../migrations/`. Si cambian las migraciones,
regenéralo. Los datos del proyecto viejo no se recuperan (empiezas limpio).
