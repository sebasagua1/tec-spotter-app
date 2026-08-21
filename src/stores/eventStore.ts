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
  selectedEvent: MapEvent | null;
  filterCategory: string | null;
  setEvents: (events: MapEvent[]) => void;
  addEvent: (event: MapEvent) => void;
  removeEvent: (id: string) => void;
  setSelectedEvent: (event: MapEvent | null) => void;
  setFilterCategory: (cat: string | null) => void;
}

export const useEventStore = create<EventState>((set) => ({
  events: [],
  selectedEvent: null,
  filterCategory: null,
  setEvents: (events) => set({ events }),
  addEvent: (event) => set((s) => ({ events: [event, ...s.events] })),
  // Al cancelar un evento hay que sacarlo del store a mano: los marcadores del
  // mapa son DOM imperativo que solo se reconstruye cuando cambia `events`, y
  // esperar al refetch por realtime deja el pin visible mientras tanto.
  removeEvent: (id) => set((s) => ({
    events: s.events.filter((e) => e.id !== id),
    selectedEvent: s.selectedEvent?.id === id ? null : s.selectedEvent,
  })),
  setSelectedEvent: (selectedEvent) => set({ selectedEvent }),
  setFilterCategory: (filterCategory) => set({ filterCategory }),
}));
