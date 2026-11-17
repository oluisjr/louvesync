import { apiScope } from './offline-actions.js';
import { cacheRead, cacheWrite, jobsFor } from './offline-store.js';

// Saving and reading use the same local record, irrespective of connectivity.
export function rememberAttendance(owner, result) {
  if (!owner || !result?.sheet?.eventId) return result;
  const scope = apiScope('attendance', owner, { action: 'get', eventId: result.sheet.eventId });
  const previous = cacheRead(scope);
  if (!result.pendingOffline && previous?.sheet && (previous.sheet.version > result.sheet.version ||
      (previous.sheet.version === result.sheet.version && previous.pendingOffline && jobsFor(owner).some(job => job.type === 'attendance' && job.data.eventId === result.sheet.eventId)))) {
    result = { ...result, sheet: previous.sheet, ...(previous.pendingOffline ? { pendingOffline: true } : {}) };
  }
  const prefix = `ls_offline:attendance:${owner}:`;
  const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index));
  cacheWrite(scope, result);
  for (const key of keys) {
    if (!key?.startsWith(prefix)) continue;
    let scope;
    try { scope = JSON.parse(key.slice(prefix.length)); } catch { continue; }
    if (scope.action !== 'list' || result.sheet.date < scope.from || result.sheet.date > scope.to) continue;
    const cached = cacheRead(key.slice('ls_offline:'.length));
    if (!Array.isArray(cached?.sheets)) continue;
    const sheets = [...cached.sheets.filter(sheet => sheet.eventId !== result.sheet.eventId), result.sheet];
    cacheWrite(key.slice('ls_offline:'.length), { ...cached, sheets, today: result.today, serverTime: result.serverTime });
  }
  return result;
}
