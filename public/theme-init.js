// Enciende el modo oscuro ANTES del primer pintado. El resto (cambios en
// vivo) está en src/lib/theme.ts.
//
// Por qué es un archivo aparte y no un <script> en línea dentro de
// index.html, que sería lo natural: la CSP que sirve Vercel lleva
// `script-src 'self'` sin 'unsafe-inline', así que el navegador BLOQUEABA el
// script en línea y el anti-fogonazo no funcionaba en la web (en el webview
// de Capacitor sí, porque allí no hay esa cabecera). Se descartó meter el
// hash sha256 del script en vercel.json: cualquiera que tocara una coma aquí
// lo invalidaba y el modo oscuro volvía a romperse en silencio.
//
// Va cargado sin `defer` ni `async` a propósito: bloquea el pintado, que es
// justo lo que hace falta para que no se vea el fondo claro un instante.
try {
  if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    document.documentElement.classList.add('dark');
  }
} catch (e) {}
