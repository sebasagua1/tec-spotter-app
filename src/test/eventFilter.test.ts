import { describe, it, expect } from 'vitest';
import { matchesFilter, filterEvents } from '@/lib/eventFilter';
import type { MapEvent } from '@/stores/eventStore';

const ev = (over: Partial<MapEvent> = {}): MapEvent => ({
  id: 'e1',
  creator_id: 'c1',
  title: 'Partido de fútbol',
  category: 'sports',
  location: { lng: -100.28, lat: 25.65 },
  address: null,
  description: null,
  starts_at: '2026-09-01T18:00:00+00:00',
  ends_at: '2026-09-01T20:00:00+00:00',
  max_spots: 10,
  current_spots: 3,
  privacy: 'open',
  is_active: true,
  ...over,
});

const todo = { category: null, query: '' };

describe('matchesFilter', () => {
  it('sin filtros lo enseña todo', () => {
    expect(matchesFilter(ev(), todo)).toBe(true);
  });

  it('filtra por categoría', () => {
    expect(matchesFilter(ev(), { ...todo, category: 'sports' })).toBe(true);
    expect(matchesFilter(ev(), { ...todo, category: 'study' })).toBe(false);
  });

  it('busca dentro del título, no solo por el principio', () => {
    expect(matchesFilter(ev(), { ...todo, query: 'fútbol' })).toBe(true);
    expect(matchesFilter(ev(), { ...todo, query: 'Partido' })).toBe(true);
  });

  it('la búsqueda no distingue mayúsculas', () => {
    expect(matchesFilter(ev(), { ...todo, query: 'FÚTBOL' })).toBe(true);
  });

  it('los espacios sueltos no vacían el mapa', () => {
    // Se escribe un espacio y se borra: sin el trim, "   " no casaba con nada
    // y desaparecían todos los pines.
    expect(matchesFilter(ev(), { ...todo, query: '   ' })).toBe(true);
    expect(matchesFilter(ev(), { ...todo, query: '  fútbol  ' })).toBe(true);
  });

  it('categoría y búsqueda se aplican a la vez', () => {
    expect(matchesFilter(ev(), { category: 'sports', query: 'fútbol' })).toBe(true);
    expect(matchesFilter(ev(), { category: 'study', query: 'fútbol' })).toBe(false);
    expect(matchesFilter(ev(), { category: 'sports', query: 'cine' })).toBe(false);
  });
});

describe('filterEvents', () => {
  it('conserva el orden de la lista', () => {
    const lista = [ev({ id: 'a' }), ev({ id: 'b', title: 'Cine' }), ev({ id: 'c' })];
    expect(filterEvents(lista, todo).map((e) => e.id)).toEqual(['a', 'b', 'c']);
  });

  it('deja fuera lo que no casa', () => {
    const lista = [ev({ id: 'a' }), ev({ id: 'b', title: 'Cine', category: 'social' })];
    expect(filterEvents(lista, { category: null, query: 'cine' }).map((e) => e.id)).toEqual(['b']);
  });
});
