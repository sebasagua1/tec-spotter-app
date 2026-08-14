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

## 4. ⚠️ Gotcha importante: login con Google en el webview

En web, el OAuth usa `redirectTo: window.location.origin`. Dentro de la app nativa el
origin es `capacitor://localhost`, así que el redirect de Google **no volverá solo** a la
app. Tienes dos caminos:

- **Recomendado:** usa `@capacitor/browser` + un **deep link** (URL scheme propio) y
  registra ese redirect en Supabase (Auth → URL Configuration) y en Google Cloud.
- **Alternativa rápida para el primer envío:** oculta el botón de Google en nativo y deja
  solo email+contraseña (que sí funciona tal cual). Detecta la plataforma con
  `Capacitor.isNativePlatform()`.

El login por **email/contraseña funciona sin cambios** en nativo.

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
