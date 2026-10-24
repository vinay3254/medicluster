import React from 'react';
import { Box, Typography } from '@mui/material';
import { T, SERIF, monoLabelSx } from '../theme/dispatchTokens';

const RESPONSE_TARGET_MIN = 10;

function Stat({ label, value, sub, subColor = T.tx3 }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: 0, p:{ xs:'12px 14px', sm:'16px 20px' }, background:T.sf, border:`1px solid ${T.bd}`, borderRadius:'24px' }}>
      <Typography sx={monoLabelSx}>{label}</Typography>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: '6px', flexWrap:'wrap' }}>
        <Typography sx={{ fontFamily: SERIF, fontWeight:500, fontSize: { xs:22, sm:34 }, lineHeight: 1, letterSpacing: '-0.02em', color: T.tx }}>
          {value}
        </Typography>
        {sub && <Typography sx={{ fontSize: 12, color: subColor }}>{sub}</Typography>}
      </Box>
    </Box>
  );
}

export default function StatsCards({ stats, incidents, ambulances }) {
  const open           = incidents?.filter(i => !['RESOLVED', 'CANCELLED'].includes(i.status)) ?? [];
  const criticalCount  = open.filter(i => i.severity === 'CRITICAL').length;
  const availableCount = ambulances?.filter(a => a.status === 'AVAILABLE').length ?? 0;
  const totalAmbs      = ambulances?.length ?? 0;
  const avgResp        = stats?.avgResponseTime;
  const resolved       = stats?.todayResolved;
  const improvement    = stats?.improvement;

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '14px', width: '100%' }}>
      <Stat label="Active incidents" value={open.length}
        sub={criticalCount > 0 ? `${criticalCount} critical` : undefined} subColor={T.rT} />
      <Stat label="Units available" value={availableCount} sub={`of ${totalAmbs}`} />
      <Stat label="Avg response" value={avgResp == null ? 'Unavailable' : `${avgResp}m`} sub={`target ${RESPONSE_TARGET_MIN}m`}
        subColor={Number(avgResp) <= RESPONSE_TARGET_MIN ? T.gT : T.rT} />
      <Stat label="Resolved today" value={resolved ?? 'Unavailable'}
        sub={improvement == null ? undefined : `${improvement >= 0 ? '+' : ''}${improvement}% vs avg`} subColor={improvement >= 0 ? T.gT : T.rT} />
    </Box>
  );
}
