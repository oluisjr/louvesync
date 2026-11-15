let currentActor = null;

export function readActorSession() {
  try {
    const actor = JSON.parse(localStorage.getItem('ls_actor_session') || 'null');
    return typeof actor?.memberId === 'string' && typeof actor.pin === 'string' && actor.pin ? { memberId: actor.memberId, pin: actor.pin } : null;
  } catch { return null; }
}

export function setMutationActor(actor) {
  currentActor = actor?.memberId && typeof actor.pin === 'string' && actor.pin ? { memberId: String(actor.memberId), pin: actor.pin } : null;
}
export function mutationActor() { return currentActor ? { ...currentActor } : null; }
export function actorHeaders(actor) {
  return actor?.memberId && actor.pin ? { 'x-louvesync-member': String(actor.memberId), 'x-louvesync-pin': String(actor.pin) } : {};
}
export function authenticatedFetch(projectUrl, fetcher = fetch) {
  const origin = new URL(projectUrl).origin;
  return (input, init = {}) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
    // Keep credentials off third-party requests and public storage downloads.
    if (new URL(url).origin === origin && new URL(url).pathname.startsWith('/rest/v1/')) {
      for (const [name, value] of Object.entries(actorHeaders(currentActor))) headers.set(name, value);
    }
    return fetcher(input, { ...init, headers });
  };
}
export function publicMember(member) {
  const { pin: _pin, ...safe } = member || {};
  return safe;
}
export const memberColumns = 'id,name,role,instrument,avatar,color,status,is_admin,vocal_category,access_type';
