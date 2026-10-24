import { useState, useCallback, useRef } from 'react';
import { GoogleMap, useJsApiLoader, Marker, InfoWindow } from '@react-google-maps/api';
import { fetchNearbyHospitals } from '../api/nearbyHospitals';
import { Page } from "../components/ui";

const LIBRARIES = [];
const MAP_CENTER_DEFAULT = { lat: 20.5937, lng: 78.9629 };
const MAP_OPTIONS = {
  disableDefaultUI: true,
  zoomControl: true,
  mapTypeControl: false,
  streetViewControl: false,
  fullscreenControl: false,
  clickableIcons: false,
};

function hospitalIcon(isHospital) {
  const color = isHospital ? '#c23a34' : '#ad633f';
  const svg = encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <rect x="1" y="1" width="30" height="30" rx="8" fill="${color}" stroke="white" stroke-width="2"/>
      <line x1="8" y1="16" x2="24" y2="16" stroke="white" stroke-width="3.5" stroke-linecap="round"/>
      <line x1="16" y1="8" x2="16" y2="24" stroke="white" stroke-width="3.5" stroke-linecap="round"/>
    </svg>`
  );
  return {
    url: `data:image/svg+xml;charset=UTF-8,${svg}`,
    scaledSize: new window.google.maps.Size(32, 32),
    anchor: new window.google.maps.Point(16, 16),
  };
}

function userLocationIcon() {
  return {
    path: window.google.maps.SymbolPath.CIRCLE,
    scale: 10,
    fillColor: '#ad633f',
    fillOpacity: 1,
    strokeColor: '#ffffff',
    strokeWeight: 3,
  };
}

export default function NearbyHospitalsPage() {
  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_KEY,
    libraries: LIBRARIES,
  });

  const mapRef = useRef(null);
  const [query, setQuery]               = useState('');
  const [center, setCenter]             = useState(null);
  const [radius, setRadius]             = useState(5);
  const [hospitals, setHospitals]       = useState([]);
  const [loading, setLoading]           = useState(false);
  const [geoLoading, setGeoLoading]     = useState(false);
  const [error, setError]               = useState(null);
  const [selectedIdx, setSelectedIdx]   = useState(null);
  const [locationLabel, setLocationLabel] = useState('');

  const onMapLoad = useCallback((map) => { mapRef.current = map; }, []);

  const reverseGeocode = useCallback((c) => {
    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode({ location: c }, (results, status) => {
      if (status === 'OK' && results[0]) {
        setLocationLabel(results[0].formatted_address.split(',').slice(0, 3).join(', '));
      } else {
        setLocationLabel(`${c.lat.toFixed(4)}, ${c.lng.toFixed(4)}`);
      }
    });
  }, []);

  const fetchHospitals = useCallback(async (c, radiusKm) => {
    setLoading(true);
    setError(null);
    setSelectedIdx(null);
    try {
      const mapped = await fetchNearbyHospitals(c, radiusKm);
      if (!mapped.length) {
        setHospitals([]);
        setError(`No hospitals found within ${radiusKm}km. Try increasing the radius.`);
        return;
      }
      setHospitals(mapped);
      if (mapRef.current && mapped.length > 0) {
        const bounds = new window.google.maps.LatLngBounds();
        bounds.extend(c);
        mapped.forEach(h => bounds.extend({ lat: h.lat, lng: h.lng }));
        mapRef.current.fitBounds(bounds, 60);
      }
    } catch {
      setError('Could not fetch hospital data. Check your internet connection.');
    } finally {
      setLoading(false);
    }
  }, []);

  const applyCenter = useCallback((c, label) => {
    setCenter(c);
    setSelectedIdx(null);
    if (label) setLocationLabel(label);
    else reverseGeocode(c);
    fetchHospitals(c, radius);
    mapRef.current?.panTo(c);
  }, [radius, reverseGeocode, fetchHospitals]);

  const handleSearch = useCallback(() => {
    if (!query.trim() || !isLoaded) return;
    setLoading(true);
    setError(null);
    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode({ address: query }, (results, status) => {
      if (status === 'OK' && results[0]) {
        const loc = results[0].geometry.location;
        const c = { lat: loc.lat(), lng: loc.lng() };
        const label = results[0].formatted_address.split(',').slice(0, 3).join(', ');
        applyCenter(c, label);
      } else {
        setError('Location not found. Try a more specific address or city name.');
        setLoading(false);
      }
    });
  }, [query, isLoaded, applyCenter]);

  const handleRadiusChange = useCallback((r) => {
    setRadius(r);
    if (center) fetchHospitals(center, r);
  }, [center, fetchHospitals]);

  const useMyLocation = useCallback(() => {
    if (!navigator.geolocation) { setError('Geolocation is not supported by your browser.'); return; }
    setGeoLoading(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        applyCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGeoLoading(false);
      },
      () => {
        setError('Could not get your location. Please allow location access or search manually.');
        setGeoLoading(false);
      }
    );
  }, [applyCenter]);

  const selectHospital = useCallback((h, idx) => {
    setSelectedIdx(idx);
    if (mapRef.current) {
      mapRef.current.panTo({ lat: h.lat, lng: h.lng });
      mapRef.current.setZoom(16);
    }
  }, []);

  return (
    <Page
      title="Nearby hospitals"
      sub="Search any location or click the map to find hospitals nearby."
      actions={locationLabel && (
        <span className="font-mono text-xs text-slate-600 max-w-xs truncate" title={locationLabel}>{locationLabel}</span>
      )}
    >
      <div className="flex flex-col lg:flex-row gap-8" style={{ minHeight: 0 }}>
        {/* ── Left panel ── */}
        <div className="lg:w-80 flex-shrink-0 flex flex-col gap-4">

          <div className="border-t border-ink p-4 space-y-3">
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Find Hospitals Near</p>

            <div className="flex gap-2">
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder="City, area, or address…"
                className="flex-1 text-sm border border-line rounded-[3px] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ink/10 text-slate-700 placeholder:text-slate-400"
              />
              <button
                onClick={handleSearch}
                disabled={loading || !query.trim() || !isLoaded}
                className="px-3 py-2 bg-ink text-paper rounded-[3px] hover:bg-slate-700 disabled:opacity-50 transition-colors text-sm"
              >
                Search
              </button>
            </div>

            <button
              onClick={useMyLocation}
              disabled={geoLoading || loading || !isLoaded}
              className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-line-strong text-blue-700 rounded-[3px] hover:bg-sunken transition-colors text-sm font-semibold disabled:opacity-50"
            >
              {geoLoading
                ? <><div className="w-3.5 h-3.5 border-2 border-line-strong border-t-blue-600 rounded-full animate-spin" />Getting location…</>
                : <><span></span>Use My Location</>}
            </button>

            <div>
              <p className="text-xs text-slate-500 font-semibold mb-1.5">Search Radius</p>
              <div className="flex gap-1.5">
                {[2, 5, 10, 20].map(r => (
                  <button key={r} onClick={() => handleRadiusChange(r)}
                    className={`flex-1 py-1.5 rounded-[3px] text-xs font-semibold border transition-colors ${ radius === r ? 'bg-ink text-paper border-ink' : 'border-line text-slate-600 hover:border-line-strong' }`}>
                    {r}km
                  </button>
                ))}
              </div>
            </div>

            <p className="text-xs text-slate-400 text-center">
              Or <span className="text-blue-600 font-medium">click anywhere on the map</span> to set location
            </p>
          </div>

          {error && (
            <div className="bg-surface border border-red-200 rounded-[3px] px-4 py-3 flex items-start gap-2">
              <span className="text-red-500 text-sm mt-0.5 flex-shrink-0"></span>
              <p className="text-xs text-red-700">{error}</p>
            </div>
          )}

          {loading && (
            <div className="border-t border-ink p-6 text-center">
              <div className="w-8 h-8 border-2 border-line border-t-blue-600 rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-slate-500">Searching nearby hospitals…</p>
              <p className="text-xs text-slate-400 mt-1">Querying Google Places</p>
            </div>
          )}

          {!loading && !hospitals.length && !error && isLoaded && (
            <div className="border-t border-ink p-8 text-center">
              <div className="text-4xl mb-3"></div>
              <p className="text-sm font-semibold text-slate-700">Search for a location</p>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                Type an address, click "Use My Location", or click anywhere on the map
              </p>
            </div>
          )}

          {!loading && hospitals.length > 0 && (
            <div className="border-t border-ink overflow-hidden">
              <div className="px-4 py-3 border-b border-line flex items-center justify-between sticky top-0 bg-surface">
                <p className="text-xs font-semibold text-slate-700">
                  {hospitals.length} result{hospitals.length !== 1 ? 's' : ''} found
                </p>
                <span className="text-xs text-slate-400">within {radius}km</span>
              </div>

              {hospitals.map((h, i) => {
                const isSelected = selectedIdx === i;
                return (
                  <div
                    key={h.place_id}
                    onClick={() => selectHospital(h, i)}
                    className={`px-4 py-3 cursor-pointer border-b border-slate-50 transition-all hover:bg-slate-50 ${ isSelected ? 'bg-sunken border-l-[3px] border-l-blue-500' : '' }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-800 leading-snug">{h.name}</p>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <span className="text-xs font-semibold text-slate-500">{h.distKm.toFixed(1)} km</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${ h.isHospital ? 'bg-sunken text-blue-700' : 'bg-surface text-emerald-700' }`}>{h.isHospital ? 'Hospital' : 'Medical'}</span>
                          {h.rating && <span className="font-mono text-xs text-slate-500">{h.rating} rating</span>}
                        </div>
                        {h.address && <p className="text-xs text-slate-400 mt-0.5 truncate">{h.address}</p>}
                        <a
                          href={`https://www.google.com/maps/dir/?api=1&destination=${h.lat},${h.lng}`}
                          target="_blank" rel="noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="inline-block mt-1.5 text-xs text-blue-600 hover:underline font-medium"
                        >
                          Get directions ↗
                        </a>
                      </div>
                      <svg className="w-3.5 h-3.5 text-slate-300 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Map ── */}
        <div className="flex-1 rounded-[3px] border border-line overflow-hidden relative" style={{ minHeight: 500 }}>
          {isLoaded ? (
            <GoogleMap
              mapContainerStyle={{ width: '100%', height: '100%' }}
              center={center || MAP_CENTER_DEFAULT}
              zoom={center ? 14 : 5}
              options={MAP_OPTIONS}
              onLoad={onMapLoad}
              onClick={(e) => {
                const c = { lat: e.latLng.lat(), lng: e.latLng.lng() };
                applyCenter(c);
              }}
            >
              {/* User location marker */}
              {center && (
                <Marker position={center} icon={userLocationIcon()} zIndex={2000} title="Chosen Location" />
              )}

              {/* Hospital markers */}
              {hospitals.map((h, i) => (
                <Marker
                  key={h.place_id}
                  position={{ lat: h.lat, lng: h.lng }}
                  icon={hospitalIcon(h.isHospital)}
                  zIndex={1000}
                  onClick={() => selectHospital(h, i)}
                />
              ))}

              {/* Info window for selected hospital */}
              {selectedIdx !== null && hospitals[selectedIdx] && (
                <InfoWindow
                  position={{ lat: hospitals[selectedIdx].lat, lng: hospitals[selectedIdx].lng }}
                  onCloseClick={() => setSelectedIdx(null)}
                >
                  <div style={{ fontFamily: 'system-ui,sans-serif', minWidth: 170, maxWidth: 220 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 3, color: '#222428' }}>
                      {hospitals[selectedIdx].name}
                    </div>
                    <div style={{ color: '#62675e', fontSize: 11 }}>
                      {hospitals[selectedIdx].distKm.toFixed(1)} km away
                      {hospitals[selectedIdx].rating ? ` · ${hospitals[selectedIdx].rating} rating` : ''}
                    </div>
                    {hospitals[selectedIdx].address && (
                      <div style={{ color: '#a19c92', fontSize: 11, marginTop: 2 }}>
                        {hospitals[selectedIdx].address}
                      </div>
                    )}
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${hospitals[selectedIdx].lat},${hospitals[selectedIdx].lng}`}
                      target="_blank" rel="noreferrer"
                      style={{
                        display: 'inline-block', marginTop: 7, padding: '3px 10px',
                        background: '#ad633f', color: 'white', borderRadius: 5,
                        fontSize: 11, fontWeight: 600, textDecoration: 'none',
                      }}
                    >
                      Get Directions ↗
                    </a>
                  </div>
                </InfoWindow>
              )}
            </GoogleMap>
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-slate-100">
              <div className="text-center">
                <div className="w-8 h-8 border-2 border-line-strong border-t-blue-600 rounded-full animate-spin mx-auto mb-3" />
                <p className="text-sm text-slate-500">Loading Google Maps…</p>
              </div>
            </div>
          )}

          {/* Hint overlay when no location selected */}
          {isLoaded && !center && (
            <div style={{ pointerEvents: 'none' }} className="absolute inset-0 flex items-center justify-center">
              <div className="bg-surface/90 backdrop-blur-sm rounded-[3px] px-6 py-4 border border-line text-center max-w-xs">
                <p className="text-sm font-semibold text-slate-700">Pick a location</p>
                <p className="text-xs text-slate-500 mt-1">
                  Search an address, use GPS, or click anywhere on the map to find hospitals near that spot
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </Page>
  );
}
