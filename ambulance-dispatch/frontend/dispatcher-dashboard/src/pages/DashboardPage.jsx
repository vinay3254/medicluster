import React, { useState, useEffect, useCallback } from 'react';
import { Box, Typography, Button, IconButton, Snackbar, Alert, Menu, MenuItem, Divider, ListItemText } from '@mui/material';
import { Close, CheckCircle } from '@mui/icons-material';

import DispatchMap from '../components/DispatchMap';
import IncidentQueue from '../components/IncidentQueue';
import { FILTERS } from '../components/incidentFilters';
import StatsCards from '../components/StatsCards';
import UnitsPanel from '../components/UnitsPanel';
import AIInsightsView from '../components/AIInsightsView';
import AssignmentWizard from '../components/AssignmentWizard';
import SOSAlertModal from '../components/SOSAlertModal';
import LiveTrackingPanel from '../components/LiveTrackingPanel';
import HospitalStatusPanel from '../components/HospitalStatusPanel';
import ActivityFeed from '../components/ActivityFeed';
import ShiftReportModal from '../components/ShiftReportModal';
import IncidentTimeline from '../components/IncidentTimeline';
import QuickCommsPanel from '../components/QuickCommsPanel';
import WeatherWidget from '../components/WeatherWidget';
import GreenCorridorModal from '../components/GreenCorridorModal';
import VoiceAssistantModal from '../components/VoiceAssistantModal';
import FleetRosterModal from '../components/FleetRosterModal';
import { useIncidents, useAmbulances, useHospitals, useDashboardStats } from '../hooks/useData';
import socketService from '../services/socket';
import supabase from '../services/supabase';
import { incidentsApi, assignmentsApi } from '../services/api';
import { dispatchBroadcast, DISPATCH_EVENTS } from '../services/dispatchBroadcast';
import { useNavigate } from 'react-router-dom';
import { T, MONO, SERIF, tagSx, btnSx } from '../theme/dispatchTokens';

