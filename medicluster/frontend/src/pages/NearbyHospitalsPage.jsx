import { useCallback, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Navigation, Search, Hospital, ArrowUpRight } from 'lucide-react';
import { fetchNearbyHospitals } from '../api/nearbyHospitals';
import { geocodeLocation } from '../api/geocoding';
import { Page } from '../components/ui';
import './NearbyHospitalsPage.css';

const DEFAULT_CENTER = [20.5937, 78.9629];
const directionsUrl = h => `https://www.google.com/maps/dir/?api=1&destination=${h.lat},${h.lng}`;
const markerIcon = (selected = false, origin = false) => L.divIcon({
  className: `mc-hospital-pin${selected ? ' is-selected' : ''}${origin ? ' is-origin' : ''}`,
  html: origin ? '<span></span>' : '<span aria-hidden="true">+</span>', iconSize: [30, 30], iconAnchor: [15, 15],
});

export default function NearbyHospitalsPage() {
  const mapNode = useRef(null);
  const mapRef = useRef(null);
  const layers = useRef(null);
  const applyRef = useRef(null);
  const requestId = useRef(0);
  const listRef = useRef(null);
  const [query, setQuery] = useState('');
  const [center, setCenter] = useState(null);
  const [radius, setRadius] = useState(5);
  const [hospitals, setHospitals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [locationLabel, setLocationLabel] = useState('Choose your starting point');
  const [view, setView] = useState('Search');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(2);

  const fetchHospitals = useCallback(async (c, radiusKm, label) => {
    const id = ++requestId.current;
    setCenter(c);
    setLocationLabel(label || `${c.lat.toFixed(4)}, ${c.lng.toFixed(4)}`);
    setLoading(true);
    setError('');
    setHospitals([]);
    setSelectedId(null);
    setPage(0);
    mapRef.current?.setView([c.lat, c.lng], 13);
    try {
      const results = await fetchNearbyHospitals(c, radiusKm);
      if (id !== requestId.current) return;
      setHospitals(results);
      if (results.length) mapRef.current?.fitBounds(L.latLngBounds([[c.lat, c.lng], ...results.map(h => [h.lat, h.lng])]), { padding: [35, 35], maxZoom: 15 });
      setView('Results');
    } catch {
      if (id === requestId.current) setError('Hospital search is unavailable. Please try again.');
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);
  applyRef.current = c => fetchHospitals(c, radius);

  useEffect(() => {
    const map = L.map(mapNode.current, { zoomControl: false }).setView(DEFAULT_CENTER, 5);
    mapRef.current = map;
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.tileLayer(window.MEDICLUSTER_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors', maxZoom: 19,
    }).addTo(map);
    layers.current = L.layerGroup().addTo(map);
    map.on('click', e => applyRef.current({ lat: e.latlng.lat, lng: e.latlng.lng }));
    const observer = new ResizeObserver(() => {
      map.invalidateSize();
      layers.current?.eachLayer(layer => {
        if (layer.isPopupOpen?.()) layer.getPopup().update();
      });
    });
    observer.observe(mapNode.current);
    return () => { observer.disconnect(); map.remove(); mapRef.current = null; requestId.current++; };
  }, []);

  const selectHospital = useCallback(h => {
    setSelectedId(h.place_id);
    mapRef.current?.setView([h.lat, h.lng], 16);
  }, []);

  useEffect(() => {
    if (!layers.current) return;
    layers.current.clearLayers();
    if (center) L.marker([center.lat, center.lng], { icon: markerIcon(false, true), title: 'Search location' }).addTo(layers.current).bindTooltip('Search location');
    hospitals.forEach(h => {
      const popup = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = h.name;
      const address = document.createElement('p');
      address.textContent = h.address || `${h.distKm.toFixed(1)} km from search location`;
      const link = document.createElement('a');
      link.textContent = 'Get directions ↗'; link.href = directionsUrl(h); link.target = '_blank'; link.rel = 'noopener noreferrer';
      popup.append(title, address, link);
      const marker = L.marker([h.lat, h.lng], { icon: markerIcon(selectedId === h.place_id), title: h.name, alt: h.name }).addTo(layers.current).bindPopup(popup);
      marker.on('click', () => {
        setSelectedId(h.place_id);
        setPage(Math.floor(hospitals.indexOf(h) / pageSize));
      });
      if (selectedId === h.place_id) marker.openPopup();
    });
  }, [center, hospitals, selectedId, pageSize]);

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.height > 0) setPageSize(Math.max(1, Math.floor(entry.contentRect.height / 112)));
    });
    observer.observe(listRef.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => setPage(0), [pageSize]);

  async function search(event) {
    event.preventDefault();
    if (!query.trim() || loading) return;
    const id = ++requestId.current;
    setLoading(true); setError('');
    try {
      const results = await geocodeLocation(query.trim());
      if (id !== requestId.current) return;
      if (!results.length) { setError('Location not found. Try a city or a more specific address.'); setLoading(false); return; }
      const found = results[0];
      await fetchHospitals({ lat: Number(found.lat), lng: Number(found.lon) }, radius, found.display_name.split(',').slice(0, 3).join(','));
    } catch {
      if (id === requestId.current) { setError('Location search is unavailable. Try your current location or click the map.'); setLoading(false); }
    }
  }

  function useMyLocation() {
    if (!navigator.geolocation) { setError('Your browser does not support location access. Search for an address instead.'); return; }
    setGeoLoading(true); setError('');
    navigator.geolocation.getCurrentPosition(position => {
      setGeoLoading(false);
      const accuracy = position.coords.accuracy;
      const label = Number.isFinite(accuracy) ? `Your current location · accuracy about ${Math.round(accuracy)} m` : 'Your current location';
      fetchHospitals({ lat: position.coords.latitude, lng: position.coords.longitude }, radius, label);
    }, () => { setGeoLoading(false); setError('Location access was unavailable. Search for a city or address instead.'); }, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
  }

  const pages = Math.max(1, Math.ceil(hospitals.length / pageSize));
  const currentPage = Math.min(page, pages - 1);
  const visible = hospitals.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  return (
    <Page title="Nearby hospitals" sub="Find care close to you, wherever you are." className="mc-hospitals-page">
      <nav className="mc-hospital-views" aria-label="Hospital finder views">
        {['Search', 'Map', 'Results'].map(name => <button key={name} type="button" aria-pressed={view === name} onClick={() => setView(name)}>{name}{name === 'Results' && hospitals.length > 0 ? ` (${hospitals.length})` : ''}</button>)}
      </nav>
      {error && <p role="alert" className="mc-hospital-error">{error}</p>}
      <div className="mc-hospital-workspace" data-view={view}>
        <section className="mc-hospital-search" aria-labelledby="hospital-search-title">
          <div className="mc-hospital-search-heading"><span className="mc-hospital-icon"><MapPin size={20} /></span><div><h2 id="hospital-search-title">Where do you need care?</h2><p>Search an address or choose a point on the map.</p></div></div>
          <form onSubmit={search} className="mc-hospital-search-form">
            <label className="sr-only" htmlFor="hospital-location">City, area, or address</label>
            <div className="mc-hospital-query"><Search size={17} aria-hidden="true" /><input id="hospital-location" value={query} onChange={e => setQuery(e.target.value)} placeholder="City, area, or address…" autoComplete="off" /><button type="submit" disabled={loading || !query.trim()}>{loading ? 'Searching…' : 'Search'}</button></div>
            <button className="mc-hospital-gps" type="button" onClick={useMyLocation} disabled={geoLoading || loading}><Navigation size={15} aria-hidden="true" />{geoLoading ? 'Locating…' : 'Use my location'}</button>
          </form>
          <p className="mc-hospital-search-credit">Location search by <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a></p>
          <fieldset className="mc-hospital-radius"><legend>Search radius</legend>{[2, 5, 10, 20].map(r => <button type="button" key={r} aria-pressed={radius === r} disabled={loading || geoLoading} onClick={() => { setRadius(r); if (center) fetchHospitals(center, r, locationLabel); }}>{r} km</button>)}</fieldset>
        </section>
        <section className="mc-hospital-map-card" aria-label="Hospital map">
          <div className="mc-hospital-map-caption"><MapPin size={16} aria-hidden="true" /><span title={locationLabel}>{locationLabel}</span><span className="mc-hospital-map-live">Map</span></div>
          <div ref={mapNode} className="mc-hospital-map" aria-label="Interactive map. Click to search hospitals at a location." />
        </section>
        <section className="mc-hospital-results" aria-labelledby="hospital-results-title" aria-busy={loading}>
          <div className="mc-hospital-results-heading"><div><span className="mc-hospital-eyebrow">CARE NEAR YOU</span><h2 id="hospital-results-title">{hospitals.length ? `${hospitals.length} places nearby` : 'Your nearby care'}</h2></div><Hospital size={23} aria-hidden="true" /></div>
          <div className="mc-hospital-list" ref={listRef}>
            {loading ? <div className="mc-hospital-empty" role="status"><span className="mc-hospital-icon"><Search size={24} /></span><h3>Finding nearby care…</h3><p>Searching OpenStreetMap hospitals and clinics.</p></div> : hospitals.length ? <ul aria-label="Nearby hospitals">{visible.map(h => <li key={h.place_id} className={selectedId === h.place_id ? 'is-selected' : ''}>
              <button className="mc-hospital-select" type="button" aria-pressed={selectedId === h.place_id} onClick={() => selectHospital(h)}><span className="mc-hospital-name" title={h.name}>{h.name}</span><span className="mc-hospital-meta">{h.isHospital ? 'Hospital' : 'Clinic'} · {h.distKm.toFixed(1)} km {h.emergency ? '· Emergency' : ''}</span></button>
              <div className="mc-hospital-details"><span title={h.address}>{h.address || 'Address not listed'}{h.phone ? ` · ${h.phone}` : ''}</span><a href={directionsUrl(h)} target="_blank" rel="noopener noreferrer" aria-label={`Directions to ${h.name}`}>Directions <ArrowUpRight size={13} /></a></div>
            </li>)}</ul> : <div className="mc-hospital-empty" role="status"><span className="mc-hospital-icon"><Hospital size={26} /></span><h3>{error ? 'Search unavailable' : center ? 'No places found' : 'A little closer to care'}</h3><p>{error || (center ? `Try a larger radius than ${radius} km, or choose another location.` : 'Search a location to see hospitals and clinics, ordered by distance.')}</p></div>}
          </div>
          <nav className="mc-hospital-pagination" aria-label="Hospital result pages"><button type="button" disabled={!hospitals.length || currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</button><span aria-live="polite">{hospitals.length ? `${currentPage + 1} of ${pages}` : 'No results yet'}</span><button type="button" disabled={!hospitals.length || currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)}>Next</button></nav>
          <p className="mc-hospital-data-note">OpenStreetMap listings · Contact the facility to confirm services.</p>
        </section>
      </div>
    </Page>
  );
}
