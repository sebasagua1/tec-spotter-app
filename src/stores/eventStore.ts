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
  setSelectedEvent: (event: MapEvent | null) => void;
  setFilterCategory: (cat: string | null) => void;
}

export const useEventStore = create<EventState>((set) => ({
  events: [],
  selectedEvent: null,
  filterCategory: null,
  setEvents: (events) => set({ events }),
  addEvent: (event) => set((s) => ({ events: [event, ...s.events] })),
  setSelectedEvent: (selectedEvent) => set({ selectedEvent }),
  setFilterCategory: (filterCategory) => set({ filterCategory }),
}));
