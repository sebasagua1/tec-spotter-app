import { describe, it, expect } from 'vitest';
import {
  fitWithin,
  clampArea,
  MAX_SHORT_SIDE,
  MAX_LONG_SIDE,
  OUTPUT_SIZE,
  MAX_ZOOM,
} from '@/lib/imageDownscale';

const megapixeles = (w: number, h: number) => (w * h) / 1e6;
/** Cuatro bytes por píxel: lo que de verdad ocupa una imagen descomprimida. */
const memoriaMB = (w: number, h: number) => (w * h * 4) / 1024 / 1024;

describe('el tamaño objetivo no es un número mágico', () => {
  it('sale del zoom máximo y del lado de salida', () => {
    expect(MAX_SHORT_SIDE).toBe(OUTPUT_SIZE * MAX_ZOOM);
  });

  it('al máximo acercamiento todavía hay píxeles de sobra', () => {
    // Se ve 1/MAX_ZOOM del lado corto, y ese trozo tiene que dar OUTPUT_SIZE.
    const { width, height } = fitWithin(8064, 6048);
    expect(Math.min(width, height) / MAX_ZOOM).toBeGreaterThanOrEqual(OUTPUT_SIZE);
  });
});

describe('fitWithin', () => {
  it('la foto de 48 MP que cerraba la app', () => {
    // 8064x6048 son ~195 MB descomprimidos. El webview de iOS no lo aguanta.
    expect(Math.round(memoriaMB(8064, 6048))).toBe(186);

    const r = fitWithin(8064, 6048);
    expect(r).toEqual({ width: 2048, height: 1536, scaled: true });
    expect(memoriaMB(r.width, r.height)).toBeLessThan(13);
  });

  it('conserva la proporción en vertical y en horizontal', () => {
    // Lo que se acota es el lado CORTO, que es el que manda en un recorte
    // cuadrado. Da igual cómo esté girada la foto: acaba en MAX_SHORT_SIDE.
    expect(fitWithin(3024, 4032)).toEqual({ width: 1536, height: 2048, scaled: true });
    expect(fitWithin(4032, 3024)).toEqual({ width: 2048, height: 1536, scaled: true });
  });

  it('el lado corto acaba siempre en el objetivo, mire como mire la foto', () => {
    for (const [w, h] of [[8064, 6048], [6048, 8064], [4000, 4000], [5000, 3000]]) {
      const r = fitWithin(w, h);
      expect(Math.min(r.width, r.height)).toBe(MAX_SHORT_SIDE);
    }
  });

  it('nunca amplía: una foto pequeña se queda igual y sin reencodar', () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600, scaled: false });
    expect(fitWithin(64, 64)).toEqual({ width: 64, height: 64, scaled: false });
  });

  it('justo en el límite tampoco se toca', () => {
    expect(fitWithin(MAX_SHORT_SIDE, MAX_SHORT_SIDE).scaled).toBe(false);
  });

  it('una panorámica la acota el lado largo, que el corto no sujeta nada', () => {
    // 10000x1000: el lado corto ya cabe, pero 10 MP siguen siendo mucho.
    const r = fitWithin(10000, 1000);
    expect(r.scaled).toBe(true);
    expect(Math.max(r.width, r.height)).toBeLessThanOrEqual(MAX_LONG_SIDE);
    expect(megapixeles(r.width, r.height)).toBeLessThan(2);
  });

  it('aguanta medidas imposibles sin romperse', () => {
    expect(fitWithin(0, 0)).toEqual({ width: 0, height: 0, scaled: false });
    expect(fitWithin(NaN, 100)).toEqual({ width: 0, height: 0, scaled: false });
    expect(fitWithin(-5, 100)).toEqual({ width: 0, height: 0, scaled: false });
  });

  it('el resultado siempre son enteros: un canvas no admite medias', () => {
    const r = fitWithin(4001, 3001);
    expect(Number.isInteger(r.width)).toBe(true);
    expect(Number.isInteger(r.height)).toBe(true);
  });
});

describe('clampArea', () => {
  it('un recorte que ya cabe no se toca', () => {
    expect(clampArea({ x: 10, y: 20, width: 100, height: 100 }, 500, 500))
      .toEqual({ x: 10, y: 20, width: 100, height: 100 });
  });

  it('no deja que se salga por arriba o por la izquierda', () => {
    // Salirse rellena de transparente, y en JPEG eso es una raya negra.
    expect(clampArea({ x: -8, y: -3, width: 100, height: 100 }, 500, 500))
      .toEqual({ x: 0, y: 0, width: 100, height: 100 });
  });

  it('recorta lo que se sale por la derecha o por abajo', () => {
    const r = clampArea({ x: 450, y: 450, width: 100, height: 100 }, 500, 500);
    expect(r.x + r.width).toBeLessThanOrEqual(500);
    expect(r.y + r.height).toBeLessThanOrEqual(500);
  });

  it('redondea los píxeles fraccionarios que devuelve el recortador', () => {
    expect(clampArea({ x: 10.4, y: 20.6, width: 99.5, height: 100.4 }, 500, 500))
      .toEqual({ x: 10, y: 21, width: 100, height: 100 });
  });

  it('nunca devuelve un recorte de tamaño cero', () => {
    const r = clampArea({ x: 0, y: 0, width: 0, height: 0 }, 500, 500);
    expect(r.width).toBeGreaterThan(0);
    expect(r.height).toBeGreaterThan(0);
  });
});
