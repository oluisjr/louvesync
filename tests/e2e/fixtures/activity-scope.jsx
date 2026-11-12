import { createElement, useLayoutEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useActivityQuery } from '../../../src/hooks/useActivity.js';

const credentials = { memberId: 'admin-fixture', pin: 'FIXTURE_PIN' };

function ActivityScopeProbe() {
  const [targetId, setTargetId] = useState('event-1');
  const query = useActivityQuery(credentials, 'viewers', 'event', targetId);
  // Capture committed renders, including the one before passive effects run.
  // This detects displaying event A's data under event B's heading even briefly.
  useLayoutEffect(() => {
    window.activityScopeRenders.push({ targetId, count: query.data?.viewers[0]?.viewCount ?? null });
  });
  return createElement('main', null,
    createElement('button', { onClick: () => setTargetId('event-2') }, 'Abrir outro evento'),
    createElement('h1', null, targetId),
    createElement('p', { role: 'status' }, query.loading ? 'Consultando' : query.error || String(query.data?.viewers[0]?.viewCount)),
  );
}

window.activityScopeRenders = [];
createRoot(document.getElementById('root')).render(createElement(ActivityScopeProbe));
