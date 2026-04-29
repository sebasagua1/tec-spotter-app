import { useEffect, useRef, useState, useCallback } from 'react';
import { Plus, LocateFixed } from 'lucide-react';
import { useEventStore } from '@/stores/eventStore';
import { EVENT_CATEGORIES, TEC_CENTER } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { EventBottomSheet } from '@/components/map/EventBottomSheet';
import { CreateEventSheet } from '@/components/map/CreateEventSheet';
import { LocationPickerOverlay } from '@/components/map/LocationPickerOverlay';
import { supabase } from '@/integrations/supabase/client';
import { useUserLocation } from '@/hooks/useUserLocation';
import { toast } from '@/hooks/use-toast';
import 'mapbox-gl/dist/mapbox-gl.css';

export default function MapHome() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const { events, setEvents, selectedEvent, setSelectedEvent, filterCategory, setFilterCategory } = useEventStore();
  const [showCreate, setShowCreate] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapboxToken, setMapboxToken] = useState<string | null>(null);
  const [pickingLocation, setPickingLocation] = useState(false);
  const [pickedLocation, setPickedLocation] = useState<{ lng: number; lat: number } | null>(null);
  const pickMarkerRef = useRef<any>(null);
  const userMarkerRef = useRef<any>(null);
  const hasAutoCenteredRef = useRef(false);
  const deniedToastShownRef = useRef(false);

  const { location: userLocation, error: geoError, permission } = useUserLocation({
    enableHighAccuracy: true,
    maximumAge: 4000,
    timeout: 15000,
  });


  // Fetch events
  useEffect(() => {
    const fetchEvents = async () => {
      const { data } = await supabase
        .from('events')
        .select('*')
        .eq('is_active', true);
      if (data) {
        const mapped = data.map((e: any) => ({
          ...e,
          location: e.lng != null && e.lat != null ? { lng: e.lng, lat: e.lat } : null,
        }));
        setEvents(mapped);
      }
    };
    fetchEvents();

    // Realtime subscription
    const channel = supabase
      .channel('events-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, () => {
        fetchEvents();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [setEvents]);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const initMap = async () => {
      const mapboxgl = (await import('mapbox-gl')).default;

      // Try build-time env first, then fetch from backend
      let token = import.meta.env.VITE_MAPBOX_TOKEN || '';
      if (!token) {
        try {
          const { data, error } = await supabase.functions.invoke('get-mapbox-token');
          if (!error && data?.token) {
            token = data.token;
          }
        } catch {}
      }
      if (!token) {
        setMapboxToken(null);
        return;
      }
      setMapboxToken(token);
      mapboxgl.accessToken = token;

      const map = new mapboxgl.Map({
        container: mapContainer.current!,
        style: 'mapbox://styles/mapbox/light-v11',
        center: [TEC_CENTER.lng, TEC_CENTER.lat],
        zoom: 15.5,
        pitch: 0,
        attributionControl: false,
      });

      // Note: we use our own watchPosition-based marker instead of GeolocateControl


      map.on('load', () => {
        setMapLoaded(true);
      });

      mapRef.current = map;
    };

    initMap();

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Update markers
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;

    const updateMarkers = async () => {
      const mapboxgl = (await import('mapbox-gl')).default;

      // Clear existing markers
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];

      const filtered = filterCategory
        ? events.filter(e => e.category === filterCategory)
        : events;

      filtered.forEach(event => {
        if (!event.location) return;
        const cat = EVENT_CATEGORIES.find(c => c.key === event.category);
        if (!cat) return;

        const el = document.createElement('div');
        el.className = 'animate-flag-pulse cursor-pointer';
        el.style.cssText = `
          width: 36px; height: 36px; border-radius: 50%;
          background: ${cat.color}; border: 3px solid white;
          box-shadow: 0 2px 12px rgba(0,0,0,0.2);
          display: flex; align-items: center; justify-content: center;
          font-size: 16px;
        `;
        el.innerHTML = cat.emoji;
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
        } catch {}
      });
    };

    updateMarkers();
  }, [events, filterCategory, mapLoaded, setSelectedEvent]);

  // Handle map click for location picking
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;

    const handleClick = async (e: any) => {
      if (!pickingLocation) return;
      const { lng, lat } = e.lngLat;
      setPickedLocation({ lng, lat });

      // Update or create the pick marker
      const mapboxgl = (await import('mapbox-gl')).default;
      if (pickMarkerRef.current) pickMarkerRef.current.remove();

      const el = document.createElement('div');
      el.style.cssText = `
        width: 40px; height: 40px; border-radius: 50%;
        background: hsl(var(--primary)); border: 3px solid white;
        box-shadow: 0 2px 16px rgba(0,0,0,0.3);
        display: flex; align-items: center; justify-content: center;
        font-size: 20px;
      `;
      el.innerHTML = '📍';
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
    setShowCreate(false);
    setPickingLocation(true);
  };

  const handleConfirmLocation = () => {
    setPickingLocation(false);
    setShowCreate(true);
  };

  const handleCancelPicking = () => {
    setPickingLocation(false);
    setPickedLocation(null);
    if (pickMarkerRef.current) {
      pickMarkerRef.current.remove();
      pickMarkerRef.current = null;
    }
    setShowCreate(true);
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
      const mapboxgl = (await import('mapbox-gl')).default;
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

  // Surface permission/GPS errors once
  useEffect(() => {
    if (permission === 'denied' && !deniedToastShownRef.current) {
      deniedToastShownRef.current = true;
      toast({
        title: 'Ubicación denegada',
        description: 'Activa los permisos de ubicación para ver tu posición en el mapa.',
        variant: 'destructive',
      });
    } else if (permission === 'unsupported' && !deniedToastShownRef.current) {
      deniedToastShownRef.current = true;
      toast({
        title: 'GPS no disponible',
        description: 'Tu dispositivo o navegador no soporta geolocalización.',
        variant: 'destructive',
      });
    }
  }, [permission]);

  useEffect(() => {
    if (geoError && geoError.code !== geoError.PERMISSION_DENIED) {
      toast({
        title: 'No pudimos obtener tu ubicación',
        description: geoError.message || 'Inténtalo de nuevo en un momento.',
      });
    }
  }, [geoError]);

  const handleRecenter = useCallback(() => {
    if (!mapRef.current || !userLocation) {
      toast({ title: 'Aún sin señal GPS', description: 'Esperando tu ubicación…' });
      return;
    }
    mapRef.current.flyTo({
      center: [userLocation.lng, userLocation.lat],
      zoom: 16.5,
      duration: 700,
      essential: true,
    });
  }, [userLocation]);

  const filteredCategories = [
    { key: null, label: 'All', emoji: '🗺️' },
    ...EVENT_CATEGORIES,
  ];


  return (
    <div className="relative w-full h-screen">
      {/* Map container */}
      <div ref={mapContainer} className="absolute inset-0" />

      {/* Fallback if no mapbox token */}
      {!mapboxToken && (
        <div className="absolute inset-0 bg-muted flex items-center justify-center">
          <div className="text-center p-6 space-y-3">
            <div className="text-5xl">🗺️</div>
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
                      <span>{cat?.emoji}</span>
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

      {/* Filter pills - hide during picking */}
      {!pickingLocation && (
        <div className="absolute top-4 left-0 right-0 z-10 px-4 safe-top">
          <div className="flex gap-2 overflow-x-auto no-scrollbar py-1">
            {filteredCategories.map(cat => (
              <button
                key={cat.key ?? 'all'}
                onClick={() => setFilterCategory(cat.key)}
                className={cn(
                  'flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all shadow-soft',
                  filterCategory === cat.key
                    ? 'bg-primary text-primary-foreground'
                    : 'glass text-foreground border border-border'
                )}
              >
                <span>{cat.emoji}</span>
                <span>{cat.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* FAB - hide during picking */}
      {!pickingLocation && (
        <button
          onClick={() => setShowCreate(true)}
          className="absolute bottom-24 right-4 z-10 w-14 h-14 bg-primary rounded-full flex items-center justify-center shadow-lifted active:scale-95 transition-transform"
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
