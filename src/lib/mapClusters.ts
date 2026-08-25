/**
 * Agrupación de marcadores por rejilla de pantalla.
 *
 * Con muchos eventos el mapa se vuelve inservible por dos motivos a la vez: no
 * se distingue nada porque los pines se solapan, y Mapbox tiene que recalcular
 * la posición de cada marcador en cada fotograma del desplazamiento.
 *
 * Se agrupa en el ESPACIO DE PANTALLA y no en el geográfico a propósito: lo que
 * molesta es que dos pines se pisen a la vista, y eso depende del zoom. Dos
 * eventos a cien metros se estorban de lejos y no se estorban de cerca; una
 * rejilla en grados no sabría distinguir esos dos casos.
 */

/** Lado de la celda, en puntos de pantalla. Un pin mide 36. */
export const CLUSTER_CELL_PX = 64;

/**
 * Por encima de este zoom no se agrupa nada.
 *
 * Sin este tope, dos eventos en la misma coordenada exacta formarían un racimo
 * imposible de deshacer por mucho que te acercaras. Y a este nivel de detalle
 * ya estás mirando un edificio concreto: ahí quieres verlo todo.
 */
export const CLUSTER_MAX_ZOOM = 17;

/**
 * Tope de eventos que se piden para el mapa.
 *
 * Sin límite, la consulta se comía el corte que Supabase pone en 1.000 filas, y
 * mil marcadores en un webview no se ralentizan: se quedan clavados.
 */
export const MAX_MAP_EVENTS = 500;

export interface ScreenPoint {
  id: string;
  x: number;
  y: number;
}

export interface Cluster {
  /** Identifica la celda; sirve de clave de caché del marcador del racimo. */
  key: string;
  ids: string[];
}

/**
 * Reparte los puntos en celdas de `cellPx`.
 *
 * Devuelve TODAS las celdas, también las de un solo punto: quien llama decide
 * qué hacer con cada una. El orden es el de aparición de la primera celda, así
 * que dos llamadas con la misma entrada dan lo mismo.
 */
export function clusterByGrid(points: ScreenPoint[], cellPx: number = CLUSTER_CELL_PX): Cluster[] {
  // Una celda de tamaño inválido agruparía todo en una, o dividiría por cero.
  if (!Number.isFinite(cellPx) || cellPx <= 0) {
    return points.map((p) => ({ key: p.id, ids: [p.id] }));
  }

  const celdas = new Map<string, string[]>();
  for (const p of points) {
    // Un punto sin proyectar (fuera del globo, o con coordenadas rotas) se
    // descarta en vez de caer todo en la celda "NaN:NaN".
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    const key = `${Math.floor(p.x / cellPx)}:${Math.floor(p.y / cellPx)}`;
    const celda = celdas.get(key);
    if (celda) celda.push(p.id);
    else celdas.set(key, [p.id]);
  }

  return [...celdas].map(([key, ids]) => ({ key, ids }));
}

export interface PlanInput {
  id: string;
  /** Tiene sitio y una categoría conocida: puede llegar a tener marcador. */
  placeable: boolean;
  /** Además pasa el filtro de categoría y búsqueda. */
  passesFilter: boolean;
  /** Su posición en pantalla, ya proyectada por el mapa. */
  x: number;
  y: number;
}

export interface MarkerPlan {
  /** Los que se dibujan sueltos ahora mismo. */
  loose: Set<string>;
  /** Los racimos, con sus miembros. */
  clusters: Cluster[];
  /**
   * Los que merecen conservar su marcador, se vean o no.
   *
   * Es más ancho que `loose` a propósito, y es la parte que se puede escapar:
   * quedar oculto por el filtro o dentro de un racimo NO es motivo para
   * destruir un marcador, porque volvería a hacer falta en cuanto se borre el
   * buscador o se acerque el mapa. Solo desaparecer de la lista lo destruye.
   */
  cached: Set<string>;
}

/**
 * Decide, para una pasada, qué se ve suelto, qué se agrupa y qué se conserva.
 *
 * Está aquí y no dentro del componente porque es lo único de todo el dibujado
 * que puede fallar en silencio: un marcador de más o de menos no lanza ningún
 * error, solo hace que el mapa parpadee o que falte un pin.
 */
export function planMarkers(
  items: PlanInput[],
  zoom: number,
  cellPx: number = CLUSTER_CELL_PX,
): MarkerPlan {
  const cached = new Set<string>();
  const candidatos: ScreenPoint[] = [];

  for (const it of items) {
    if (!it.placeable) continue;
    cached.add(it.id);
    if (it.passesFilter) candidatos.push({ id: it.id, x: it.x, y: it.y });
  }

  // Muy de cerca no se agrupa: cada uno va por su cuenta.
  const grupos =
    zoom >= CLUSTER_MAX_ZOOM
      ? candidatos.map((p) => ({ key: p.id, ids: [p.id] }))
      : clusterByGrid(candidatos, cellPx);

  const loose = new Set<string>();
  const clusters: Cluster[] = [];
  for (const g of grupos) {
    if (g.ids.length === 1) loose.add(g.ids[0]);
    else clusters.push(g);
  }

  return { loose, clusters, cached };
}
