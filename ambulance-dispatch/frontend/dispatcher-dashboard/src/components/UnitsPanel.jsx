import React from 'react';
import { Box, Typography } from '@mui/material';
import { T, MONO } from '../theme/dispatchTokens';

const STANDBY = ['AVAILABLE'];
const OFFLINE = ['OFFLINE', 'MAINTENANCE', 'OUT_OF_SERVICE'];

function unitState(a) {
  if (STANDBY.includes(a.status)) return { dot: T.g, text: 'Standby at base' };
  if (OFFLINE.includes(a.status))  return { dot: T.bd2, text: 'Offline' };
  const label = String(a.status || 'Active').toLowerCase().replace(/_/g, ' ');
  const job = a.assigned_incident_id ? ` · ${a.assigned_incident_id}` : '';
  return { dot: T.ac, text: `${label.charAt(0).toUpperCase()}${label.slice(1)}${job}` };
}

export default function UnitsPanel({ ambulances = [], onSelect }) {
  const standby = ambulances.filter(a => STANDBY.includes(a.status)).length;
  const active = ambulances.filter(a => !STANDBY.includes(a.status) && !OFFLINE.includes(a.status)).length;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flexShrink:0, p:'18px', borderRadius:'24px', background:T.panel, border:`1px solid ${T.bd}` }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', pb: '8px', borderBottom: `1px solid ${T.bd}` }}>
        <Typography sx={{ fontSize: 13.5, fontWeight: 600 }}>Units</Typography>
        <Typography sx={{ fontFamily: MONO, fontSize: 11, color: T.tx3, letterSpacing: '0.04em' }}>
          {standby} STANDBY · {active} ACTIVE
        </Typography>
      </Box>
      {ambulances.length === 0 && <Typography sx={{ py: 2, fontSize: 13, color: T.tx3 }}>No units on shift.</Typography>}
      {ambulances.map(a => {
        const st = unitState(a);
        const eta = a.eta ?? a.eta_minutes;
        return (
          <Box key={a.id} component="button" type="button" onClick={() => onSelect?.(a)}
            sx={{
              display: 'grid', gridTemplateColumns: '8px minmax(0,1fr) auto', gap: '12px', alignItems: 'center',
              width: '100%', p: '11px 6px', border: 0, borderBottom: `1px solid ${T.bd}`, background: 'transparent',
              color: T.tx, font: 'inherit', textAlign: 'left', cursor: 'pointer',
              '&:hover': { background: T.sf }, '&:focus-visible': { outline: `2px solid ${T.ac}`, outlineOffset: -2 },
            }}>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', background: st.dot }} />
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontSize: 13.5, fontWeight: 500 }} noWrap>
                {a.call_sign || a.vehicle_number}{' '}
                <Box component="span" sx={{ fontFamily: MONO, fontSize: 11, color: T.tx3, fontWeight: 400 }}>{a.type}</Box>
              </Typography>
              <Typography sx={{ fontSize: 12.5, color: T.tx2 }} noWrap>{st.text}</Typography>
            </Box>
            <Typography sx={{ fontFamily: MONO, fontSize: 12.5, color: T.tx }}>{eta ? `${eta} min` : '—'}</Typography>
          </Box>
        );
      })}
    </Box>
  );
}
