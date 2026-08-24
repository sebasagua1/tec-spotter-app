import { describe, expect, it } from 'vitest';
import { routeFromPath, routeFromPushData, routeFromUrl } from '@/lib/deepLinks';

const UUID = '3f1c8a54-6b2e-4d19-9a70-5c8e1b2d4f60';

describe('routeFromPath', () => {
  it('acepta las rutas que la app tiene', () => {
    expect(routeFromPath('/')).toBe('/');
    expect(routeFromPath('/events')).toBe('/events');
    expect(routeFromPath('/friends')).toBe('/friends');
    expect(routeFromPath('/profile')).toBe('/profile');
  });

  it('normaliza barras de sobra y query/hash', () => {
    expect(routeFromPath('events')).toBe('/events');
    expect(routeFromPath('//events')).toBe('/events');
    expect(routeFromPath('/events?utm=x')).toBe('/events');
    expect(routeFromPath('/events#abajo')).toBe('/events');
  });

  it('acepta un grupo solo si el id es un uuid', () => {
    expect(routeFromPath(`/groups/${UUID}`)).toBe(`/groups/${UUID}`);
    expect(routeFromPath('/groups/1')).toBeNull();
    expect(routeFromPath('/groups/')).toBeNull();
    expect(routeFromPath('/groups')).toBeNull();
  });

  it('rechaza lo que no reconoce', () => {
    expect(routeFromPath('/admin')).toBeNull();
    expect(routeFromPath('/events/borrar')).toBeNull();
  });

  // El id se valida de verdad, no solo "que haya algo".
  it('no deja colar travesía de directorios', () => {
    expect(routeFromPath('/groups/../../etc/passwd')).toBeNull();
    expect(routeFromPath('/groups/..')).toBeNull();
  });
});

describe('routeFromUrl', () => {
  it('entiende el esquema propio, donde el primer segmento cae en host', () => {
    expect(routeFromUrl(`alwaysconnected://groups/${UUID}`)).toBe(`/groups/${UUID}`);
    expect(routeFromUrl('alwaysconnected://friends')).toBe('/friends');
    expect(routeFromUrl('alwaysconnected://events')).toBe('/events');
    expect(routeFromUrl('alwaysconnected://')).toBe('/');
  });

  it('entiende una URL https normal', () => {
    expect(routeFromUrl('https://alwaysconnected.vercel.app/profile')).toBe('/profile');
  });

  it('devuelve null ante basura', () => {
    expect(routeFromUrl('no es una url')).toBeNull();
    expect(routeFromUrl('alwaysconnected://admin')).toBeNull();
  });

  // Aunque el enlace venga de un dominio ajeno, lo único que puede conseguir
  // es abrir una pantalla de la propia app. Nunca se navega fuera.
  it('un dominio ajeno solo puede llevar a rutas internas', () => {
    expect(routeFromUrl('https://sitio-cualquiera.example/friends')).toBe('/friends');
    expect(routeFromUrl('https://sitio-cualquiera.example/robar')).toBeNull();
  });
});

describe('routeFromPushData', () => {
  it('lleva cada tipo de notificación a su pantalla', () => {
    expect(routeFromPushData({ type: 'message', group_id: UUID })).toBe(`/groups/${UUID}`);
    expect(routeFromPushData({ type: 'friend_request', requester_id: UUID })).toBe('/friends');
    expect(routeFromPushData({ type: 'join_request', event_id: UUID })).toBe('/events');
    expect(routeFromPushData({ type: 'approval', event_id: UUID })).toBe('/events');
  });

  it('aguanta payloads incompletos o desconocidos', () => {
    expect(routeFromPushData({ type: 'message' })).toBeNull();
    expect(routeFromPushData({ type: 'message', group_id: 'no-es-uuid' })).toBeNull();
    expect(routeFromPushData({ type: 'inventado' })).toBeNull();
    expect(routeFromPushData(undefined)).toBeNull();
    expect(routeFromPushData(null)).toBeNull();
    expect(routeFromPushData('cadena')).toBeNull();
  });
});
