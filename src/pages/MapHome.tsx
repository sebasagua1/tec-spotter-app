import { useEffect, useRef, useState, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import { useTranslation } from 'react-i18next';
import { Plus, LocateFixed, Layers, List, Map as MapIcon, Search, X as XIcon, type LucideIcon } from 'lucide-react';
import { useEventStore, selectSelectedEvent } from '@/stores/eventStore';
import { EVENT_CATEGORIES, MAPBOX_STYLE_LIGHT, MAPBOX_STYLE_DARK } from '@/lib/constants';
import { prefersDark, onColorSchemeChange } from '@/lib/theme';
import { CATEGORY_ICONS, getCategoryMarkerSVG } from '@/lib/categoryIcons';
import { EventListView } from '@/components/map/EventListView';
import { cn } from '@/lib/utils';
import { EventBottomSheet } from '@/components/map/EventBottomSheet';
import { CreateEventSheet } from '@/components/map/CreateEventSheet';
import { LocationPickerOverlay } from '@/components/map/LocationPickerOverlay';
import { supabase } from '@/integrations/supabase/client';
import { useUserLocation } from '@/hooks/useUserLocation';
import { toast } from '@/hooks/use-toast';
import i18n from '@/i18n';
import mapboxgl, { type Map as MapboxMap, type Marker as MapboxMarker } from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { pageTitle } from '@/lib/brand';
import { useInstitutionCenter } from '@/hooks/useInstitutionCenter';
import { toMapEvent, needsServerCheck, type EventRow } from '@/lib/eventSync';

/**
 * Lo que hace falta del payload de tiempo real.
 *
 * Se declara aquí en vez de importarlo: supabase-js 2.100 no reexporta
 * RealtimePostgresChangesPayload, y tirar de @supabase/realtime-js sería
 * depender de un paquete que no está en package.json y solo llega como
 * dependencia transitiva.
 */
type EventChange =
  | { eventType: 'INSERT'; new: EventRow }
  | { eventType: 'UPDATE'; new: EventRow }
  | { eventType: 'DELETE'; old: Partial<EventRow> };

export default function MapHome() {
  const { t } = useTranslation();
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const markersRef = useRef<MapboxMarker[]>([]);
  const { events, setEvents, upsertEvent, removeEvent, setSelectedEvent, filterCategory, setFilterCategory } = useEventStore();
  // Resuelto contra la lista viva en cada render: así la hoja abierta refleja
  // lo que llegue por tiempo real.
  const selectedEvent = useEventStore(selectSelectedEvent);
  const [showCreate, setShowCreate] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  // El centro sale de la institución del usuario, no de una constante.
  const { center: institutionCenter, resolved: centerResolved } = useInstitutionCenter();
  // Ref y no dependencia del efecto: ese efecto tiene una limpieza que destruye
  // el mapa, así que si `center` entrara en sus deps el mapa se recrearía
  // entero cada vez que cambiara.
  const centerRef = useRef(institutionCenter);
  centerRef.current = institutionCenter;
  const [mapboxToken, setMapboxToken] = useState<string | null>(
    (import.meta.env.VITE_MAPBOX_TOKEN as string) ?? null
  );
  const [pickingLocation, setPickingLocation] = useState(false);
  const [pickedLocation, setPickedLocation] = useState<{ lng: number; lat: number } | null>(null);
  const [pickReturnsToForm, setPickReturnsToForm] = useState(false);
  const [viewMode, setViewMode] = useState<'map' | 'list'>('map');
  // Alto real de la barra flotante. La vista de lista lo necesita para
  // empezar por debajo: escrito a mano como un pt-20 se quedaba corto y la
  // primera tarjeta aparecía metida bajo el buscador.
  const topBarRef = useRef<HTMLDivElement>(null);
  const [topBarHeight, setTopBarHeight] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const pickMarkerRef = useRef<MapboxMarker | null>(null);
  const userMarkerRef = useRef<MapboxMarker | null>(null);
  const hasAutoCenteredRef = useRef(false);
  const deniedToastShownRef = useRef(false);

  const { location: userLocation, error: geoError, permission } = useUserLocation({
    enableHighAccuracy: true,
    maximumAge: 4000,
    timeout: 15000,
  });


  // Eventos: carga inicial y tiempo real.
  //
  // El tiempo real ya NO vuelve a pedir la lista entera. Antes sí, con
  // `event: '*'` sobre toda la tabla: como `current_spots` es una columna de
  // `events`, cada vez que alguien se apuntaba o se salía de cualquier evento
  // se disparaba un refetch completo en TODOS los clientes conectados, y
  // detrás de cada uno una reconstrucción de todos los marcadores del mapa.
  //
  // La regla que sigue este efecto, y que es lo que lo hace seguro:
  //
  //     el payload de tiempo real nunca CONCEDE visibilidad;
  //     solo actualiza o quita algo que PostgREST ya había concedido.
  //
  // Así no depende de que la RLS esté aplicada sobre el canal de realtime, que
  // es algo que no se puede comprobar desde aquí. Lo que llega por el socket se
  // aplica tal cual únicamente si el evento ya estaba en la lista y nada de lo
  // que decide su visibilidad ha cambiado. En cuanto hay duda se le pregunta al
  // servidor por esa fila concreta: una búsqueda por clave primaria, no un
  // barrido de la tabla.
  useEffect(() => {
    let cancelled = false;

    // Ahora la lista se pide desde tres sitios —montaje, reconexión y volver
    // del segundo plano—, que en iOS coinciden con facilidad. Sin este número
    // de orden, dos peticiones en vuelo y la más vieja respondiendo la última
    // pisarían los datos nuevos. Solo escribe la última que se lanzó.
    let lastFetch = 0;

    const fetchEvents = async () => {
      const seq = ++lastFetch;
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('is_active', true)
        .gt('ends_at', new Date().toISOString());
      if (cancelled || seq !== lastFetch) return;
      // Sin esto, un fallo de red dejaba el mapa sin pines y sin forma de
      // distinguirlo de "no hay eventos".
      // i18n.t y no el `t` del hook: este mensaje se lee en el momento del fallo y
      // no necesita reaccionar al idioma. Con el del hook habría que meterlo en las
      // dependencias del efecto, y cambiar de idioma reabriría la suscripción.
      if (error) {
        toast({ title: i18n.t('errors.eventsLoad'), variant: 'destructive' });
        return;
      }
      if (data) setEvents(data.map(toMapEvent));
    };

    // Una sola fila, por clave primaria y con los mismos filtros que la carga
    // inicial. Va por PostgREST a propósito: es quien aplica la RLS, así que si
    // el evento no me corresponde vuelve vacío y entonces se quita.
    const syncOne = async (id: string) => {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('id', id)
        .eq('is_active', true)
        .gt('ends_at', new Date().toISOString())
        .maybeSingle();
      // Ante un fallo de red se deja lo que ya hay: borrar por no haber podido
      // preguntar sería hacer desaparecer pines buenos en cada bache.
      if (cancelled || error) return;
      if (data) upsertEvent(toMapEvent(data));
      else removeEvent(id);
    };

    const handleChange = (payload: EventChange) => {
      if (payload.eventType === 'DELETE') {
        // Con REPLICA IDENTITY DEFAULT el payload de un DELETE solo trae la
        // clave primaria, que es justo lo único que hace falta. Quitar un id
        // que no está en la lista no hace nada, así que da igual si el canal
        // reparte los borrados sin filtrar.
        const id = payload.old?.id;
        if (id) removeEvent(id);
        return;
      }

      const row = payload.new;
      if (!row?.id) return;

      const known = useEventStore.getState().events.find((e) => e.id === row.id);

      // Las reglas están en lib/eventSync.ts, con sus pruebas: es la única
      // parte de todo esto que puede fallar en silencio.
      if (needsServerCheck(known, row)) {
        syncOne(row.id);
        return;
      }

      // Ya era visible y lo sigue siendo. Aquí cae el caso frecuente —el aforo
      // subiendo y bajando— y se resuelve entero en memoria, sin tocar la red.
      upsertEvent(toMapEvent(row));
    };

    fetchEvents();

    let firstSubscribe = true;
    const channel = supabase
      .channel('events-realtime')
      .on<EventRow>('postgres_changes', { event: '*', schema: 'public', table: 'events' }, handleChange)
      .subscribe((status) => {
        if (status !== 'SUBSCRIBED') return;
        // El primer SUBSCRIBED acompaña al fetch inicial que ya se ha lanzado.
        // Los siguientes son reconexiones, y mientras el socket estuvo caído se
        // perdieron cambios: ahí sí hay que volver a pedir la lista.
        if (firstSubscribe) { firstSubscribe = false; return; }
        fetchEvents();
      });

    // Volver a la app tras un rato en segundo plano. iOS congela el webview y
    // el socket puede quedarse muerto sin llegar a reconectar. Además recupera
    // la deriva que antes corregía de rebote el refetch continuo: hay cambios
    // que alteran lo que puedes ver sin tocar ninguna fila de `events` —un
    // bloqueo, una amistad nueva— y que por el socket no llegan nunca.
    const onVisible = () => { if (document.visibilityState === 'visible') fetchEvents(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      supabase.removeChannel(channel);
    };
  }, [setEvents, upsertEvent, removeEvent]);

  // Initialize map
  useEffect(() => {
    // Esperar a saber el centro: recentrar después da un tirón visible.
    if (!centerResolved) return;
    if (!mapContainer.current || mapRef.current) return;

    const initMap = () => {

      // El token de Mapbox es público por diseño: va en el bundle y se protege
      // restringiendo por dominio desde el panel de Mapbox, no escondiéndolo.
      // Aquí hubo un respaldo que pedía el token a una edge function; se quitó
      // porque esa función nunca llegó a desplegarse (devolvía 404) y, aunque
      // se hubiera desplegado, no habría protegido nada.
      const token = (import.meta.env.VITE_MAPBOX_TOKEN as string) ?? '';
      if (!token) {
        setMapboxToken(null);
        return;
      }
      setMapboxToken(token);
      mapboxgl.accessToken = token;

      const map = new mapboxgl.Map({
        container: mapContainer.current!,
        style: prefersDark() ? MAPBOX_STYLE_DARK : MAPBOX_STYLE_LIGHT,
        center: [centerRef.current.lng, centerRef.current.lat],
        zoom: 15.5,
        pitch: 0,
        attributionControl: false,
      });

      // Note: we use our own watchPosition-based marker instead of GeolocateControl


      map.on('load', () => {
        setMapLoaded(true);
        // El contenedor puede medir 0 en el primer frame (lazy-load + async);
        // reajusta el tamaño para que mapbox pida y pinte los tiles.
        map.resize();
      });

      mapRef.current = map;
      // Reajuste extra tras el layout inicial (por si el load ya disparó
      // antes de que el contenedor tuviera su tamaño final).
      requestAnimationFrame(() => map.resize());
    };

    initMap();

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [centerResolved]);

  useEffect(() => {
    const el = topBarRef.current;
    if (!el) return;
    const measure = () => setTopBarHeight(el.offsetHeight);
    measure();
    // Cambia de alto al rotar, al cambiar el tamaño de letra del sistema o
    // si las pastillas pasan a dos líneas en otro idioma.
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [pickingLocation]);

  // El mapa vive fuera del CSS de la app: cuando el sistema cambia de tema
  // hay que cambiarle el estilo a mano. Los marcadores son elementos del DOM
  // (mapboxgl.Marker con element propio), así que sobreviven a setStyle;
  // si algún día se añaden capas o fuentes propias, habría que volver a
  // pintarlas en el evento 'style.load'.
  useEffect(() => onColorSchemeChange((dark) => {
    mapRef.current?.setStyle(dark ? MAPBOX_STYLE_DARK : MAPBOX_STYLE_LIGHT);
  }), []);

  // Update markers
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;

    const updateMarkers = async () => {

      // Clear existing markers
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];

      const q = searchQuery.trim().toLowerCase();
      const filtered = events.filter(e =>
        (!filterCategory || e.category === filterCategory) &&
        (!q || e.title.toLowerCase().includes(q))
      );

      filtered.forEach(event => {
        if (!event.location) return;
        const cat = EVENT_CATEGORIES.find(c => c.key === event.category);
        if (!cat) return;

        // Root element: sized only — Mapbox writes transform here for positioning.
        // No transform-based animation on the root or it overwrites Mapbox's translate.
        const el = document.createElement('div');
        el.style.cssText = 'width: 36px; height: 36px; cursor: pointer;';

        // Inner child carries all visuals and the pulse animation.
        const inner = document.createElement('div');
        inner.className = 'animate-flag-pulse';
        inner.style.cssText = `
          width: 100%; height: 100%; border-radius: 50%;
          background: ${cat.color}; border: 3px solid white;
          box-shadow: 0 2px 12px rgba(0,0,0,0.2);
          display: flex; align-items: center; justify-content: center;
        `;
        inner.innerHTML = getCategoryMarkerSVG(event.category);
        el.appendChild(inner);

        el.addEventListener('click', (ev) => {
          ev.stopPropagation();
          mapRef.current?.flyTo({ center: [event.location!.lng, event.location!.lat], zoom: 17, duration: 600 });
          setSelectedEvent(event);
        });

        try {
          const marker = new mapboxgl.Marker({ element: el })
            .setLngLat([event.location.lng, event.location.lat])
            .addTo(mapRef.current!);
          markersRef.current.push(marker);
        } catch (err) {
          console.error('Failed to add marker for event:', event.id, err);
        }
      });
    };

    updateMarkers();
  }, [events, filterCategory, searchQuery, mapLoaded, setSelectedEvent]);

  // Handle map click for location picking
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;

    const handleClick = async (e: { lngLat: { lng: number; lat: number } }) => {
      if (!pickingLocation) return;
      const { lng, lat } = e.lngLat;
      setPickedLocation({ lng, lat });

      // Update or create the pick marker
      if (pickMarkerRef.current) pickMarkerRef.current.remove();

      const el = document.createElement('div');
      el.style.cssText = `
        width: 40px; height: 40px; border-radius: 50%;
        background: hsl(var(--primary)); border: 3px solid white;
        box-shadow: 0 2px 16px rgba(0,0,0,0.3);
        display: flex; align-items: center; justify-content: center;
      `;
      el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/></svg>`;
      pickMarkerRef.current = new mapboxgl.Marker({ element: el })
        .setLngLat([lng, lat])
        .addTo(mapRef.current!);
    };

    mapRef.current.on('click', handleClick);
    return () => {
      mapRef.current?.off('click', handleClick);
    };
  }, [pickingLocation, mapLoaded]);

  const handleStartPicking = () => {
    setPickReturnsToForm(true);
    setShowCreate(false);
    setPickingLocation(true);
  };

  const handleConfirmLocation = () => {
    setPickingLocation(false);
    setShowCreate(true);
  };

  const handleCancelPicking = () => {
    setPickingLocation(false);
    if (pickMarkerRef.current) {
      pickMarkerRef.current.remove();
      pickMarkerRef.current = null;
    }
    if (pickReturnsToForm) {
      setShowCreate(true);
    } else {
      setPickedLocation(null);
    }
  };

  const handleClearLocation = () => {
    setPickedLocation(null);
    if (pickMarkerRef.current) {
      pickMarkerRef.current.remove();
      pickMarkerRef.current = null;
    }
  };

  const handleCloseCreate = () => {
    setShowCreate(false);
    setPickedLocation(null);
    if (pickMarkerRef.current) {
      pickMarkerRef.current.remove();
      pickMarkerRef.current = null;
    }
  };

  // Live user location → reuse a single marker, smooth camera updates
  useEffect(() => {
    if (!mapRef.current || !mapLoaded || !userLocation) return;
    let cancelled = false;

    (async () => {
      if (cancelled) return;
      const lngLat: [number, number] = [userLocation.lng, userLocation.lat];

      if (!userMarkerRef.current) {
        const el = document.createElement('div');
        el.className = 'user-location-marker';
        el.innerHTML = '<div class="user-location-marker__pulse"></div><div class="user-location-marker__dot"></div>';
        userMarkerRef.current = new mapboxgl.Marker({ element: el })
          .setLngLat(lngLat)
          .addTo(mapRef.current);
      } else {
        userMarkerRef.current.setLngLat(lngLat);
      }

      // Auto-center on first fix; afterwards only easeTo softly if user is far off-screen
      if (!hasAutoCenteredRef.current) {
        hasAutoCenteredRef.current = true;
        mapRef.current.flyTo({ center: lngLat, zoom: 16, duration: 900, essential: true });
      } else {
        const bounds = mapRef.current.getBounds();
        if (bounds && !bounds.contains(lngLat)) {
          mapRef.current.easeTo({ center: lngLat, duration: 800 });
        }
      }
    })();

    return () => { cancelled = true; };
  }, [userLocation, mapLoaded]);

  // Cleanup marker on unmount
  useEffect(() => () => {
    if (userMarkerRef.current) {
      userMarkerRef.current.remove();
      userMarkerRef.current = null;
    }
  }, []);

  // Surface permission/GPS errors once.
  //
  // La condición mira también `location`: watchPosition puede entregar un
  // error DESPUÉS de haber dado posiciones buenas (precisión aproximada,
  // un fallo puntual del GPS), y entonces salía un aviso de "ubicación
  // denegada" con el punto azul pintado en el mapa, contradiciéndose solo.
  useEffect(() => {
    if (userLocation) {
      // Si acabó llegando la posición, el aviso vuelve a estar disponible
      // por si de verdad se revoca el permiso más adelante.
      deniedToastShownRef.current = false;
      return;
    }
    if (permission === 'denied' && !deniedToastShownRef.current) {
      deniedToastShownRef.current = true;
      toast({
        title: t('map.locDenied'),
        description: t('map.locDeniedDesc'),
        variant: 'destructive',
      });
    } else if (permission === 'unsupported' && !deniedToastShownRef.current) {
      deniedToastShownRef.current = true;
      toast({
        title: t('map.gpsUnavailable'),
        description: t('map.gpsUnavailableDesc'),
        variant: 'destructive',
      });
    }
  }, [permission, userLocation, t]);

  useEffect(() => {
    if (geoError && geoError.code !== geoError.PERMISSION_DENIED) {
      toast({
        title: t('map.locError'),
        description: geoError.message || t('map.locErrorDesc'),
      });
    }
  }, [geoError, t]);

  const handleRecenter = useCallback(() => {
    if (!mapRef.current || !userLocation) {
      toast({ title: t('map.waitingGps'), description: t('map.waitingGpsDesc') });
      return;
    }
    mapRef.current.flyTo({
      center: [userLocation.lng, userLocation.lat],
      zoom: 16.5,
      duration: 700,
      essential: true,
    });
  }, [userLocation, t]);

  const filteredCategories: Array<{ key: string | null; label: string; Icon: LucideIcon }> = [
    { key: null, label: t('map.all'), Icon: Layers },
    ...EVENT_CATEGORIES.map(c => ({ key: c.key as string | null, label: c.label, Icon: CATEGORY_ICONS[c.key] })),
  ];


  return (
    <div className="relative w-full h-screen">
      <Helmet>
        <title>{pageTitle(t('map.title'))}</title>
        <meta name="description" content={t('map.metaDesc')} />
        <link rel="canonical" href="/" />
        <meta property="og:title" content={pageTitle(t('map.title'))} />
        <meta property="og:description" content={t('map.metaDesc')} />
        <meta property="og:url" content="/" />
      </Helmet>
      <h1 className="sr-only">{t('map.title')}</h1>
      {/* Map container — altura explícita (h-full/w-full) porque mapbox añade
          .mapboxgl-map { position: relative }, que pisa el `absolute` y, sin
          altura propia, el contenedor colapsa a 0 → mapa en blanco. */}
      <div ref={mapContainer} className="absolute inset-0 h-full w-full" />

      {/* Fallback if no mapbox token */}
      {!mapboxToken && (
        <div className="absolute inset-0 bg-muted flex items-center justify-center">
          <div className="text-center p-6 space-y-3">
            <MapIcon aria-hidden="true" className="w-12 h-12 mx-auto text-muted-foreground" />
            <h2 className="text-lg font-bold text-foreground">Map Preview</h2>
            <p className="text-sm text-muted-foreground max-w-xs">
              Add your Mapbox token as VITE_MAPBOX_TOKEN to see the interactive map.
              Events will still appear below.
            </p>
            <div className="mt-4 space-y-2 max-h-60 overflow-y-auto">
              {events.map(event => {
                const cat = EVENT_CATEGORIES.find(c => c.key === event.category);
                return (
                  <button
                    key={event.id}
                    onClick={() => setSelectedEvent(event)}
                    className="w-full p-3 bg-card rounded-xl shadow-soft text-left"
                  >
                    <div className="flex items-center gap-2">
                      {cat && (() => { const Icon = CATEGORY_ICONS[cat.key]; return <Icon className="w-4 h-4 text-muted-foreground" />; })()}
                      <span className="font-semibold text-sm">{event.title}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Location picker overlay */}
      {pickingLocation && (
        <LocationPickerOverlay
          onConfirm={handleConfirmLocation}
          onCancel={handleCancelPicking}
          hasPin={!!pickedLocation}
        />
      )}

      {/* Filter pills + view toggle - hide during picking.

          z-20 y no z-10: la vista de lista es un `absolute inset-0` que va
          después en el DOM, así que con el mismo z-10 tapaba esta barra
          entera — incluido el botón que devuelve al mapa, y no había forma
          de salir de la lista. La lista reserva 5rem arriba precisamente
          para dejar ver esta barra. */}
      {!pickingLocation && (
        <div
          ref={topBarRef}
          className={cn(
            'absolute top-0 left-0 right-0 z-20 px-4 pb-3 pt-[calc(1rem+env(safe-area-inset-top,0px))]',
            // Sobre el mapa flota transparente. Sobre la lista se convierte
            // en cabecera: sin fondo, las tarjetas se veían pasar por los
            // huecos entre las pastillas al hacer scroll.
            viewMode === 'list' && 'bg-background/85 backdrop-blur-xl border-b border-border',
          )}
        >
          {/* Search bar */}
          <div className="flex items-center gap-2 mb-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={t('map.searchEvents')}
                className="w-full h-11 pl-9 pr-11 rounded-full text-sm font-medium border border-border shadow-soft bg-background/80 backdrop-blur-xl focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  aria-label={t('common.clearSearch')}
                  className="absolute right-0 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center text-muted-foreground"
                >
                  <XIcon className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
          <div className="flex gap-2 items-center">
            <div className="flex gap-2 overflow-x-auto no-scrollbar py-1 flex-1">
              {filteredCategories.map(cat => (
                <button
                  key={cat.key ?? 'all'}
                  onClick={() => setFilterCategory(cat.key)}
                  className={cn(
                    'flex items-center gap-1.5 min-h-[44px] px-4 rounded-full text-xs font-semibold whitespace-nowrap transition-all shadow-soft',
                    filterCategory === cat.key
                      ? 'bg-primary text-primary-foreground'
                      : 'glass text-foreground border border-border'
                  )}
                >
                  <cat.Icon className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>{cat.key != null ? t('categories.' + cat.key) : cat.label}</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => setViewMode(v => v === 'map' ? 'list' : 'map')}
              aria-label={viewMode === 'map' ? t('map.listView') : t('map.mapView')}
              className="flex-shrink-0 w-11 h-11 rounded-full glass border border-border flex items-center justify-center shadow-soft text-foreground"
            >
              {viewMode === 'map' ? <List className="w-4 h-4" /> : <MapIcon className="w-4 h-4" />}
            </button>
          </div>
        </div>
      )}

      {/* List view overlay */}
      {!pickingLocation && viewMode === 'list' && (
        <div
          className="absolute inset-0 z-10 bg-background overflow-y-auto px-4 pb-nav pt-[calc(8.5rem+env(safe-area-inset-top,0px))]"
          // El valor de la clase es solo el respaldo para el primer pintado,
          // antes de que la barra se haya medido.
          style={topBarHeight ? { paddingTop: topBarHeight + 12 } : undefined}
        >
          <EventListView
            events={events}
            filterCategory={filterCategory}
            searchQuery={searchQuery}
            onSelect={(event) => { setSelectedEvent(event); setViewMode('map'); }}
          />
        </div>
      )}

      {/* Recenter on user - hide during picking */}
      {!pickingLocation && (
        <button
          onClick={handleRecenter}
          aria-label={t('map.recenter')}
          className={cn(
            'absolute above-nav mb-24 right-4 z-10 w-12 h-12 rounded-full flex items-center justify-center shadow-lifted active:scale-95 transition-all glass border border-border',
            userLocation ? 'text-primary' : 'text-muted-foreground'
          )}
        >
          <LocateFixed className="w-5 h-5" />
        </button>
      )}

      {/* FAB - hide during picking */}
      {!pickingLocation && (
        <button
          onClick={() => {
            if (pickMarkerRef.current) {
              pickMarkerRef.current.remove();
              pickMarkerRef.current = null;
            }
            setPickedLocation(null);
            setPickReturnsToForm(false);
            setPickingLocation(true);
          }}
          aria-label={t('map.createEvent')}
          className="absolute above-nav mb-4 right-4 z-10 w-14 h-14 bg-primary rounded-full flex items-center justify-center shadow-lifted active:scale-95 transition-transform"
        >
          <Plus className="w-7 h-7 text-primary-foreground" />
        </button>
      )}

      {/* Event bottom sheet */}
      {selectedEvent && (
        <EventBottomSheet
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
        />
      )}

      {/* Create event sheet */}
      {showCreate && (
        <CreateEventSheet
          onClose={handleCloseCreate}
          onPickLocation={handleStartPicking}
          pickedLocation={pickedLocation}
          onClearLocation={handleClearLocation}
        />
      )}
    </div>
  );
}
