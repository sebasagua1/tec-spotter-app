import { create } from 'zustand';

export interface MapEvent {
  id: string;
  creator_id: string;
  title: string;
  category: string;
  location: { lng: number; lat: number } | null;
  address: string | null;
  description: string | null;
  starts_at: string;
  ends_at: string;
  max_spots: number;
  current_spots: number;
  privacy: string;
  is_active: boolean;
  creator_name?: string;
  creator_avatar?: string;
  participants?: Array<{ user_id: string; name: string; avatar_url: string | null }>;
}

interface EventState {
  events: MapEvent[];
  /**
   * Se guarda el id y no el objeto. Guardando el objeto, la hoja abierta
   * enseñaba una copia congelada: si el aforo cambiaba por tiempo real había
   * que cerrarla y volver a abrirla para ver la cifra nueva. Quien lo consume
   * busca el evento en `events`, que sí se refresca.
   */
  selectedEventId: string | null;
  filterCategory: string | null;
  setEvents: (events: MapEvent[]) => void;
  addEvent: (event: MapEvent) => void;
  removeEvent: (id: string) => void;
  setSelectedEvent: (event: MapEvent | null) => void;
  setFilterCategory: (cat: string | null) => void;
}

export const useEventStore = create<EventState>((set) => ({
  events: [],
  selectedEventId: null,
  filterCategory: null,
  setEvents: (events) => set({ events }),
  addEvent: (event) => set((s) => ({ events: [event, ...s.events] })),
  // Al cancelar un evento hay que sacarlo del store a mano: los marcadores del
  // mapa son DOM imperativo que solo se reconstruye cuando cambia `events`, y
  // esperar al refetch por realtime deja el pin visible mientras tanto.
  removeEvent: (id) => set((s) => ({
    events: s.events.filter((e) => e.id !== id),
    selectedEventId: s.selectedEventId === id ? null : s.selectedEventId,
  })),
  // Sigue recibiendo el evento entero por comodidad de quien llama; lo que se
  // guarda es solo su id.
  setSelectedEvent: (event) => set({ selectedEventId: event?.id ?? null }),
  setFilterCategory: (filterCategory) => set({ filterCategory }),
}));

/**
 * El evento abierto, resuelto contra la lista viva. Es un selector y no un
 * campo del store precisamente para que no haya nada que se quede congelado:
 * cada render lo vuelve a buscar. Devuelve null si el evento ya no está —lo
 * cancelaron mientras lo mirabas—, con lo que la hoja se cierra sola.
 */
export const selectSelectedEvent = (s: EventState): MapEvent | null =>
  s.selectedEventId ? s.events.find((e) => e.id === s.selectedEventId) ?? null : null;
