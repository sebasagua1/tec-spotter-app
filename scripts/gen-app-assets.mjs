// Genera los assets fuente (icon + splash) para @capacitor/assets.
// Diseño: marca Always Connected — azul #003DA5 + pin de ubicación blanco.
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const BRAND = '#003DA5';
const LIGHT_BG = '#F5F7FA';
const DARK_BG = '#0B1220';

// Pin de ubicación (Material "place"), sub-path con hueco (fill-rule evenodd).
const PIN = 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z';

// Ícono: pin blanco a sangre sobre fondo azul (sin transparencia, requisito de la App Store).
const icon = `<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <rect width="1024" height="1024" fill="${BRAND}"/>
  <path transform="translate(224,224) scale(24)" fill="#ffffff" fill-rule="evenodd" d="${PIN}"/>
</svg>`;

// Splash: logo (cuadro redondeado azul + pin) centrado sobre fondo de marca.
const splash = (bg) => `<svg width="2732" height="2732" viewBox="0 0 2732 2732" xmlns="http://www.w3.org/2000/svg">
  <rect width="2732" height="2732" fill="${bg}"/>
  <g transform="translate(1016,1016)">
    <rect width="700" height="700" rx="160" fill="${BRAND}"/>
    <path transform="translate(146,146) scale(17)" fill="#ffffff" fill-rule="evenodd" d="${PIN}"/>
  </g>
</svg>`;

mkdirSync('assets', { recursive: true });

const jobs = [
  ['assets/icon-only.png', icon, 1024],
  ['assets/splash.png', splash(LIGHT_BG), 2732],
  ['assets/splash-dark.png', splash(DARK_BG), 2732],
];

for (const [out, svg, size] of jobs) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(out);
  console.log('✓', out, size + 'x' + size);
}
