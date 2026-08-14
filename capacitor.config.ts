import type { CapacitorConfig } from '@capacitor/cli';

// NOTA: `appId` es el Bundle ID que registrarás en tu cuenta de
// Apple Developer. Cámbialo si prefieres otro identificador; debe
// ser único y en formato DNS inverso. Una vez creado el proyecto
// iOS, cambiarlo implica regenerarlo, así que decídelo antes de
// correr `npx cap add ios`.
const config: CapacitorConfig = {
  appId: 'mx.tec.connecttec',
  appName: 'ConnectTec',
  webDir: 'dist',
};

export default config;
