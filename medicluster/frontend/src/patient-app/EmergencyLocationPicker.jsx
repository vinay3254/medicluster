import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { geocodeLocation } from '../api/geocoding';

export default function EmergencyLocationPicker({ initialLocation, busy, onConfirm, onCancel }) {
  const host = useRef(null), map = useRef(null), marker = useRef(null);
  const [query, setQuery] = useState(''), [searching, setSearching] = useState(false);
  const [pin, setPin] = useState(initialLocation || null), [picked, setPicked] = useState(false), [error, setError] = useState('');
  const [label, setLabel] = useState('Patient-confirmed map location');
  const choose = useRef(null);
  choose.current = (point, exact = true) => {
    const value = { latitude: point.lat, longitude: point.lng };
    setPin(value); setPicked(exact); setError('');
    marker.current?.setLatLng(point);
  };
  useEffect(() => {
    const at = initialLocation ? [initialLocation.latitude, initialLocation.longitude] : [20.5937, 78.9629];
    map.current = L.map(host.current, { zoomControl: false }).setView(at, initialLocation ? 13 : 5);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom: 19 }).addTo(map.current);
    L.control.zoom({ position: 'bottomright' }).addTo(map.current);
    marker.current = L.marker(at, { draggable: true, title: 'Selected pickup location', icon: L.divIcon({ className: 'pt-tracking-pin origin', html: '<span>+</span>', iconSize: [26, 26], iconAnchor: [13, 13] }) }).addTo(map.current);
    marker.current.on('dragend', () => choose.current(marker.current.getLatLng()));
    map.current.on('click', event => choose.current(event.latlng));
    const observer = new ResizeObserver(() => map.current?.invalidateSize()); observer.observe(host.current);
    return () => { observer.disconnect(); map.current?.remove(); map.current = null; };
  }, []);
  const search = async event => {
    event.preventDefault(); if (!query.trim() || searching) return;
    setSearching(true); setError('');
    try {
      const results = await geocodeLocation(query);
      if (!results.length) throw new Error('Area not found. Try a nearby landmark or move the map.');
      const found = results[0], point = { lat: Number(found.lat), lng: Number(found.lon) };
      setLabel(String(found.display_name || query).slice(0, 300));
      choose.current(point, false); map.current.setView(point, 16);
    } catch (err) { setError(err.message); }
    finally { setSearching(false); }
  };
  return <section className="pt-card pt-grow pt-stack">
    <h2>Choose pickup location</h2>
    <form className="pt-actions" onSubmit={search}>
      <label className="sr-only" htmlFor="sos-location-search">Area or landmark</label>
      <input id="sos-location-search" className="pt-location-search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Area or landmark" maxLength={300} disabled={busy || searching} />
      <button className="pt-button-secondary" type="submit" disabled={busy || searching || !query.trim()}>{searching ? 'Searching…' : 'Find area'}</button>
    </form>
    <p className="pt-muted">Search finds an area. Tap map or drag pin to your exact pickup spot before confirming.</p>
    {error && <p role="alert" className="pt-message pt-message-error">{error}</p>}
    <div ref={host} className="pt-map" aria-label="Choose exact SOS pickup location on map" />
    <p className="pt-muted">{pin ? `${pin.latitude.toFixed(6)}, ${pin.longitude.toFixed(6)}` : 'Choose your pickup spot on the map.'}</p>
    <div className="pt-actions"><button type="button" className="pt-button-secondary" disabled={busy} onClick={onCancel}>Cancel</button><button type="button" className="pt-button" disabled={!picked || busy || searching} onClick={() => onConfirm({ ...pin, locationAddress: label })}>{busy ? 'Saving…' : 'Confirm location'}</button></div>
  </section>;
}
