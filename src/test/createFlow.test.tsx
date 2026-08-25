import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { PrivacySelector } from '@/components/ui/privacy-selector';
import { EventListView } from '@/components/map/EventListView';
import type { MapEvent } from '@/stores/eventStore';
import i18n from '@/i18n';

const evento = (over: Partial<MapEvent> = {}): MapEvent => ({
  id: 'e1', creator_id: 'u1', title: 'Estudio de cálculo', category: 'study',
  location: { lng: -98.2, lat: 19 }, address: null, description: null,
  starts_at: new Date(Date.now() + 3_600_000).toISOString(),
  ends_at: new Date(Date.now() + 7_200_000).toISOString(),
  max_spots: 10, current_spots: 1, privacy: 'open', is_active: true, ...over,
});

beforeEach(async () => { cleanup(); await i18n.changeLanguage('es'); });

describe('PrivacySelector', () => {
  it('enseña las TRES descripciones a la vez, no solo la marcada', () => {
    render(<PrivacySelector value="open" onChange={() => {}} />);
    // Antes solo se veía la de la opción activa: para comparar había que ir
    // tocando una por una, justo lo que se está decidiendo.
    expect(screen.getByText('Lo ve todo el mundo y cualquiera puede unirse.')).toBeInTheDocument();
    expect(screen.getByText('Solo lo ven tus amigos, y entran directo.')).toBeInTheDocument();
    expect(screen.getByText('Lo ve todo el mundo, pero tú apruebas quién entra.')).toBeInTheDocument();
  });

  it('son excluyentes: radiogroup con una sola marcada', () => {
    render(<PrivacySelector value="friends" onChange={() => {}} />);
    expect(screen.getByRole('radiogroup')).toBeInTheDocument();
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(3);
    expect(radios.filter(r => r.getAttribute('aria-checked') === 'true')).toHaveLength(1);
    expect(screen.getByRole('radio', { name: /Amigos/ })).toHaveAttribute('aria-checked', 'true');
  });

  it('avisa del cambio con la clave, no con la etiqueta traducida', () => {
    const onChange = vi.fn();
    render(<PrivacySelector value="open" onChange={onChange} />);
    fireEvent.click(screen.getByRole('radio', { name: /Privado/ }));
    expect(onChange).toHaveBeenCalledWith('private');
  });
});

describe('EventListView: los dos vacíos', () => {
  const props = { filterCategory: null, searchQuery: '', onSelect: vi.fn() };

  it('sin NINGÚN evento: invita a crear el primero', () => {
    const onCreate = vi.fn();
    render(<EventListView {...props} events={[]} onCreate={onCreate} onClearFilters={vi.fn()} />);
    expect(screen.getByText('Todavía no hay nada por aquí')).toBeInTheDocument();
    const cta = screen.getByRole('button', { name: /Crear el primero/ });
    fireEvent.click(cta);
    expect(onCreate).toHaveBeenCalled();
  });

  it('con eventos que el filtro descarta: NO dice que no haya nada', () => {
    const onClear = vi.fn();
    render(
      <EventListView
        {...props}
        filterCategory="sports"
        events={[evento({ category: 'study' })]}
        onCreate={vi.fn()}
        onClearFilters={onClear}
      />
    );
    // El error que se está evitando: decir "crea el primero" cuando el campus
    // sí tiene eventos y lo único mal puesto es el filtro.
    expect(screen.queryByText('Todavía no hay nada por aquí')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Crear el primero/ })).not.toBeInTheDocument();
    expect(screen.getByText('Ningún evento coincide con lo que buscas')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Quitar filtros/ }));
    expect(onClear).toHaveBeenCalled();
  });

  it('la búsqueda sin resultados también es un vacío de filtro', () => {
    render(
      <EventListView
        {...props}
        searchQuery="zzzz"
        events={[evento()]}
        onCreate={vi.fn()}
        onClearFilters={vi.fn()}
      />
    );
    expect(screen.getByText('Ningún evento coincide con lo que buscas')).toBeInTheDocument();
  });

  it('con eventos visibles no enseña ningún vacío', () => {
    render(<EventListView {...props} events={[evento()]} onCreate={vi.fn()} onClearFilters={vi.fn()} />);
    expect(screen.getByText('Estudio de cálculo')).toBeInTheDocument();
    expect(screen.queryByText('Todavía no hay nada por aquí')).not.toBeInTheDocument();
  });
});
