# Deploy — ConnectTec

Guía reproducible para publicar la app. Dos plataformas: **Supabase** (backend) y
**Vercel** (frontend). Requiere que hayas hecho login en ambos CLIs / dashboards.

---

## 1. Supabase (backend)

### 1.1 Linkear el proyecto (una sola vez)
```bash
supabase link --project-ref tcajllgflxpfzjkyvtbq
```

### 1.2 Aplicar migraciones a producción
Incluye la restricción de correo institucional (`20260725000000_restrict-tec-email-domain.sql`).
```bash
supabase db push
```
> Verifica en el SQL Editor que existe el trigger `trg_enforce_tec_email` sobre `auth.users`.

### 1.3 Desplegar la Edge Function y sus secretos
```bash
supabase functions deploy delete-account
supabase secrets set APP_ORIGIN=https://TU-DOMINIO.vercel.app
```
> `APP_ORIGIN` fija el CORS de la función. Sin él usa `*` (menos seguro).
> El token de Mapbox NO va aquí: es público y viaja en el bundle vía
> `VITE_MAPBOX_TOKEN`. Se restringe por dominio desde el panel de Mapbox.

### 1.4 Configurar Auth (Dashboard → Authentication)
- **URL Configuration** → agrega la URL de producción a *Site URL* y *Redirect URLs*
  (ej. `https://TU-DOMINIO.vercel.app`). Sin esto, el login con Google falla en prod.
- **Providers → Google** → activa el proveedor y pega tu Client ID / Secret de Google Cloud.
- (Opcional) **Email** → decide si exiges verificación de correo antes de iniciar sesión.

---

## 2. Vercel (frontend)

### 2.1 Variables de entorno
Project → Settings → Environment Variables (marca *Production* y *Preview*):

| Variable | Valor |
|---|---|
| `VITE_SUPABASE_URL` | `https://tcajllgflxpfzjkyvtbq.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | tu **anon/public** key (nunca la service_role) |
| `VITE_SUPABASE_PROJECT_ID` | `tcajllgflxpfzjkyvtbq` |
| `VITE_MAPBOX_TOKEN` | tu token público de Mapbox (`pk...`) |

### 2.2 Build (Vercel lo detecta solo)
- Build Command: `npm run build`
- Output Directory: `dist`
- `vercel.json` ya define el rewrite SPA, las cabeceras de seguridad (CSP con Supabase +
  Mapbox) y el caché de assets.

### 2.3 Desplegar
Push a `main` (deploy automático) o:
```bash
vercel --prod
```

---

## 3. Verificación post-deploy

- [ ] Registro con un correo **@tec.mx** funciona; con un **@gmail.com** es rechazado.
- [ ] Login con Google funciona (redirect correcto).
- [ ] El mapa carga (token de Mapbox OK, vía env var o edge function).
- [ ] El service worker se registra sin 404 (`/sw.js` existe en el deploy).
- [ ] Realtime: al crear un evento en una pestaña, aparece en otra.

---

## 4. Camino a la App Store (iOS)

La app es una **PWA**; para publicarla en la App Store hay que envolverla en un
contenedor nativo. Ruta recomendada con **Capacitor**:

```bash
npm install @capacitor/core @capacitor/ios
npm install -D @capacitor/cli
npx cap init ConnectTec mx.tec.connecttec --web-dir=dist
npm run build && npx cap add ios && npx cap sync
npx cap open ios   # abre Xcode
```
Luego en Xcode: firma con tu cuenta de **Apple Developer Program**, configura íconos y
splash, y sube con **Archive → Distribute App**.
