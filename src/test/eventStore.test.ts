import { describe, it, expect, beforeEach } from 'vitest';
import { useEventStore, selectSelectedEvent, type MapEvent } from '@/stores/eventStore';

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
    useEventStore.setState({ events: [], selectedEventId: null, filterCategory: null });
  });

  it('saca el evento de la lista que alimenta los marcadores del mapa', () => {
    useEventStore.setState({ events: [mk('a'), mk('b')] });
    useEventStore.getState().removeEvent('a');
    expect(useEventStore.getState().events.map(e => e.id)).toEqual(['b']);
  });

  it('cierra la hoja si el evento borrado era el seleccionado', () => {
    const a = mk('a');
    useEventStore.setState({ events: [a], selectedEventId: 'a' });
    useEventStore.getState().removeEvent('a');
    expect(useEventStore.getState().selectedEventId).toBeNull();
  });

  it('no toca la selección si se borra otro evento', () => {
    useEventStore.setState({ events: [mk('a'), mk('b')], selectedEventId: 'b' });
    useEventStore.getState().removeEvent('a');
    expect(useEventStore.getState().selectedEventId).toBe('b');
  });
});

describe('eventStore.setSelectedEvent', () => {
  beforeEach(() => {
    useEventStore.setState({ events: [], selectedEventId: null, filterCategory: null });
  });

  it('guarda el id y no el objeto', () => {
    const a = mk('a');
    useEventStore.setState({ events: [a] });
    useEventStore.getState().setSelectedEvent(a);
    expect(useEventStore.getState().selectedEventId).toBe('a');
  });

  it('la selección deja de estar congelada: al refrescar la lista, buscar por id da el valor nuevo', () => {
    const a = mk('a');
    useEventStore.setState({ events: [a] });
    useEventStore.getState().setSelectedEvent(a);

    // Lo que hace un refetch por tiempo real: misma fila, aforo distinto.
    useEventStore.setState({ events: [{ ...a, current_spots: 7 }] });

    const vivo = selectSelectedEvent(useEventStore.getState());
    expect(vivo?.current_spots).toBe(7);
    // Con el objeto guardado en el store, aquí seguiría saliendo 0.
    expect(a.current_spots).toBe(0);
  });

  it('el selector devuelve null si el evento desaparece de la lista', () => {
    const a = mk('a');
    useEventStore.setState({ events: [a] });
    useEventStore.getState().setSelectedEvent(a);
    useEventStore.setState({ events: [] });
    expect(selectSelectedEvent(useEventStore.getState())).toBeNull();
  });

  it('null limpia la selección', () => {
    useEventStore.setState({ selectedEventId: 'a' });
    useEventStore.getState().setSelectedEvent(null);
    expect(useEventStore.getState().selectedEventId).toBeNull();
  });
});
