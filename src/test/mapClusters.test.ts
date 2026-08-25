import { describe, it, expect } from 'vitest';
import { clusterByGrid, planMarkers, CLUSTER_CELL_PX, CLUSTER_MAX_ZOOM, MAX_MAP_EVENTS } from '@/lib/mapClusters';

const p = (id: string, x: number, y: number) => ({ id, x, y });

describe('clusterByGrid', () => {
  it('sin puntos no hay racimos', () => {
    expect(clusterByGrid([])).toEqual([]);
  });

  it('puntos lejanos quedan cada uno en el suyo', () => {
    const r = clusterByGrid([p('a', 10, 10), p('b', 500, 500)], 64);
    expect(r).toHaveLength(2);
    expect(r.every((c) => c.ids.length === 1)).toBe(true);
  });

  it('puntos que se pisan caen en la misma celda', () => {
    const r = clusterByGrid([p('a', 10, 10), p('b', 20, 20), p('c', 30, 30)], 64);
    expect(r).toHaveLength(1);
    expect(r[0].ids.sort()).toEqual(['a', 'b', 'c']);
  });

  it('la frontera de celda separa', () => {
    // 63 y 64 con celda de 64 caen en celdas distintas.
    const r = clusterByGrid([p('a', 63, 0), p('b', 64, 0)], 64);
    expect(r).toHaveLength(2);
  });

  it('no pierde ningún punto', () => {
    const puntos = Array.from({ length: 200 }, (_, i) => p('e' + i, (i * 37) % 800, (i * 53) % 600));
    const total = clusterByGrid(puntos, 64).reduce((n, c) => n + c.ids.length, 0);
    expect(total).toBe(200);
  });

  it('no asigna un punto a dos celdas', () => {
    const puntos = Array.from({ length: 200 }, (_, i) => p('e' + i, (i * 37) % 800, (i * 53) % 600));
    const ids = clusterByGrid(puntos, 64).flatMap((c) => c.ids);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('coordenadas negativas (fuera de pantalla por arriba) también agrupan', () => {
    const r = clusterByGrid([p('a', -10, -10), p('b', -20, -20)], 64);
    expect(r).toHaveLength(1);
  });

  it('descarta lo que no se pudo proyectar en vez de amontonarlo', () => {
    // Sin la guarda, NaN e Infinity caerían todos en una misma celda falsa.
    const r = clusterByGrid([p('a', NaN, 0), p('b', 0, Infinity), p('c', 10, 10)], 64);
    expect(r).toHaveLength(1);
    expect(r[0].ids).toEqual(['c']);
  });

  it('una celda inválida no agrupa nada, en vez de dividir por cero', () => {
    const r = clusterByGrid([p('a', 10, 10), p('b', 20, 20)], 0);
    expect(r).toHaveLength(2);
  });

  it('es determinista: misma entrada, misma salida', () => {
    const puntos = Array.from({ length: 50 }, (_, i) => p('e' + i, (i * 31) % 400, (i * 17) % 400));
    expect(clusterByGrid(puntos, 64)).toEqual(clusterByGrid(puntos, 64));
  });

  it('celda más grande agrupa más', () => {
    const puntos = Array.from({ length: 60 }, (_, i) => p('e' + i, (i * 23) % 700, (i * 41) % 500));
    expect(clusterByGrid(puntos, 128).length).toBeLessThanOrEqual(clusterByGrid(puntos, 32).length);
  });
});

describe('constantes', () => {
  it('la celda deja sitio de sobra a un pin de 36', () => {
    expect(CLUSTER_CELL_PX).toBeGreaterThan(36);
  });
  it('el tope de zoom permite llegar al detalle', () => {
    expect(CLUSTER_MAX_ZOOM).toBeGreaterThanOrEqual(16);
  });
  it('el tope de eventos queda por debajo del corte de Supabase', () => {
    expect(MAX_MAP_EVENTS).toBeLessThan(1000);
  });
});

describe('planMarkers', () => {
  const it_ = (id: string, x: number, y: number, over: Partial<{ placeable: boolean; passesFilter: boolean }> = {}) => ({
    id, x, y, placeable: true, passesFilter: true, ...over,
  });

  it('lejos: los que se pisan van a un racimo y no sueltos', () => {
    const r = planMarkers([it_('a', 10, 10), it_('b', 20, 20), it_('c', 500, 500)], 14);
    expect(r.clusters).toHaveLength(1);
    expect(r.clusters[0].ids.sort()).toEqual(['a', 'b']);
    expect([...r.loose]).toEqual(['c']);
  });

  it('por encima del umbral no se agrupa nada', () => {
    const r = planMarkers([it_('a', 10, 10), it_('b', 12, 12)], CLUSTER_MAX_ZOOM);
    expect(r.clusters).toHaveLength(0);
    expect(r.loose.size).toBe(2);
  });

  // ESTA es la que se me escapó al escribirlo: filtrar destruía marcadores.
  it('lo que NO pasa el filtro se sigue conservando en caché', () => {
    const r = planMarkers([it_('a', 10, 10), it_('b', 500, 500, { passesFilter: false })], 14);
    expect(r.loose.has('b')).toBe(false);      // no se dibuja
    expect(r.cached.has('b')).toBe(true);      // pero su marcador no se tira
  });

  it('lo que está dentro de un racimo también se conserva', () => {
    const r = planMarkers([it_('a', 10, 10), it_('b', 20, 20)], 14);
    expect(r.loose.size).toBe(0);
    expect(r.cached).toEqual(new Set(['a', 'b']));
  });

  it('lo que no se puede colocar no se conserva: ahí sí hay que destruirlo', () => {
    // Un evento al que le quitaron el sitio, o con una categoría desconocida.
    const r = planMarkers([it_('a', 10, 10), it_('b', 0, 0, { placeable: false })], 14);
    expect(r.cached.has('b')).toBe(false);
  });

  it('un evento nunca está a la vez suelto y en un racimo', () => {
    const items = Array.from({ length: 80 }, (_, i) => it_('e' + i, (i * 29) % 600, (i * 47) % 400));
    const r = planMarkers(items, 14);
    const enRacimos = r.clusters.flatMap((c) => c.ids);
    expect(enRacimos.some((id) => r.loose.has(id))).toBe(false);
    expect(new Set([...enRacimos, ...r.loose]).size).toBe(80);
  });

  it('todo lo que pasa el filtro acaba dibujado de alguna forma', () => {
    const items = Array.from({ length: 80 }, (_, i) =>
      it_('e' + i, (i * 29) % 600, (i * 47) % 400, { passesFilter: i % 3 !== 0 }),
    );
    const r = planMarkers(items, 14);
    const dibujados = new Set([...r.clusters.flatMap((c) => c.ids), ...r.loose]);
    items.filter((x) => x.passesFilter).forEach((x) => expect(dibujados.has(x.id)).toBe(true));
    items.filter((x) => !x.passesFilter).forEach((x) => expect(dibujados.has(x.id)).toBe(false));
  });
});
