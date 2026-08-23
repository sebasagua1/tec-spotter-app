import { useState } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  url?: string | null;
  name?: string | null;
  /** Tamaño y color del círculo: w-10 h-10 bg-muted, etc. */
  className?: string;
  /** Tamaño de la inicial cuando no hay foto. */
  textClassName?: string;
}

/**
 * Foto de perfil con la inicial de respaldo.
 *
 * Existía el problema de que las fotos no las veía nadie. No era cosa de
 * permisos —el bucket es público y tiene política de lectura— sino que en
 * toda la app solo había dos <img>: tu propio perfil y la vista previa al
 * editarlo. En los otros nueve sitios se pintaba la inicial del nombre y ya.
 *
 * El onError importa: si una URL se rompe o el archivo desaparece, se cae a
 * la inicial en vez de dejar el icono de imagen rota.
 */
export function UserAvatar({ url, name, className, textClassName }: Props) {
  const [failed, setFailed] = useState(false);
  const initial = name?.trim()?.[0]?.toUpperCase() ?? '?';

  return (
    <div
      className={cn(
        'rounded-full overflow-hidden shrink-0 flex items-center justify-center',
        className,
      )}
    >
      {url && !failed ? (
        <img
          src={url}
          // Vacío a propósito: el nombre va escrito al lado, y repetirlo aquí
          // hace que el lector de pantalla lo diga dos veces.
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          className="w-full h-full object-cover"
        />
      ) : (
        <span className={cn('font-bold', textClassName)}>{initial}</span>
      )}
    </div>
  );
}
