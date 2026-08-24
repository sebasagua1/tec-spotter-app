import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';
import { MAP_FALLBACK_CENTER } from '@/lib/constants';

type Center = { lng: number; lat: number };

/**
 * Dónde debe abrirse el mapa: el centro de la institución del usuario.
 *
 * Antes era una constante con las coordenadas de un campus concreto, lo que
 * convertía a esa institución en un caso especial del código. Ahora es un dato
 * de su fila, así que añadir una segunda institución no toca nada de esto.
 *
 * `resolved` distingue "todavía no se sabe" de "no hay institución". Quien
 * dibuja el mapa debe esperar a que sea true: recentrar después da un tirón
 * feo, y crear el mapa dos veces es peor.
 */
export function useInstitutionCenter(): { center: Center; resolved: boolean } {
  const profileLoaded = useAuthStore((s) => s.profileLoaded);
  const campusId = useAuthStore((s) => s.profile?.campus_id ?? null);

  const [center, setCenter] = useState<Center>(MAP_FALLBACK_CENTER);
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    // Sin perfil cargado no se sabe aún si hay institución o no.
    if (!profileLoaded) return;

    if (!campusId) {
      setResolved(true);
      return;
    }

    let cancelled = false;
    // `campuses` es la vista de compatibilidad sobre `institutions`.
    supabase
      .from('campuses')
      .select('lat, lng')
      .eq('id', campusId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        if (data?.lat != null && data?.lng != null) {
          setCenter({ lat: data.lat, lng: data.lng });
        }
        // También en caso de error: mejor abrir el mapa en el respaldo que
        // dejar al usuario mirando un hueco gris.
        setResolved(true);
      });

    return () => {
      cancelled = true;
    };
  }, [profileLoaded, campusId]);

  return { center, resolved };
}
