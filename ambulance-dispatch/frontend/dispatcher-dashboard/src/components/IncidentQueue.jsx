import React from 'react';
import { Box, Typography } from '@mui/material';
import { T, MONO, tagSx } from '../theme/dispatchTokens';
import { FILTERS } from './incidentFilters';

const STATUS = {
  PENDING:      { label: 'Pending',      color: T.yT },
  ACKNOWLEDGED: { label: 'Acknowledged', color: T.yT },
  DISPATCHED:   { label: 'Dispatched',   color: T.ac },
  EN_ROUTE:     { label: 'En route',     color: T.ac },
  ON_SCENE:     { label: 'On scene',     color: T.ac },
  TRANSPORTING: { label: 'In transit',   color: T.oT },
  AT_HOSPITAL:  { label: 'Hospital',     color: T.gT },
  RESOLVED:     { label: 'Resolved',     color: T.tx3 },
  CANCELLED:    { label: 'Cancelled',    color: T.tx3 },
};

function timeAgo(date) {
  const s = Math.floor((Date.now() - new Date(date)) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

export default function IncidentQueue({ incidents, onSelect, selectedId, filter = 'all' }) {
  const test = (FILTERS.find(f => f.key === filter) || FILTERS[0]).test;
  const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  const sorted = incidents.filter(test).sort((a, b) => {
    const d = (order[a.severity] ?? 9) - (order[b.severity] ?? 9);
    return d || new Date(b.created_at) - new Date(a.created_at);
  });

  if (sorted.length === 0) {
    return <Typography sx={{ py: 3, color: T.tx3, fontSize: 13 }}>Nothing in this view.</Typography>;
  }

  return (
    <Box role="listbox" aria-label="Incidents" sx={{ display:"flex", flexDirection:"column", gap:"10px" }}>
      {sorted.map(inc => {
        const st = STATUS[inc.status] || STATUS.PENDING;
        const selected = inc.id === selectedId;
        return (
          <Box
            key={inc.id}
            role="option"
            aria-selected={selected}
            tabIndex={0}
            onClick={() => onSelect(inc)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSelect(inc))}
            sx={{
              display: 'flex', flexDirection: 'column', gap: '6px',
              p: '12px 10px 12px 12px', cursor: 'pointer',
              border: `1px solid ${selected ? T.ac : T.bd}`, borderRadius:'16px',
              boxShadow: selected ? `inset 3px 0 0 ${T.ac}` : 'none',
              background: selected ? T.sf2 : T.sf,
              '&:hover': { background: T.sf2 },
              '&:focus-visible': { outline: `2px solid ${T.ac}`, outlineOffset: -2 },
            }}
          >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px' }}>
              <Typography sx={{ fontSize: 14, fontWeight: 600, color: T.tx }} noWrap>{inc.incident_type}</Typography>
              <Typography sx={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.04em', textTransform: 'uppercase', color: st.color, flexShrink: 0 }}>
                {st.label}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <Box component="span" sx={tagSx(inc.severity)}>{inc.severity || 'HIGH'}</Box>
              <Typography sx={{ fontSize: 12.5, color: T.tx3 }}>
                {inc.id} · {inc.created_at ? timeAgo(inc.created_at) : 'just now'}
              </Typography>
            </Box>
            <Typography sx={{ fontSize: 12.5, color: T.tx2 }} noWrap>
              {inc.location_address || `${inc.location_lat?.toFixed(4)}, ${inc.location_lng?.toFixed(4)}`}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
}
