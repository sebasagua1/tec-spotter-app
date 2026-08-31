// Las páginas legales son HTML estático servido por Vercel (rewrites en
// vercel.json). Se enlazan con URL absoluta a propósito: dentro del webview
// de Capacitor el origen es capacitor://localhost, donde una ruta relativa
// como /privacy no existe.
export const SITE_URL = 'https://alwaysconnected.vercel.app';
const SITE = SITE_URL;

export const PRIVACY_URL = `${SITE}/privacy`;
export const TERMS_URL = `${SITE}/terms`;

// Apple exige una *Support URL* en la ficha de la App Store, y tiene que ser
// una URL: un mailto: no se acepta. Esta es la que va ahí.
export const SUPPORT_URL = `${SITE}/support`;

// Contacto de moderación. Apple exige un canal publicado para reportar
// contenido y actuar en menos de 24 h (guideline 1.2).
export const SUPPORT_EMAIL = 'sebasagua4@gmail.com';
