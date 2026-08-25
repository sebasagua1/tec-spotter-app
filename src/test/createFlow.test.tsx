import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { PrivacySelector } from '@/components/ui/privacy-selector';
import i18n from '@/i18n';

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
