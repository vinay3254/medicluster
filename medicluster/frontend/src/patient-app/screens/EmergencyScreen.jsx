import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { usePatient, TabBar } from '../PatientApp';
import { Body, ErrorNote } from '../ui';
import { PatientHeading, PatientViews, PatientList } from '../PatientComponents';
import { getEmergencies, getEmergency, requestEmergency, correctEmergencyLocation } from '../featuresApi';
import { fetchNearbyHospitals } from '../../api/nearbyHospitals';
import SosButton from '../SosButton';
import EmergencyLocationPicker from '../EmergencyLocationPicker';

const LABELS = { PENDING:'Waiting for dispatch',ASSIGNED:'Ambulance assigned',EN_ROUTE_TO_SCENE:'Ambulance is on the way',ON_SCENE:'Crew has arrived',TRANSPORTING_TO_HOSPITAL:'On the way to hospital',ARRIVED_AT_HOSPITAL:'Arrived at hospital',RESOLVED:'Response completed',CANCELLED:'Request cancelled' };
const position = () => new Promise(resolve => navigator.geolocation ? navigator.geolocation.getCurrentPosition(p => resolve({ latitude:p.coords.latitude,longitude:p.coords.longitude }),()=>resolve(null),{enableHighAccuracy:true,maximumAge:0,timeout:15000}) : resolve(null));
const coordinate = point => Number.isFinite(point?.latitude) && Number.isFinite(point?.longitude) ? [point.latitude,point.longitude] : null;
function AmbulanceMap({ emergency }) {
  const host=useRef(null),map=useRef(null);
  useEffect(()=>{map.current=L.map(host.current,{zoomControl:false}).setView(coordinate(emergency.ambulance)||coordinate(emergency.location)||[20.59,78.96],13);L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',maxZoom:19}).addTo(map.current);L.control.zoom({position:'bottomright'}).addTo(map.current);const observer=new ResizeObserver(()=>map.current?.invalidateSize());observer.observe(host.current);return()=>{observer.disconnect();map.current?.remove();map.current=null;};},[]);
  useEffect(()=>{const group=L.layerGroup().addTo(map.current), points=[];for(const [point,label,kind]of [[emergency.location,'SOS location when requested','origin'],[emergency.ambulance,emergency.ambulance?.callSign||'Ambulance','ambulance'],[emergency.hospital,emergency.hospital?.name||'Hospital','hospital']]){const coords=coordinate(point);if(!coords)continue;points.push(coords);const title=document.createElement('span');title.textContent=label;L.marker(coords,{icon:L.divIcon({className:`pt-tracking-pin ${kind}`,html:'<span>+</span>',iconSize:[26,26],iconAnchor:[13,13]}),title:label}).bindTooltip(title).addTo(group);}if(points.length)map.current.fitBounds(L.latLngBounds(points),{padding:[25,25],maxZoom:16});return()=>group.remove();},[emergency]);
  return <div ref={host} className="pt-map" aria-label="Ambulance and incident location map"/>;
}
export default function EmergencyScreen() {
  const {patientId,profile,offlineStatus,loadSection,cacheSection,apiError}=usePatient();
  const [view,setView]=useState('help'),[items,setItems]=useState([]),[selected,setSelected]=useState(''),[tracked,setTracked]=useState(null),[hospitals,setHospitals]=useState([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const request=useRef(null);
  const [manualLocation,setManualLocation]=useState(null);
  const chosen=tracked?.id===selected?tracked:items.find(row=>row.id===selected);
  const activeRequest=chosen&&!['RESOLVED','CANCELLED'].includes(chosen.status)?chosen:items.find(row=>!['RESOLVED','CANCELLED'].includes(row.status));
  const canCorrectLocation=!activeRequest||(activeRequest.status==='PENDING'&&!activeRequest.ambulance);
  const saveLocation=async location=>{
    setBusy(true);setError('');
    try{
      if(offlineStatus.offline)throw new Error('Connect before saving a pickup location.');
      let target=activeRequest;
      if(request.current){
        target=await requestEmergency(patientId,request.current.body,request.current.key);
        setItems(prev=>[target,...prev.filter(row=>row.id!==target.id)]);setTracked(target);setSelected(target.id);
        request.current=null;
      }
      if(target){
        const item=await correctEmergencyLocation(patientId,target.id,location);
        setItems(prev=>prev.map(row=>row.id===item.id?item:row));setTracked(item);setSelected(item.id);setView('tracking');
        setMessage('Pickup location updated for dispatch.');
      }else{
        setManualLocation(location);setView('help');setMessage('Pickup pin selected. Hold SOS to send your request.');
      }
    }catch(err){setError(apiError(err));}finally{setBusy(false);}
  };
  const refresh=useCallback(async()=>{try{const rows=await loadSection('emergencies',()=>getEmergencies(patientId));setItems(rows);setSelected(prev=>prev||rows[0]?.id||'');}catch(err){setError(apiError(err));}},[patientId,loadSection,apiError]);
  useEffect(()=>{refresh();},[refresh]);
  useEffect(()=>{if(view!=='tracking'||!selected)return;let current=true;const update=async()=>{try{const item=offlineStatus.offline?items.find(row=>row.id===selected):await getEmergency(patientId,selected);if(current&&item){setTracked(item);setError('');const rows=items.map(row=>row.id===item.id?item:row);cacheSection('emergencies',rows);}}catch(err){if(current)setError(apiError(err));}};update();const timer=setInterval(update,5000);return()=>{current=false;clearInterval(timer);};},[view,selected,patientId,offlineStatus.offline,items,cacheSection,apiError]);
  useEffect(()=>{if(view!=='nearby'||hospitals.length||offlineStatus.offline)return;let current=true;position().then(async pos=>{if(!pos){if(current)setError('Allow location to find nearby hospitals.');return;}try{const rows=await fetchNearbyHospitals({lat:pos.latitude,lng:pos.longitude},5);if(current)setHospitals(rows);}catch{if(current)setError('Could not load hospitals. Call 108 if you need urgent help.');}});return()=>{current=false;};},[view,hospitals.length,offlineStatus.offline]);
  const send=async()=>{setBusy(true);setError('');try{const active=items.find(row=>!['RESOLVED','CANCELLED'].includes(row.status));if(active){setSelected(active.id);setView('tracking');return;}if(offlineStatus.offline)throw new Error('You are offline. Call 108 directly for emergency assistance.');if(!request.current){const pos=manualLocation||await position();if(!pos)throw new Error('Location is required to send a dispatch request. You can still call 108.');request.current={key:crypto.randomUUID(),body:{...pos,description:`Patient ${profile?.name||patientId} requests emergency assistance.`}};}const item=await requestEmergency(patientId,request.current.body,request.current.key);setItems(prev=>[item,...prev.filter(row=>row.id!==item.id)]);setSelected(item.id);setTracked(item);request.current=null;setView('tracking');setMessage('Request sent. Dispatch will confirm an ambulance.');}catch(err){setError(apiError(err));}finally{setBusy(false);}};
  const sos=()=>{send();};
  const contact=profile?.emergencyContact;
  const stale=!tracked?.ambulance?.lastPing||Date.now()-new Date(tracked.ambulance.lastPing).getTime()>120000;
  return <><Body className="pt-view"><PatientHeading title="Emergency help" sub="Request an ambulance and track your response here."/><PatientViews label="Emergency views" options={[{id:'help',label:'Help'},{id:'tracking',label:'Tracking'},{id:'nearby',label:'Nearby'},...(canCorrectLocation?[{id:'location',label:'Location'}]:[])]} value={view} onChange={value=>{setView(value);setError('');}}/><ErrorNote>{error}</ErrorNote>
    {view==='location'?<EmergencyLocationPicker initialLocation={manualLocation||activeRequest?.location} busy={busy} onConfirm={saveLocation} onCancel={()=>setView(activeRequest?'tracking':'help')}/>:view==='help'? <section className="pt-card pt-grow pt-stack"><div className="pt-sos"><SosButton onTrigger={sos} disabled={busy}/><p>{busy?'Sending your location…':manualLocation?'SOS will use your confirmed map pin.':'Hold to request an ambulance and share your location.'}</p></div><a className="pt-button" href="tel:108">Call 108 now</a><div className="pt-contact"><div><strong>Emergency contact</strong><p>{contact?.name||'Add someone you trust'}</p></div>{contact?.phone?<a className="pt-button-secondary" href={`tel:${contact.phone.replace(/[^+\d]/g,'')}`}>Call</a>:<Link to="/app/profile" className="pt-button-secondary">Add contact</Link>}</div></section>
    :view==='tracking'? <section className="pt-card pt-grow pt-stack">{items.length>1&&<label className="pt-field">Request<select value={selected} onChange={e=>{setTracked(null);setSelected(e.target.value);}}>{items.map(item=><option key={item.id} value={item.id}>{new Date(item.createdAt).toLocaleString()}</option>)}</select></label>}{tracked?<><span className="pt-pill">{LABELS[tracked.status]||tracked.status}</span><div className="pt-row"><strong>{tracked.ambulance?.callSign||'No ambulance assigned yet'}</strong><span className="pt-muted">{offlineStatus.offline?'Saved status':tracked.ambulance?(stale?'GPS update pending':'GPS updating'):'Awaiting dispatch'}</span></div><AmbulanceMap emergency={tracked}/><p className="pt-muted">{tracked.ambulance?.lastPing?`Last location: ${new Date(tracked.ambulance.lastPing).toLocaleTimeString()}`:'Your request is visible to dispatch. Vehicle details appear after assignment.'}{tracked.hospital?.name?` · ${tracked.hospital.name}`:''}</p>{stale&&tracked.ambulance&&<p className="pt-muted">Location may be out of date. Call dispatch for an update.</p>}<div className="pt-actions">{tracked.status==='PENDING'&&!tracked.ambulance&&<button type="button" className="pt-button-secondary" onClick={()=>{setError('');setView('location');}}>Correct location</button>}<a className="pt-button-secondary" href="tel:108">Call dispatch</a></div></>:<div className="pt-empty"><strong>{selected?'Loading response…':'No ambulance requests'}</strong><p>{message||'Use Help to contact emergency services.'}</p></div>}</section>
    :<section className="pt-card pt-grow"><PatientList items={hospitals} label="Nearby hospital pages" empty={offlineStatus.offline?'Connect to find hospitals, or call 108.':'Nearby hospitals appear after location access.'} renderItem={h=><div className="pt-list-row" key={h.place_id}><div><strong>{h.name}</strong><p>{h.distKm.toFixed(1)} km away</p></div><a className="pt-text-button" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/dir/?api=1&destination=${h.lat},${h.lng}`}>Directions ↗</a></div>}/></section>}
  </Body><TabBar/></>;
}
