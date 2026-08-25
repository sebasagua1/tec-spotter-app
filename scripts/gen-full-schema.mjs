#!/usr/bin/env node
/**
 * Genera supabase/setup/full_schema.sql a partir de supabase/migrations/.
 *
 * Existe porque el consolidado se ensambló a mano una vez (2026-08-16) y
 * después nadie lo volvió a tocar: se quedó diez migraciones atrás, y quien
 * levantara un proyecto nuevo desde él se encontraba una base sin aislamiento
 * por institución, sin push y sin el arreglo de RLS de las insignias.
 *
 * Uso:
 *   node scripts/gen-full-schema.mjs           escribe el archivo
 *   node scripts/gen-full-schema.mjs --check   solo comprueba que está al día
 *
 * Las tres reglas que aplica —copiadas del archivo hecho a mano, no
 * inventadas— están explicadas en cada punto de abajo.
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR_MIGRACIONES = join(raiz, 'supabase/migrations');
const DESTINO = join(raiz, 'supabase/setup/full_schema.sql');

const PLACEHOLDER_REALTIME =
  '-- =========================\n' +
  '-- [bloque realtime.messages omitido en el consolidado — aplicar aparte si se requiere]\n';

/**
 * Parte un archivo SQL en sentencias.
 *
 * No vale con `split(';')`: las funciones llevan cuerpos entre `$$ ... $$`
 * llenos de puntos y coma, y partir por ahí destroza cada CREATE FUNCTION del
 * repo. Hay que reconocer comillas, comentarios y dólar-comillas.
 *
 * Cada trozo devuelto incluye lo que lo precede (comentarios y líneas en
 * blanco), así que descartar una sentencia se lleva por delante su propio
 * encabezado de comentario, que es justo lo que hace falta.
 */
function partirEnSentencias(sql) {
  const trozos = [];
  let inicio = 0;
  let i = 0;

  while (i < sql.length) {
    const dos = sql.slice(i, i + 2);

    if (dos === '--') {                                   // comentario de línea
      const fin = sql.indexOf('\n', i);
      i = fin === -1 ? sql.length : fin + 1;
      continue;
    }
    if (dos === '/*') {                                   // comentario de bloque
      const fin = sql.indexOf('*/', i + 2);
      i = fin === -1 ? sql.length : fin + 2;
      continue;
    }
    if (sql[i] === "'") {                                 // cadena
      i++;
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") { i += 2; continue; }
        if (sql[i] === "'") { i++; break; }
        i++;
      }
      continue;
    }
    if (sql[i] === '$') {                                 // dólar-comilla: $$ o $tag$
      const m = /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/.exec(sql.slice(i));
      if (m) {
        const etiqueta = m[0];
        const cierre = sql.indexOf(etiqueta, i + etiqueta.length);
        i = cierre === -1 ? sql.length : cierre + etiqueta.length;
        continue;
      }
    }
    if (sql[i] === ';') {
      trozos.push(sql.slice(inicio, i + 1));
      inicio = i + 1;
      i++;
      continue;
    }
    i++;
  }

  const resto = sql.slice(inicio);
  if (resto.trim()) trozos.push(resto);
  return trozos;
}

