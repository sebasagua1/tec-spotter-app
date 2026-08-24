/**
 * Identidad de la app. Este archivo es la ÚNICA fuente del nombre.
 *
 * Lo consumen tres capas distintas, porque ninguna cubre a las otras:
 *   1. Runtime  — componentes y i18n, importando de aquí.
 *   2. Build    — index.html y el manifest, vía el plugin de vite.config.ts
 *                 (por eso este archivo no puede importar nada del navegador:
 *                 también se carga en Node al construir).
 *   3. Nativo   — ios/App/App/Brand.xcconfig, que Vite no alcanza. Si cambias
 *                 el nombre aquí, cámbialo también allí.
 */

/** Nombre completo de la marca. */
export const APP_NAME = 'Always Connected';

/**
 * Nombre corto para donde el espacio manda: la pantalla de inicio de iOS corta
 * sobre los 12 caracteres, y `short_name` del manifest existe justo para esto.
 */
export const APP_SHORT_NAME = 'Always';

/**
 * Título de pestaña de una página: "Perfil — Always Connected".
 * Sin argumento devuelve solo la marca, para la portada.
 */
export const pageTitle = (section?: string): string =>
  section ? `${section} — ${APP_NAME}` : APP_NAME;
