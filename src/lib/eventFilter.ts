import type { MapEvent } from '@/stores/eventStore';

/**
 * Qué eventos se enseñan, según la categoría elegida y lo escrito en el
 * buscador.
 *
 * Vive aquí y no en cada pantalla porque lo usan dos: los marcadores del mapa
 * y la vista de lista. Escrito por duplicado, cualquier retoque en uno dejaba
 * al otro enseñando algo distinto sobre los mismos datos.
 */
export interface EventFilter {
  category: string | null;
  /** Tal cual lo escribe la persona; aquí se normaliza. */
  query: string;
}

export const matchesFilter = (event: MapEvent, { category, query }: EventFilter): boolean => {
  if (category && event.category !== category) return false;
  const q = query.trim().toLowerCase();
  return !q || event.title.toLowerCase().includes(q);
};

export const filterEvents = (events: MapEvent[], filter: EventFilter): MapEvent[] =>
  events.filter((e) => matchesFilter(e, filter));
