const { request, unavailable } = require('../db/supabase');
async function query(path, options = {}) {
  const response = await request(`/rest/v1/${path}`, options);
  if (!response.ok) throw unavailable('Emergency dispatch service unavailable');
  try { return await response.json(); } catch { throw unavailable('Emergency dispatch service unavailable'); }
}
const incidentColumns = 'id,status,created_at,updated_at,location_lat,location_lng,assigned_ambulance_id,assigned_hospital_id';
async function ensureIncident(row) {
  await query('incidents?on_conflict=id&select=id', {
    method: 'POST', headers: { 'content-type': 'application/json', Prefer: 'resolution=ignore-duplicates,return=representation' },
    body: JSON.stringify({ id: row.incidentId, incident_type: 'Medical emergency', severity: 'HIGH', status: 'PENDING', location_address: 'Patient shared pickup location', location_lat: row.latitude, location_lng: row.longitude, description: row.description, is_sos: true, patients_count: 1 }),
  });
}
async function track(row) {
  const incidents = await query(`incidents?id=eq.${encodeURIComponent(row.incidentId)}&select=${incidentColumns}&limit=1`);
  const incident = incidents[0];
  if (!incident) throw unavailable('Emergency request has not reached dispatch; retry your request');
  let ambulance = null; let hospital = null;
  if (incident.assigned_ambulance_id) {
    const rows = await query(`ambulances?id=eq.${encodeURIComponent(incident.assigned_ambulance_id)}&select=call_sign,latitude,longitude,last_ping&limit=1`);
    if (rows[0]) ambulance = { callSign: rows[0].call_sign, latitude: rows[0].latitude, longitude: rows[0].longitude, lastPing: rows[0].last_ping };
  }
  if (incident.assigned_hospital_id) {
    const rows = await query(`hospitals?id=eq.${encodeURIComponent(incident.assigned_hospital_id)}&select=name,latitude,longitude&limit=1`);
    if (rows[0]) hospital = rows[0];
  }
  return { id: incident.id, status: incident.status, createdAt: incident.created_at, updatedAt: incident.updated_at, location: { latitude: incident.location_lat, longitude: incident.location_lng }, ambulance, hospital };
}
async function correctLocation(row, { latitude, longitude, locationAddress }) {
  const update = { location_lat: latitude, location_lng: longitude };
  if (locationAddress !== undefined) update.location_address = locationAddress;
  // Dispatch assignment and status must still permit the move at write time.
  const changed = await query(`incidents?id=eq.${encodeURIComponent(row.incidentId)}&status=eq.PENDING&assigned_ambulance_id=is.null&select=id`, {
    method: 'PATCH', headers: { 'content-type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(update),
  });
  if (!Array.isArray(changed)) throw unavailable('Emergency dispatch service unavailable');
  if (!changed.length) throw Object.assign(new Error('This emergency can no longer be moved; call dispatch to correct your location'), { status: 409 });
  return track(row);
}
module.exports = { ensureIncident, track, correctLocation };
