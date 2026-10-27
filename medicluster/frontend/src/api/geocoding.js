const cache = new Map();
let lastSearchAt = 0;

export async function geocodeLocation(query) {
  const key = query.trim().toLowerCase();
  if (!key) return [];
  if (cache.has(key)) return cache.get(key);
  const scheduledAt = Math.max(Date.now(), lastSearchAt + 1100);
  lastSearchAt = scheduledAt;
  await new Promise(resolve => setTimeout(resolve, Math.max(0, scheduledAt - Date.now())));
  const endpoint = window.MEDICLUSTER_GEOCODING_URL || 'https://nominatim.openstreetmap.org/search';
  const url = new URL(endpoint, window.location.origin);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');
  url.searchParams.set('q', query.trim());
  const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('Location search is unavailable. Move the map to your location instead.');
  const results = await response.json();
  if (!Array.isArray(results)) throw new Error('Location search returned an invalid response.');
  const valid = results.filter(result => {
    const latitude = Number(result.lat), longitude = Number(result.lon);
    return Number.isFinite(latitude) && Math.abs(latitude) <= 90 && Number.isFinite(longitude) && Math.abs(longitude) <= 180;
  });
  if (cache.size >= 50) cache.delete(cache.keys().next().value);
  cache.set(key, valid);
  return valid;
}