/** El SQL de verdad de un trozo, sin sus comentarios ni espacios de delante. */
function sentenciaDesnuda(trozo) {
  let s = trozo;
  let antes;
  do {
    antes = s;
    s = s.replace(/^\s+/, '').replace(/^--[^\n]*\n?/, '').replace(/^\/\*[\s\S]*?\*\//, '');
  } while (s !== antes);
  return s;
}

function procesarMigracion(nombre, sql) {
  let trozos = partirEnSentencias(sql);

  // REGLA 1 — Fuera los bloques de comprobación del final.
  //
  // Casi todas las migraciones terminan con uno o varios SELECT de
  // diagnóstico ("debe salir UNA fila..."), pensados para pegarlas sueltas en
  // el SQL Editor. En el consolidado sobran: no crean nada y llenarían la
  // pantalla de resultados.
  //
  // Dos trampas, las dos descubiertas comparando contra el archivo hecho a
  // mano, y las dos silenciosas:
  //
  //  · NO se busca la palabra "comprobación": aparece también en prosa, en un
  //    comentario de institution-isolation.sql, y recortar por ahí se llevaba
  //    por delante la constraint profiles_institution_required.
  //
  //  · NO vale "la última sentencia es un SELECT". `SELECT cron.schedule(...)`
  //    también lo es, y no diagnostica nada: es lo que PROGRAMA la limpieza de
  //    mensajes caducados. Con esa regla desaparecía del consolidado y el
  //    purgado no se creaba nunca.
  //
  // Así que se exige que el SELECT lea de una fuente de introspección
  // (pg_*, information_schema.*, cron.job). Un SELECT que llama a una función
  // no encaja, y se queda.
  const esIntrospeccion = (s) =>
    /^SELECT\b/i.test(s) &&
    /\b(FROM|JOIN)\s+(pg_[a-z_]+|information_schema\.[a-z_]+|cron\.job)\b/i.test(s);

  while (trozos.length) {
    const ultima = sentenciaDesnuda(trozos[trozos.length - 1]);
    // Un trozo que solo es comentario NO se toca: varias migraciones cierran
    // con bloques "OPCIONAL (no se ejecuta)" que documentan limpiezas
    // manuales. Son documentación, y valen.
    if (!ultima.trim()) break;
    if (esIntrospeccion(ultima)) { trozos.pop(); continue; }
    break;
  }

  // REGLA 2 — Fuera la RLS sobre realtime.messages.
  //
  // Es una tabla interna de Supabase y el SQL Editor no es su dueño, así que
  // el bloque falla al pegarlo. El realtime por postgres_changes sigue
  // funcionando vía la RLS de las tablas public.*. Ya venía omitido en el
  // archivo hecho a mano; aquí solo se reproduce la decisión.
  let yaAvisado = false;
  trozos = trozos.flatMap((t) => {
    if (!/realtime\.messages/.test(t)) return [t];
    if (yaAvisado) return [];
    yaAvisado = true;
    return ['\n' + PLACEHOLDER_REALTIME];
  });

  return `\n-- >>> ${nombre} <<<\n${trozos.join('').replace(/^\n+/, '\n')}`;
}

function generar() {
  const migraciones = readdirSync(DIR_MIGRACIONES).filter((f) => f.endsWith('.sql')).sort();

  const cabecera =
    '-- ============================================================\n' +
    '-- Always Connected — esquema completo (consolidado de migrations/)\n' +
    '-- Pegar en el SQL Editor de un proyecto Supabase NUEVO y ejecutar.\n' +
    '--\n' +
    '-- NO EDITAR A MANO: lo genera scripts/gen-full-schema.mjs.\n' +
    `-- Migraciones incluidas: ${migraciones.length} (hasta ${migraciones[migraciones.length - 1]}).\n` +
    '--\n' +
    '-- NOTA: se omite el bloque de RLS sobre realtime.messages (tabla\n' +
    '-- interna de Supabase) porque el SQL Editor no es su dueño. El\n' +
    '-- realtime por postgres_changes funciona igual vía la RLS de las\n' +
    '-- tablas public.* y la publicación supabase_realtime. Ver README.\n' +
    '--\n' +
    '-- Los SELECT de comprobación que cierran cada migración se omiten\n' +
    '-- aquí: son para ejecutarlas sueltas, no para el arranque.\n' +
    '-- ============================================================\n';

  const cuerpo = migraciones
    .map((f) => procesarMigracion(f, readFileSync(join(DIR_MIGRACIONES, f), 'utf8')))
    .join('\n');

  return { texto: cabecera + cuerpo.replace(/\n{4,}/g, '\n\n\n') + '\n', migraciones };
}

const { texto, migraciones } = generar();

if (process.argv.includes('--check')) {
  const actual = readFileSync(DESTINO, 'utf8');
  if (actual === texto) {
    console.log(`full_schema.sql al día (${migraciones.length} migraciones).`);
    process.exit(0);
  }
  console.error(
    'full_schema.sql NO está al día con supabase/migrations/.\n' +
    'Regenéralo con:  node scripts/gen-full-schema.mjs'
  );
  process.exit(1);
}

writeFileSync(DESTINO, texto);
console.log(`Escrito ${DESTINO}`);
console.log(`  ${migraciones.length} migraciones, ${texto.split('\n').length} líneas.`);
