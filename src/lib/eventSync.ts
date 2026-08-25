import type { MapEvent } from '@/stores/eventStore';
import type { Database } from '@/integrations/supabase/types';

export type EventRow = Database['public']['Tables']['events']['Row'];

/**
 * Reglas de la sincronización del mapa por tiempo real.
 *
 * La suscripción no vuelve a pedir la lista entera con cada cambio. Para que
 * eso sea seguro se sigue una regla, y todo lo de aquí existe para sostenerla:
 *
 *     el payload de tiempo real nunca CONCEDE visibilidad;
 *     solo actualiza o quita algo que PostgREST ya había concedido.
 *
 * De ese modo no hace falta dar por hecho que la RLS está aplicada sobre el
 * canal de realtime, cosa que desde el cliente no se puede comprobar.
 */

/** En la tabla lng y lat son columnas sueltas; MapEvent las espera juntas. */
export const toMapEvent = (e: EventRow): MapEvent => ({
  ...e,
  location: e.lng != null && e.lat != null ? { lng: e.lng, lat: e.lat } : null,
});

/**
 * Mismo instante aunque venga escrito distinto. PostgREST y el canal de tiempo
 * real no tienen por qué serializar el timestamp igual ("...+00:00" frente a
 * "...Z"), y comparar las cadenas a pelo daría distinto siempre — con lo que
 * la optimización no llegaría a aplicarse nunca.
 *
 * Si alguna de las dos no se puede interpretar como fecha se cae a comparar el
 * texto: ante la duda, distintas, que lleva a preguntar al servidor.
 */
export const sameInstant = (a: string, b: string): boolean => {
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  return Number.isNaN(ta) || Number.isNaN(tb) ? a === b : ta === tb;
};

/**
 * ¿Hay que preguntarle al servidor por esta fila, o basta con el payload?
 *
 * Se pregunta cuando:
 *
 *   · el evento no estaba en la lista — puede que ahora toque verlo o puede
 *     que no, y eso no lo decide el payload;
 *   · cambió `privacy` — depende de una amistad que aquí no se puede comprobar;
 *   · cambió `is_active` o `ends_at` — son justo los dos filtros de la consulta.
 *
 * En cualquier otro caso el evento ya era visible y lo sigue siendo, así que el
 * payload se aplica tal cual. Ahí cae el caso frecuente, `current_spots`, que
 * es el que hacía que un cambio en un evento moviera a todos los clientes.
 */
export const needsServerCheck = (
  known: MapEvent | undefined,
  row: Pick<EventRow, 'privacy' | 'is_active' | 'ends_at'>
): boolean =>
  !known ||
  known.privacy !== row.privacy ||
  known.is_active !== row.is_active ||
  !sameInstant(known.ends_at, row.ends_at);
