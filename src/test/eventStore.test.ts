import { describe, it, expect, beforeEach } from 'vitest';
import { useEventStore, type MapEvent } from '@/stores/eventStore';

const mk = (id: string): MapEvent => ({
  id,
  creator_id: 'c1',
  title: `Evento ${id}`,
  category: 'social',
  location: { lng: -100.28, lat: 25.65 },
  address: null,
  description: null,
  starts_at: '2026-09-01T18:00:00Z',
  ends_at: '2026-09-01T20:00:00Z',
  max_spots: 10,
  current_spots: 0,
  privacy: 'open',
  is_active: true,
});

describe('eventStore.removeEvent', () => {
  beforeEach(() => {
    useEventStore.setState({ events: [], selectedEvent: null, filterCategory: null });
  });

  it('saca el evento de la lista que alimenta los marcadores del mapa', () => {
    useEventStore.setState({ events: [mk('a'), mk('b')] });
    useEventStore.getState().removeEvent('a');
    expect(useEventStore.getState().events.map(e => e.id)).toEqual(['b']);
  });

  it('cierra la hoja si el evento borrado era el seleccionado', () => {
    const a = mk('a');
    useEventStore.setState({ events: [a], selectedEvent: a });
    useEventStore.getState().removeEvent('a');
    expect(useEventStore.getState().selectedEvent).toBeNull();
  });

  it('no toca selectedEvent si es otro evento', () => {
    const [a, b] = [mk('a'), mk('b')];
    useEventStore.setState({ events: [a, b], selectedEvent: b });
    useEventStore.getState().removeEvent('a');
    expect(useEventStore.getState().selectedEvent?.id).toBe('b');
  });
});
