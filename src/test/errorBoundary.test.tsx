import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import i18n from '@/i18n';

/** Explota solo mientras `explota` sea true, para poder probar el reintento. */
let explota = true;
function Frágil() {
  if (explota) throw new Error('boom');
  return <p>contenido</p>;
}

// React escribe el error en consola aunque el boundary lo capture. Es ruido
// esperado, no un fallo del test.
let silencio: ReturnType<typeof vi.spyOn>;
beforeAll(() => { silencio = vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterAll(() => { silencio.mockRestore(); });
beforeEach(() => { cleanup(); explota = true; });

describe('ErrorBoundary', () => {
  it('deja pasar a los hijos cuando no hay error', async () => {
    await i18n.changeLanguage('es');
    explota = false;
    render(<ErrorBoundary><Frágil /></ErrorBoundary>);
    expect(screen.getByText('contenido')).toBeInTheDocument();
  });

  it('enseña la pantalla de error en español, no en inglés', async () => {
    await i18n.changeLanguage('es');
    render(<ErrorBoundary><Frágil /></ErrorBoundary>);
    expect(screen.getByText('Algo ha fallado')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
    // La versión anterior estaba escrita a mano en inglés dentro del JSX.
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
  });

  it('traduce también al inglés', async () => {
    await i18n.changeLanguage('en');
    render(<ErrorBoundary><Frágil /></ErrorBoundary>);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    await i18n.changeLanguage('es');
  });

  it('el reintento recupera sin recargar la página', async () => {
    await i18n.changeLanguage('es');
    render(<ErrorBoundary><Frágil /></ErrorBoundary>);
    expect(screen.getByText('Algo ha fallado')).toBeInTheDocument();

    // Lo que provocaba el fallo deja de fallar (un import dinámico que ya
    // bajó, la red que vuelve): reintentar tiene que bastar.
    explota = false;
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(screen.getByText('contenido')).toBeInTheDocument();
    expect(screen.queryByText('Algo ha fallado')).not.toBeInTheDocument();
  });

  it('marca la pantalla como alerta para los lectores', async () => {
    await i18n.changeLanguage('es');
    render(<ErrorBoundary><Frágil /></ErrorBoundary>);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