/* ── Great-circle distance in km ── */
function hav(lat1, lon1, lat2, lon2) {
  const R = 6371, dLat = (lat2-lat1)*Math.PI/180, dLon = (lon2-lon1)*Math.PI/180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function nearestAvailable(ambulances, incident) {
  if (!incident) return null;
  const avail = ambulances.filter(a => a.latitude && a.longitude && a.status === 'AVAILABLE');
  if (!avail.length) return null;
  return avail.reduce((best, a) => {
    const d = hav(a.latitude, a.longitude, incident.location_lat, incident.location_lng);
    return d < best.d ? { a, d } : best;
  }, { a: null, d: Infinity }).a;
}

function useClock() {
  const fmt = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  const [now, setNow] = useState(fmt);
  useEffect(() => {
    const id = setInterval(() => setNow(fmt()), 15_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function Logo() {
  return (
    <svg width="20" height="20" viewBox="0 0 18 18" aria-hidden="true">
      <rect x="1" y="1" width="6" height="6" fill={T.tx} />
      <rect x="11" y="1" width="6" height="6" fill={T.tx} />
      <rect x="1" y="11" width="6" height="6" fill={T.tx} />
      <rect x="11" y="11" width="6" height="6" fill="#e0703f" />
    </svg>
  );
}

/* ── Segmented control ── */
function Segmented({ items, value, onChange, fullWidth = false, label }) {
  return (
    <Box role="tablist" aria-label={label} sx={{ display: 'flex', border: `1px solid ${T.bd2}`, borderRadius: '999px', p:'3px', gap:'3px', background:T.sf, overflow: 'hidden', width: fullWidth ? '100%' : { xs:'100%', sm:'auto' }, ...(label === 'View' && { order:{ xs:3, sm:0 }, flexShrink:0 }) }}>
      {items.map((it) => {
        const on = it.key === value;
        return (
          <Box key={it.key} component="button" type="button" role="tab" aria-selected={on} onClick={() => onChange(it.key)}
            sx={{
              flex: fullWidth ? 1 : 'none', height: 32, px: '14px', border: 0,
              borderRadius:'999px',
              background: on ? T.tx : 'transparent', color: on ? T.bg : T.tx,
              font: 'inherit', fontSize: 13.5, cursor: 'pointer', whiteSpace: 'nowrap',
              '&:focus-visible': { outline: `2px solid ${T.ac}`, outlineOffset: -2 },
            }}>
            {it.label}
          </Box>
        );
      })}
    </Box>
  );
}

const sectionHead = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: '8px', borderBottom: `1px solid ${T.bd}` };

const NEXT_STEP = {
  DISPATCHED:   { to: 'EN_ROUTE',     label: 'Mark en route',        note: ['Ambulance marked en route', 'info'] },
  EN_ROUTE:     { to: 'ON_SCENE',     label: 'Mark on scene',        note: ['Ambulance arrived on scene', 'warning'] },
  ON_SCENE:     { to: 'TRANSPORTING', label: 'Depart scene',         note: ['Patient in transit to ER', 'info'] },
  TRANSPORTING: { to: 'RESOLVED',     label: 'Complete handover',    note: ['Emergency resolved. Hospital handover complete.', 'success'] },
};

export default function DashboardPage({ user, onLogout }) {
  const { incidents, refetch: refetchIncidents } = useIncidents();
  const { ambulances, refetch: refetchAmbulances } = useAmbulances();
  const { hospitals } = useHospitals();
  const { stats } = useDashboardStats();


  const [selectedIncident, setSelectedIncident]     = useState(null);
  const [activeAssignment, setActiveAssignment]     = useState(null);
  const [focusAmbulance, setFocusAmbulance]         = useState(null);
  const [filter, setFilter]                         = useState('all');
  const [mobilePanel, setMobilePanel] = useState('map');
  const [view, setView]                             = useState('ops'); // 'ops' | 'ai'
  const [toolsAnchor, setToolsAnchor]               = useState(null);
  const [userAnchor, setUserAnchor]                 = useState(null);
  const clock                                       = useClock();
  const [wizardOpen, setWizardOpen]                 = useState(false);
  const [sosModalOpen, setSosModalOpen]             = useState(false);
  const [shiftReportOpen, setShiftReportOpen]       = useState(false);
  const [snackbar, setSnackbar]                     = useState(null);
  const [autoDispatchLoading, setAutoDispatchLoading] = useState(false);
  const [autoDispatchResult, setAutoDispatchResult]   = useState(null);
  const [fleetAmbulances, setFleetAmbulances]       = useState([]);
  const [greenCorridorOpen, setGreenCorridorOpen]   = useState(false);
  const [voiceModalOpen, setVoiceModalOpen]         = useState(false);
  const [rosterOpen, setRosterOpen]                 = useState(false);
  const navigate = useNavigate();

  // Only one map overlay panel open at a time.
  const [panel, setPanel] = useState(null); // 'fleet' | 'hospital' | 'activity' | 'timeline'
  const togglePanel = (name) => setPanel(p => (p === name ? null : name));
  const closeAll = () => setPanel(null);

  useEffect(() => {
    if (!import.meta.env.VITE_WEBSOCKET_URL) return;
    let cancelled = false;
    const connect = session => {
      if (cancelled) return;
      socketService.disconnect();
      if (session?.access_token) socketService.connect(session.access_token);
    };
    supabase.auth.getSession().then(({ data }) => connect(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => connect(session));
    return () => { cancelled = true; subscription.unsubscribe(); socketService.disconnect(); };
  }, []);

  /* ── Incident handlers ── */
  const handleIncidentSelect = (incident) => {
    setSelectedIncident(incident);
    setActiveAssignment(null);
    // Auto-open timeline when an incident is selected
    if (incident) setPanel(p => (p === 'timeline' ? p : null));
  };

  const handleAcknowledge = async () => {
    if (!selectedIncident) return;
    try { await incidentsApi.acknowledge(selectedIncident.id); refetchIncidents(); }
    catch (err) { console.error('Acknowledge failed:', err); }
  };

  /* ── AI Auto-Dispatch ── */
  const handleAutoDispatch = async () => {
    if (!selectedIncident) return;
    setAutoDispatchLoading(true);
    setAutoDispatchResult(null);

    const iLat = selectedIncident.location_lat, iLng = selectedIncident.location_lng;

    // Same pick the "Assign <unit>" button shows.
    const bestAmb = nearestAvailable(fleetAmbulances.length > 0 ? fleetAmbulances : ambulances, selectedIncident);
    if (!bestAmb) { setSnackbar({ message:'No available ambulances', severity:'error' }); setAutoDispatchLoading(false); return; }
    const availH  = hospitals.filter(h => h.latitude && h.longitude && (h.available_beds||0)>0);
    const bestH   = availH.length ? availH.reduce((b,h) => { const d=hav(iLat,iLng,h.latitude,h.longitude); const sc=(1/(d+0.1))*0.6+((h.available_beds||0)/50)*0.4; return sc>b.score?{hosp:h,score:sc,distKm:d}:b; }, { hosp:availH[0], score:-Infinity, distKm:0 }) : null;

    const ambDist = hav(bestAmb.latitude, bestAmb.longitude, iLat, iLng);
    const eta = Math.ceil(ambDist/40*60);

    const result = {
      ambulance: bestAmb, hospital: bestH?.hosp||null,
      ambDistKm: ambDist.toFixed(1), hospDistKm: bestH?.distKm?.toFixed(1)||'?', eta,
      reasoning: [
        `Nearest unit: ${bestAmb.call_sign||bestAmb.vehicle_number} · ${ambDist.toFixed(1)} km`,
        bestH ? `Best hospital: ${bestH.hosp.name} · ${bestH.hosp.available_beds} beds · ${bestH.distKm.toFixed(1)} km` : 'No hospitals available',
        `Estimated arrival: ~${eta} min`,
        selectedIncident.severity==='CRITICAL' ? 'Green corridor recommended — critical case' : null,
      ].filter(Boolean),
    };

    try {
      if (!result.hospital) throw new Error('No destination hospital is available');
      await assignmentsApi.create({ incident_id: selectedIncident.id, ambulance_id: bestAmb.id, hospital_id: result.hospital.id });
    } catch (error) {
      setSnackbar({ message: error.response?.data?.error || error.message || 'Dispatch failed', severity: 'error' });
      setAutoDispatchLoading(false);
      return;
    }
    setAutoDispatchResult(result);
    setAutoDispatchLoading(false);

    setTimeout(() => {
      const ci = selectedIncident;
      const fa = ambulances.find(a=>a.id===result.ambulance?.id)||result.ambulance;
      const fh = hospitals.find(h=>h.id===result.hospital?.id)||result.hospital;
      const enriched = { ambulance:fa, hospital:fh, incident:ci, id:ci.id, incident_type:ci.incident_type, severity:ci.severity, location_address:ci.location_address, location_lat:ci.location_lat, location_lng:ci.location_lng, distance:`${result.ambDistKm} km`, eta:`${result.eta} min`, hospital_name:fh?.name, _isAssignment:true, _autoDispatched:true };
      setActiveAssignment(enriched);
      dispatchBroadcast.send(DISPATCH_EVENTS.INCIDENT_ASSIGNED, enriched);
      setAutoDispatchResult(null);
      setSelectedIncident(null);
      setSnackbar({ message:`Auto-dispatched ${bestAmb.call_sign||bestAmb.vehicle_number}`, severity:'success' });
      refetchIncidents(); refetchAmbulances();
    }, 2200);
  };

  const handleAssignmentCreated = (assignment) => {
    const ci = selectedIncident;
    refetchIncidents(); refetchAmbulances();
    if (assignment && ci) {
      const fa = ambulances.find(a=>a.id===assignment.ambulance?.id)||assignment.ambulance;
      const fh = hospitals.find(h=>h.id===assignment.hospital?.id)||assignment.hospital;
      const enriched = { ambulance:fa, hospital:fh, incident:ci, id:ci.id, incident_type:ci.incident_type, severity:ci.severity, location_address:ci.location_address, location_lat:ci.location_lat, location_lng:ci.location_lng, caller_name:ci.caller_name, caller_phone:ci.caller_phone, patients_count:ci.patients_count||1, description:ci.description, is_sos:ci.is_sos, distance: Number.isFinite(fa?.latitude) && Number.isFinite(fa?.longitude) ? `${hav(fa.latitude, fa.longitude, ci.location_lat, ci.location_lng).toFixed(1)} km` : 'Unknown', eta: fa?.eta_minutes ? `${fa.eta_minutes} min` : 'Unknown', hospital_name:fh?.name, _isAssignment:true };
      setActiveAssignment(enriched);
      dispatchBroadcast.send(DISPATCH_EVENTS.INCIDENT_ASSIGNED, enriched);
    }
    setSelectedIncident(null);
  };

  const handleSOSCreated = useCallback(async (draft) => {
    try {
      const { data: incident } = await incidentsApi.create({
        incident_type: draft.incident_type, severity: draft.severity,
        location_address: draft.location_address, location_lat: draft.location_lat,
        location_lng: draft.location_lng, caller_name: draft.caller_name,
        caller_phone: draft.caller_phone, description: draft.description,
        patients_count: draft.patients_count, is_sos: true,
      });
      dispatchBroadcast.send(DISPATCH_EVENTS.SOS_CREATED, incident);
      refetchIncidents();
      setSelectedIncident(incident);
      setSosModalOpen(false);
      setWizardOpen(true);
    } catch (error) {
      setSnackbar({ message: error.response?.data?.error || error.message || 'SOS could not be saved', severity: 'error' });
      throw error;
    }
  }, [refetchIncidents]);

  const activeCount  = incidents.filter(i=>!['RESOLVED','CANCELLED'].includes(i.status)).length;
  const pendingCount = incidents.filter(i=>i.status==='PENDING').length;
  const fleet = fleetAmbulances.length > 0 ? fleetAmbulances : ambulances;
  const nearest = nearestAvailable(fleet, selectedIncident);
  const sel = selectedIncident;
  const canDispatch = sel && ['PENDING','ACKNOWLEDGED'].includes(sel.status);
  const next = sel && NEXT_STEP[sel.status];
  const initials = (user?.name || 'Dispatcher').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();

  const tool = (fn) => () => { setToolsAnchor(null); fn(); };
  const overlaySx = (open, width = 300) => ({
    position: 'absolute', top: 0, right: 0, bottom: 0, width, maxWidth: '100%',
    background: T.sf, borderLeft: `1px solid ${T.bd}`, display: 'flex', flexDirection: 'column',
    transform: open ? 'translateX(0)' : 'translateX(100%)', zIndex: 1000,
    // Closed panels must not take focus or be scrolled into view.
    visibility: open ? 'visible' : 'hidden',
    transition: open ? 'transform 0.25s ease' : 'transform 0.25s ease, visibility 0s linear 0.25s',
  });

  return (
    <Box sx={{ display:'flex', flexDirection:'column', height:'100vh', width:'100%', background:T.bg, color:T.tx, overflow:'hidden', p:{ xs:'8px', md:'16px' }, gap:'14px' }}>

      {/* ══ HEADER ══ */}
      <Box component="header" sx={{ height:{ xs:112, sm:64 }, flexWrap:{ xs:'wrap', sm:'nowrap' }, py:{ xs:'10px', sm:0 }, borderRadius:'24px', background:T.panel, flexShrink:0, display:'flex', alignItems:'center', gap:{ xs:'8px', sm:'16px' }, px:{ xs:'16px', md:'32px' }, border:`1px solid ${T.bd}` }}>
        <Box sx={{ display:'flex', alignItems:'center', gap:'10px', flex:1, minWidth:0 }}>
          <Logo />
          <Typography sx={{ fontFamily:SERIF, fontWeight:600, fontSize:22, letterSpacing:'-0.01em' }}>MediCluster</Typography>
          <Typography sx={{ display:{ xs:'none', md:'block' }, fontFamily:MONO, fontSize:11, letterSpacing:'0.08em', color:T.tx3, pl:'12px', borderLeft:`1px solid ${T.bd2}` }}>
            DISPATCH CENTER
          </Typography>
        </Box>

        <Segmented label="View" value={view} onChange={setView}
          items={[{ key:'ops', label:'Operations' }, { key:'ai', label:'AI insights' }]} />

        <Box sx={{ display:'flex', alignItems:'center', justifyContent:'flex-end', gap:{ xs:'6px', sm:'12px' }, flex:{ xs:'none', sm:1 }, minWidth:0 }}>
          <Box sx={{ display:{ xs:'none', lg:'block' } }}><WeatherWidget compact /></Box>
          <Box sx={{ display:{ xs:'none', sm:'flex' }, alignItems:'center', gap:'6px', fontFamily:MONO, fontSize:11.5, color:T.gT, letterSpacing:'0.04em' }}>
            <Box sx={{ width:6, height:6, borderRadius:'50%', background:T.g }} />LIVE · {clock}
          </Box>
          <Button onClick={(e) => setToolsAnchor(e.currentTarget)} aria-haspopup="menu" sx={{ ...btnSx(false), height:32, px:'12px' }}>
            Tools{pendingCount > 0 ? ` · ${pendingCount}` : ''}
          </Button>
          <Box component="button" type="button" aria-label="Account" aria-haspopup="menu" onClick={(e) => setUserAnchor(e.currentTarget)}
            sx={{ width:32, height:32, borderRadius:'50%', border:0, background:T.sf2, color:T.tx, fontFamily:MONO, fontSize:12, fontWeight:500, cursor:'pointer' }}>
            {initials}
          </Box>
        </Box>
      </Box>

      <Menu anchorEl={toolsAnchor} open={!!toolsAnchor} onClose={() => setToolsAnchor(null)}
        slotProps={{ paper: { sx: { border:`1px solid ${T.bd}`, boxShadow:'0 8px 24px rgba(21,23,26,0.08)', minWidth:240 } } }}>
        <MenuItem onClick={tool(() => setVoiceModalOpen(true))}>AI voice command</MenuItem>
        <MenuItem onClick={tool(() => setSosModalOpen(true))}>SOS alert</MenuItem>
        <MenuItem onClick={tool(() => setGreenCorridorOpen(true))}>Green corridor</MenuItem>
        <Divider />
        <MenuItem onClick={tool(() => togglePanel('fleet'))}>Live fleet tracking</MenuItem>
        <MenuItem onClick={tool(() => togglePanel('hospital'))}>Hospital status</MenuItem>
        <MenuItem onClick={tool(() => togglePanel('activity'))}>
          <ListItemText>Activity feed</ListItemText>
          {pendingCount > 0 && <Box component="span" sx={tagSx('CRITICAL')}>{pendingCount}</Box>}
        </MenuItem>
        <MenuItem onClick={tool(() => setRosterOpen(true))}>Fleet &amp; driver roster</MenuItem>
        <Divider />
        <MenuItem onClick={tool(() => setShiftReportOpen(true))}>Shift report</MenuItem>
        <MenuItem onClick={tool(() => navigate('/insights'))}>Hospital matching &amp; insights</MenuItem>
        <MenuItem onClick={tool(() => navigate('/analytics'))}>Analytics &amp; SLAs</MenuItem>
        <MenuItem onClick={tool(() => navigate('/mobile'))}>Fleet telemetry</MenuItem>
        <MenuItem onClick={tool(() => window.open('/#/driver', '_blank'))}>Driver view</MenuItem>
        <MenuItem onClick={tool(() => { refetchIncidents(); refetchAmbulances(); })}>Refresh data</MenuItem>
      </Menu>

      <Menu anchorEl={userAnchor} open={!!userAnchor} onClose={() => setUserAnchor(null)}>
        <Box sx={{ px:2, py:1 }}>
          <Typography sx={{ fontSize:13.5, fontWeight:500 }}>{user?.name}</Typography>
          <Typography sx={{ fontSize:12, color:T.tx3 }}>{user?.email}</Typography>
        </Box>
        <Divider />
        <MenuItem onClick={() => { setUserAnchor(null); onLogout?.(); }}>Sign out</MenuItem>
      </Menu>

      {view === 'ai' && (
        <AIInsightsView ambulances={fleet} onApprove={(unit, area) => {
          const name = unit.call_sign || unit.vehicle_number;
          setSnackbar({ message: `Move approved: ${name} to ${area}`, severity: 'success' });
        }} />
      )}

      {view === 'ops' && <>
      {/* ══ KPI STRIP ══ */}
      <Box sx={{ flexShrink:0, px:{ xs:0, md:0 }, py:0 }}>
        <StatsCards stats={stats} incidents={incidents} ambulances={fleet} />
      </Box>

      <Box sx={{ display:{ xs:'block', lg:'none' } }}>
        <Segmented label="Workspace panel" fullWidth value={mobilePanel} onChange={setMobilePanel}
          items={[{key:'incidents',label:`Incidents · ${activeCount}`},{key:'map',label:'Live map'},{key:'units',label:'Units & radio'}]} />
      </Box>
      {/* ══ BODY ══ */}
      <Box sx={{
        flex:1, minHeight:0, overflow:'hidden',
        display:'grid', gap:'16px', p:0,
        gridTemplateRows:'minmax(0,1fr)', gridTemplateColumns:{ xs:'minmax(0,1fr)', lg:'300px minmax(0,1fr) 310px', xl:'330px minmax(0,1fr) 330px' },
      }}>

        {/* ── Incidents ── */}
        <Box component="section" aria-label="Incidents" sx={{ display:{ xs:mobilePanel === 'incidents' ? 'flex' : 'none', lg:'flex' }, flexDirection:'column', gap:'12px', minHeight:0, minWidth:0, p:'18px', background:T.panel, border:`1px solid ${T.bd}`, borderRadius:'24px' }}>
          <Box sx={sectionHead}>
            <Typography sx={{ fontSize:13.5, fontWeight:600 }}>
              Incidents <Box component="span" sx={{ color:T.tx3, fontWeight:400 }}>{activeCount}</Box>
            </Typography>
            <Button onClick={() => setSosModalOpen(true)} sx={{ ...btnSx(true), height:30, px:'10px', fontSize:13 }}>+ New incident</Button>
          </Box>
          <Segmented label="Incident filter" fullWidth value={filter} onChange={setFilter}
            items={FILTERS.map(f => ({ key:f.key, label:f.label }))} />
          <Box sx={{ flex:1, minHeight:0, overflow:'auto' }}>
            <IncidentQueue incidents={incidents} onSelect={handleIncidentSelect} selectedId={sel?.id} filter={filter} />
          </Box>
        </Box>

        {/* ── Map + selected incident ── */}
        <Box sx={{ display:{ xs:mobilePanel === 'map' ? 'flex' : 'none', lg:'flex' }, flexDirection:'column', gap:'14px', minHeight:0, minWidth:0 }}>
          <Box sx={{ flex:1, minHeight:180, position:'relative', borderRadius:'24px', overflow:'clip', border:`1px solid ${T.bd}`, background:T.sf2 }}>
            <DispatchMap
              incidents={incidents.filter(i=>!['RESOLVED','CANCELLED'].includes(i.status))}
              ambulances={fleet}
              hospitals={hospitals}
              selectedIncident={sel}
              activeAssignment={activeAssignment}
              focusAmbulance={focusAmbulance}
              onIncidentClick={handleIncidentSelect}
              onAmbulanceClick={setFocusAmbulance}
              onHospitalClick={(h)=>console.log('Hospital:',h)}
            />

            <Box sx={{ position:'absolute', bottom:12, left:12, zIndex:1000, display:'flex', gap:'14px', flexWrap:'wrap', background:T.sf, borderRadius:'999px', px:'12px', py:'8px', border:`1px solid ${T.bd}`, fontSize:12, color:T.tx2 }}>
              {[[T.g,'Standby','50%'],[T.ac,'En route','50%'],[T.r,'Incident','50%'],[T.tx,'Hospital','1px']].map(([c,l,r]) => (
                <Box key={l} sx={{ display:'flex', alignItems:'center', gap:'6px' }}>
                  <Box sx={{ width:8, height:8, borderRadius:r, background:c }} />{l}
                </Box>
              ))}
            </Box>

            <Box sx={overlaySx(panel === 'fleet', 290)}>
              <LiveTrackingPanel ambulances={ambulances} onFleetUpdate={setFleetAmbulances}
                onAmbulanceSelect={(amb) => setFocusAmbulance({...amb, _ts:Date.now()})} />
            </Box>
            <Box sx={overlaySx(panel === 'hospital', 290)}><HospitalStatusPanel /></Box>
            <Box sx={overlaySx(panel === 'activity', 310)}><ActivityFeed /></Box>
            <Box sx={overlaySx(panel === 'timeline' && !!sel, 310)}>
              <IncidentTimeline incident={sel} onClose={closeAll} />
            </Box>
          </Box>

          {/* Selected incident */}
          <Box component="section" aria-label="Selected incident" sx={{ flexShrink:0, p:'16px 18px', maxHeight:'45%', overflow:'auto', borderRadius:'24px', background:T.panel, border:`1px solid ${T.bd}` }}>
            {!sel ? (
              <Typography sx={{ fontSize:13.5, color:T.tx3 }}>Select an incident to see details and dispatch a unit.</Typography>
            ) : (
              <Box sx={{ display:'flex', flexDirection:'column', gap:'10px' }}>
                <Box sx={{ display:'flex', alignItems:'center', gap:'10px' }}>
                  <Typography sx={{ fontFamily:MONO, fontSize:12, color:T.tx3 }}>{sel.id}</Typography>
                  <Box component="span" sx={tagSx(sel.severity)}>{sel.severity}</Box>
                  <Box sx={{ flex:1 }} />
                  <IconButton size="small" aria-label="Close incident" onClick={() => setSelectedIncident(null)} sx={{ color:T.tx3 }}>
                    <Close sx={{ fontSize:18 }} />
                  </IconButton>
                </Box>
                <Typography component="h2" sx={{ fontFamily:SERIF, fontSize:26, lineHeight:1.15, letterSpacing:'-0.01em' }}>
                  {sel.incident_type}{sel.location_address ? ` · ${sel.location_address}` : ''}
                </Typography>
                {(sel.description || sel.caller_name || nearest) && (
                  <Typography sx={{ fontSize:13.5, color:T.tx2, lineHeight:1.5 }}>
                    {[sel.description, sel.caller_name && `Caller: ${sel.caller_name}${sel.caller_phone ? ` (${sel.caller_phone})` : ''}`,
                      canDispatch && nearest && `Nearest unit: ${nearest.call_sign} (${hav(nearest.latitude, nearest.longitude, sel.location_lat, sel.location_lng).toFixed(1)} km)`]
                      .filter(Boolean).join(' · ')}
                  </Typography>
                )}

                {autoDispatchResult && (
                  <Box role="status" sx={{ p:'10px 12px', background:T.sf2, display:'flex', flexDirection:'column', gap:'4px' }}>
                    {autoDispatchResult.reasoning.map((line,i) => (
                      <Box key={i} sx={{ display:'flex', gap:'6px', alignItems:'flex-start', fontSize:12.5, color:T.tx2 }}>
                        <CheckCircle sx={{ fontSize:13, color:T.g, mt:'2px' }} />{line}
                      </Box>
                    ))}
                    <Typography sx={{ fontFamily:MONO, fontSize:11, color:T.tx3 }}>DISPATCHING…</Typography>
                  </Box>
                )}

                <Box sx={{ display:'flex', gap:'8px', flexWrap:'wrap', mt:'4px' }}>
                  {canDispatch && (
                    <Button onClick={handleAutoDispatch} disabled={autoDispatchLoading || !nearest} sx={btnSx(true)}>
                      {autoDispatchLoading ? 'Analysing…' : nearest ? `Assign ${nearest.call_sign}` : 'No units available'}
                    </Button>
                  )}
                  {canDispatch && <Button onClick={() => setWizardOpen(true)} sx={btnSx(false)}>Assign manually</Button>}
                  {sel.status === 'PENDING' && <Button onClick={handleAcknowledge} sx={btnSx(false)}>Acknowledge</Button>}
                  {next && (
                    <Button sx={btnSx(true)} onClick={() => {
                      setSelectedIncident(prev => ({ ...prev, status: next.to }));
                      setSnackbar({ message: next.note[0], severity: next.note[1] });
                    }}>
                      {next.label}
                    </Button>
                  )}
                  {next && (
                    <Button onClick={() => setGreenCorridorOpen(true)} sx={{ ...btnSx(false), borderColor:T.r, color:T.rT }}>Green corridor</Button>
                  )}
                  <Button onClick={() => togglePanel('timeline')} sx={btnSx(false)}>
                    {panel === 'timeline' ? 'Hide timeline' : 'Timeline'}
                  </Button>
                </Box>
              </Box>
            )}
          </Box>
        </Box>

        {/* ── Units + radio ── */}
        <Box sx={{ display:{ xs:mobilePanel === 'units' ? 'flex' : 'none', lg:'flex' }, flexDirection:'column', gap:'16px', minHeight:0, minWidth:0, overflow:'auto' }}>
          <UnitsPanel ambulances={fleet} onSelect={(amb) => setFocusAmbulance({ ...amb, _ts: Date.now() })} />
          <QuickCommsPanel ambulances={fleet} />
        </Box>
      </Box>

      </>}

      {/* ══ Modals ══ */}
      <SOSAlertModal open={sosModalOpen} onClose={()=>setSosModalOpen(false)} onSOSCreated={handleSOSCreated} />
      <AssignmentWizard open={wizardOpen} onClose={()=>setWizardOpen(false)} incident={sel} onAssignmentCreated={handleAssignmentCreated} />
      <ShiftReportModal open={shiftReportOpen} onClose={()=>setShiftReportOpen(false)} stats={stats} incidents={incidents} ambulances={ambulances} />
      <GreenCorridorModal open={greenCorridorOpen} onClose={()=>setGreenCorridorOpen(false)} assignment={activeAssignment} />
      <FleetRosterModal open={rosterOpen} onClose={() => setRosterOpen(false)} onRosterUpdated={refetchAmbulances} />
      <VoiceAssistantModal
        open={voiceModalOpen}
        onClose={() => setVoiceModalOpen(false)}
        onAutoDispatch={handleAutoDispatch}
        onAcknowledge={handleAcknowledge}
        onActivateGreenCorridor={() => { setGreenCorridorOpen(true); setSnackbar({ message: 'Green Corridor activated via voice command', severity: 'info' }); }}
        onFilterChange={(f) => setFilter(f === 'pending' ? 'pending' : 'all')}
        incidents={incidents}
        ambulances={ambulances}
      />

      <Snackbar open={!!snackbar} autoHideDuration={5000} onClose={()=>setSnackbar(null)} anchorOrigin={{vertical:'bottom',horizontal:'right'}}>
        <Alert severity={snackbar?.severity||'info'} onClose={()=>setSnackbar(null)}
          sx={{ background:T.sf, color:T.tx, border:`1px solid ${T.bd2}`, borderRadius:'3px' }}>
          {snackbar?.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
