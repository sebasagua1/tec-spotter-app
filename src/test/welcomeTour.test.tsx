import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { WelcomeTour } from '@/components/map/WelcomeTour';
import i18n from '@/i18n';

// El recorrido de bienvenida era un solo globo apuntando al boton de crear:
// mis eventos, amigos y perfil quedaban sin presentar. Estos tests fijan el
// recorrido completo y, sobre todo, que SIEMPRE se pueda salir de el: un
// tutorial del que no se sale es una app que no se puede usar.
//
// La COLOCACION (donde cae el globo, hacia donde apunta el pico) no se prueba
// aqui a proposito: jsdom no hace layout y getBoundingClientRect devuelve
// ceros, asi que un test de posiciones aqui pasaria siempre y no probaria
// nada. Eso se verifico en un navegador de verdad.

/** La barra de pestañas real, reducida a lo que el recorrido busca. */
const pintarAnclas = () => {
  const nav = document.createElement('nav');
  for (const k of ['map', 'events', 'friends', 'profile']) {
    const b = document.createElement('button');
    b.setAttribute('data-tour', k);
    nav.appendChild(b);
  }
  const crear = document.createElement('button');
  crear.setAttribute('data-tour', 'create');
  document.body.append(nav, crear);
};

const siguiente = () => fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
const titulo = () => screen.getByRole('heading').textContent;

beforeEach(async () => {
  cleanup();
  document.body.innerHTML = '';
  await i18n.changeLanguage('es');
  pintarAnclas();
});

describe('WelcomeTour', () => {
  it('recorre las cinco pantallas en orden', () => {
    render(<WelcomeTour onFinish={vi.fn()} />);
    expect(titulo()).toBe('Este es tu campus');
    siguiente();
    expect(titulo()).toBe('Aquí creas tus eventos');
    siguiente();
    expect(titulo()).toBe('Tus eventos');
    siguiente();
    expect(titulo()).toBe('Amigos y chats');
    siguiente();
    expect(titulo()).toBe('Tu perfil');
  });

  it('el último paso cierra en vez de seguir', () => {
    const onFinish = vi.fn();
    render(<WelcomeTour onFinish={onFinish} />);
    for (let i = 0; i < 4; i++) siguiente();

    // Ya no hay "Siguiente" que pulsar, y "Saltar" sobra cuando no queda nada
    // que saltarse.
    expect(screen.queryByRole('button', { name: 'Siguiente' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Saltar' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Listo' }));
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('se puede saltar desde cualquier paso', () => {
    const onFinish = vi.fn();
    render(<WelcomeTour onFinish={onFinish} />);
    siguiente();
    fireEvent.click(screen.getByRole('button', { name: 'Saltar' }));
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('Escape también sale: con teclado físico no puede no haber salida', () => {
    const onFinish = vi.fn();
    render(<WelcomeTour onFinish={onFinish} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('dice por dónde va, para que ningún paso parezca el último', () => {
    render(<WelcomeTour onFinish={vi.fn()} />);
    const barra = screen.getByRole('progressbar');
    expect(barra).toHaveAttribute('aria-valuenow', '1');
    expect(barra).toHaveAttribute('aria-valuemax', '5');
    siguiente();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '2');
  });

  it('un paso cuyo ancla no está en pantalla se degrada, no se rompe', () => {
    // Pasa de verdad: la barra de pestañas puede no haberse montado todavía.
    document.body.innerHTML = '';
    const onFinish = vi.fn();
    render(<WelcomeTour onFinish={onFinish} />);
    siguiente();
    // Sigue avanzando y sigue teniendo salida, que es lo que importa.
    expect(titulo()).toBe('Aquí creas tus eventos');
    fireEvent.click(screen.getByRole('button', { name: 'Saltar' }));
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('es un diálogo modal anunciado como tal', () => {
    render(<WelcomeTour onFinish={vi.fn()} />);
    const dialogo = screen.getByRole('dialog');
    expect(dialogo).toHaveAttribute('aria-modal', 'true');
    // El titulo del paso es lo que lo nombra; sin esto un lector de pantalla
    // anuncia "dialogo" y nada mas.
    expect(dialogo).toHaveAttribute('aria-labelledby', 'tour-titulo');
  });
});
