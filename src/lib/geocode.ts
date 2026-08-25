/**
 * Nombre legible de un punto del mapa (reverse geocoding de Mapbox).
 *
 * El formulario enseñaba las coordenadas crudas —"19.01234, -98.20123"— que
 * no le dicen nada a nadie. Aquí se traduce el pin a algo que una persona
 * reconoce: el nombre del sitio, o la calle si no hay sitio.
 *
 * Si falla, devuelve null y quien llama enseña una etiqueta neutra. NUNCA se
 * vuelve a caer en las coordenadas.
 */

const BASE = 'https://api.mapbox.com/geocoding/v5/mapbox.places';

export interface Feature {
  /** Nombre corto: "Biblioteca Central". */
  text?: string;
  /** Nombre largo con ciudad y país detrás. */
  place_name?: string;
  place_type?: string[];
}

export interface ReverseResponse {
  features?: Feature[];
}

/** Redondeo a ~11 m. Mover el dedo un píxel no justifica otra llamada. */
export const COORD_PRECISION = 4;

export const roundCoord = (n: number): number =>
  Number(n.toFixed(COORD_PRECISION));

export function buildReverseUrl(
  lng: number,
  lat: number,
  token: string,
  language = 'es',
): string {
  const params = new URLSearchParams({
    access_token: token,
    language,
    // El orden importa: Mapbox devuelve los tipos por relevancia y queremos
    // antes el nombre de un sitio que la dirección postal donde está.
    types: 'poi,address,place',
    limit: '1',
  });
  return `${BASE}/${roundCoord(lng)},${roundCoord(lat)}.json?${params}`;
}

/**
 * El nombre más útil de la respuesta.
 *
 * `text` es el nombre a secas ("Biblioteca Central"); `place_name` arrastra
 * ciudad, estado y país, que en un campo de una línea sobra. Se usa el
 * primer segmento del largo solo cuando no hay corto.
 */
export function pickPlaceName(data: ReverseResponse | null | undefined): string | null {
  const f = data?.features?.[0];
  if (!f) return null;
  const corto = f.text?.trim();
  if (corto) return corto;
  const largo = f.place_name?.split(',')[0]?.trim();
  return largo || null;
}

/** Memoria de la sesión: mover el pin y volver no repite la llamada. */
const cache = new Map<string, string | null>();

export const cacheKey = (lng: number, lat: number, language: string): string =>
  `${roundCoord(lng)},${roundCoord(lat)},${language}`;

/** Solo para los tests: deja el caché como recién arrancado. */
export const _clearCache = () => cache.clear();

export async function reverseGeocode(
  lng: number,
  lat: number,
  token: string,
  language = 'es',
  signal?: AbortSignal,
): Promise<string | null> {
  if (!token) return null;
  const clave = cacheKey(lng, lat, language);
  if (cache.has(clave)) return cache.get(clave) ?? null;

  try {
    const res = await fetch(buildReverseUrl(lng, lat, token, language), { signal });
    // Un 4xx no lanza en fetch: hay que mirar `ok` a mano o se intentaría
    // leer un cuerpo de error como si fuera una respuesta buena.
    if (!res.ok) return null;
    const nombre = pickPlaceName((await res.json()) as ReverseResponse);
    cache.set(clave, nombre);
    return nombre;
  } catch {
    // Red caída, petición cancelada o JSON roto: el pin sigue siendo válido,
    // solo nos quedamos sin nombre. No se cachea, para poder reintentar.
    return null;
  }
}
