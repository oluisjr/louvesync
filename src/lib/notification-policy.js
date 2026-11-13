// Shared policy reference. Recipient and privilege decisions are repeated inside
// the database against persisted member records; browser flags are not authority.
const normalized = value => String(value || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase();
const identifier = value => typeof value === 'string' || typeof value === 'number' ? String(value) : '';
const activeMember = member => !member.status || ['ativo', 'ativa', 'active'].includes(normalized(member.status));

export function isNotificationLeader(member) {
  if (!member) return false;
  const role = normalized(member.role);
  return member.is_admin === true || (/\blider\b/.test(role) && /\blouvor\b/.test(role));
}

export function notificationRecipients(kind, {
  members = [], eventMemberIds = [], previousMemberIds = [], actorId = null,
  decliningMemberId = null, audience = 'assigned',
} = {}) {
  const current = new Set(eventMemberIds.map(identifier).filter(Boolean));
  const affected = new Set([...current, ...previousMemberIds.map(identifier).filter(Boolean)]);
  const actor = identifier(actorId), declining = identifier(decliningMemberId);
  if (kind === 'attendance_declined' && (!declining || !current.has(declining))) return [];
  if (!['event_changed', 'song_added', 'attendance_declined'].includes(kind)) return [];
  return [...new Set(members.filter(member => {
    const id = identifier(member.id);
    if (!id || !activeMember(member)) return false;
    if (kind === 'attendance_declined') return isNotificationLeader(member) && id !== declining;
    if (isNotificationLeader(member) || id === actor) return false;
    return kind === 'song_added' || audience === 'all' || affected.has(id);
  }).map(member => identifier(member.id)))];
}

// A subscription is not a generic URL to fetch. Only HTTPS endpoints belonging
// to the browser push services are accepted, both here and before delivery.
export function validPushEndpoint(value) {
  if (typeof value !== 'string' || !value || value.length > 2048 || [...value].some(character => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127)) return false;
  try {
    const url = new URL(value), host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.port || url.username || url.password || url.hash || url.pathname === '/') return false;
    return ['fcm.googleapis.com', 'fcm-notification.googleapis.com', 'web.push.apple.com'].includes(host) ||
      host.endsWith('.push.services.mozilla.com') || host.endsWith('.notify.windows.com');
  } catch { return false; }
}

function decodeKey(value, length) {
  if (typeof value !== 'string' || value.length > 120 || !/^[A-Za-z0-9_-]+={0,2}$/.test(value)) return null;
  const raw = value.replace(/=+$/, '');
  // Length 1 mod 4 can never encode a complete base64 group.
  if (raw.length % 4 === 1) return null;
  try {
    const binary = atob(raw.replaceAll('-', '+').replaceAll('_', '/'));
    if (binary.length !== length) return null;
    return Uint8Array.from(binary, character => character.charCodeAt(0));
  } catch { return null; }
}

export function validatePushSubscription(value) {
  if (!value || typeof value !== 'object' || !validPushEndpoint(value.endpoint)) return null;
  const p256dh = decodeKey(value.keys?.p256dh, 65), auth = decodeKey(value.keys?.auth, 16);
  if (!p256dh || p256dh[0] !== 4 || !auth) return null;
  return { endpoint: value.endpoint, keys: { p256dh: value.keys.p256dh.replace(/=+$/, ''), auth: value.keys.auth.replace(/=+$/, '') } };
}
