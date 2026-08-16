# Publicar ConnectTec en la App Store (iOS)

La app es una **PWA** que se empaqueta como app nativa con **Capacitor**. El proyecto
JS ya está preparado (deps + `capacitor.config.ts` + scripts). Faltan pasos que dependen
de tu Mac y de tu cuenta de Apple.

---

## 0. Prerrequisitos (los instalas tú, una vez)

Este Mac hoy **no** los tiene:

1. **Xcode** (completo, no solo Command Line Tools) — desde la **Mac App Store** (~15 GB).
   Luego apúntalo como toolchain activa:
   ```bash
   sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
   sudo xcodebuild -license accept
   ```
2. **CocoaPods**:
   ```bash
   sudo gem install cocoapods
   ```
3. **Cuenta de Apple Developer Program** (ya la tienes ✅) — inicia sesión en
   Xcode → Settings → Accounts.

Verifica que quedó todo:
```bash
xcodebuild -version && pod --version
```

---

## 1. Confirma el Bundle ID

En `capacitor.config.ts`, `appId` es `mx.tec.connecttec`. Es el identificador que
registrarás en Apple. **Decídelo ahora** — cambiarlo después de crear el proyecto iOS
obliga a regenerarlo. Debe ser DNS inverso y único.

---

## 2. Genera el proyecto iOS

```bash
cd ~/Developer/tec-spotter-app
npx cap add ios     # crea la carpeta ios/ y corre pod install
npm run ios:sync    # build web + copia el dist al proyecto nativo
```

> `ios:sync` = `npm run build && npx cap sync ios`. Córrelo **cada vez** que cambies
> el código web.

Commitea la carpeta `ios/` (es la recomendación de Capacitor para no perder la config nativa).

---

## 3. Configura capacidades nativas (Info.plist)

Abre el proyecto: `npm run ios:open`. En Xcode, target **App → Info**, agrega:

- **`NSLocationWhenInUseUsageDescription`** (OBLIGATORIO — la app usa el GPS para el mapa
  y el check-in):
  > "ConnectTec usa tu ubicación para mostrarte eventos cercanos y validar tu asistencia."

Sin esta clave, iOS mata la app al pedir ubicación **y** Apple rechaza el envío.

---

## 4. Social login (Apple + Google) — setup

El código ya está implementado: en iOS nativo se usa el plugin
`@capgo/capacitor-social-login` (sign-in nativo → `signInWithIdToken` de Supabase,
sin el redirect que se rompe en el webview). Falta la config de cuentas/proveedores.

### 4.1 Sign in with Apple (obligatorio si ofreces Google — guideline 4.8)
1. **Xcode** (`npm run ios:open`) → target **App → Signing & Capabilities** →
   **+ Capability → "Sign in with Apple"**. Esto añade el entitlement y registra la
   capability en tu App ID del portal de Apple Developer.
2. **Supabase** → Authentication → Providers → **Apple** → activar. En *Authorized Client IDs*
   agrega tu Bundle ID: `mx.tec.connecttec`. (Para el flujo nativo por idToken basta el
   Bundle ID; el Services ID/secret solo hace falta para Apple en web.)

### 4.2 Google Sign-In nativo
1. **Google Cloud** → Credentials → crea **dos** OAuth Client IDs:
   - Tipo **iOS** → Bundle ID `mx.tec.connecttec`. Copia el *iOS client ID*.
   - Tipo **Web** → copia el *Web client ID* (y su secret, para Supabase).
2. **Env vars** (se hornean en el build; ponlas ANTES de `npm run ios:sync`):
   ```
   VITE_GOOGLE_IOS_CLIENT_ID=xxxx.apps.googleusercontent.com
   VITE_GOOGLE_WEB_CLIENT_ID=yyyy.apps.googleusercontent.com
   ```
   Sin ambas, el botón de Google en iOS no se muestra (Apple sí aparece igual).
3. **Info.plist** → agrega el URL scheme del *iOS client ID invertido* (para el callback):
   ```xml
   <key>CFBundleURLTypes</key>
   <array><dict><key>CFBundleURLSchemes</key>
     <array><string>com.googleusercontent.apps.xxxx</string></array>
   </dict></array>
   ```
4. **Supabase** → Providers → **Google** → activar, y en *Authorized Client IDs* agrega
   **ambos** (iOS y Web) para que `signInWithIdToken` acepte el token del dispositivo.

### 4.3 Google en web
Client ID/Secret **Web** en Supabase (Providers → Google) + redirect
`https://<proyecto>.supabase.co/auth/v1/callback` en Google Cloud. La Redirect URL de la
app ya está configurada.

> **Nota (nonce):** si el sign-in de Apple falla con error de *nonce*, es un mismatch entre
> el token del plugin y Supabase; se resuelve pasando el mismo nonce a ambos. Para
> email/contraseña y Google no aplica.

El login por **email/contraseña funciona sin nada de lo anterior**.

---

## 5. Íconos y splash

```bash
npm install -D @capacitor/assets
# coloca un icon.png (1024x1024) y splash.png (2732x2732) en assets/
npx capacitor-assets generate --ios
```

---

## 6. Ejecutar y firmar

1. En Xcode, target **App → Signing & Capabilities** → selecciona tu **Team** (tu cuenta
   Apple Developer). Xcode gestiona el provisioning automáticamente.
2. Corre en un simulador o en tu iPhone conectado (Cmd+R) para probar.

---

## 7. App Store Connect y envío

1. En **appstoreconnect.apple.com** → Apps → **+** → crea la app con el mismo Bundle ID.
2. Rellena ficha: nombre, descripción, categoría, política de privacidad (URL obligatoria),
   capturas de pantalla (usa el simulador), y el **cuestionario de privacidad**
   (declara: ubicación, correo, contenido de usuario).
3. En Xcode: **Product → Archive** → **Distribute App → App Store Connect → Upload**.
4. En App Store Connect, asigna el build a la versión y envía a **revisión**.

### Notas de revisión de Apple para esta app
- Apple pide justificar el uso de ubicación → el texto del Info.plist debe ser claro.
- Si dejas el login con Google, Apple **exige** también ofrecer **Sign in with Apple**
  (guideline 4.8). Por eso, para el primer envío, lo más simple es email+contraseña solo.
- Ten a la mano una **cuenta de prueba @tec.mx** para los revisores (el registro está
  restringido a correos del Tec).

---

## Resumen de comandos (cuando ya tengas Xcode + CocoaPods)

```bash
cd ~/Developer/tec-spotter-app
npx cap add ios
npm run ios:sync
npm run ios:open
# …firmar y archivar desde Xcode
```
