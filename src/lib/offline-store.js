// setItem is atomic and synchronous: a successful local receipt always follows
// the durable write, including when the tab is closed immediately afterwards.
const key = 'ls_sync_queue', prefix='ls_sync_job:', marker='ls_sync_journal_v2', listeners = new Set();
let serial=0;
export const visitorOwner = 'visitor';
export function readJobs() {
  try {
    const legacy=localStorage.getItem(marker)?[]:JSON.parse(localStorage.getItem(key)||'[]');
    const jobs=new Map((Array.isArray(legacy)?legacy:[]).map(job=>[job.id||JSON.stringify(job),job]));
    for(let index=0;index<localStorage.length;index++){const name=localStorage.key(index);if(name?.startsWith(prefix)){const job=JSON.parse(localStorage.getItem(name));if(job?.id)jobs.set(job.id,job);}}
    return [...jobs.values()].sort((a,b)=>(a.order||Date.parse(a.createdAt)||0)-(b.order||Date.parse(b.createdAt)||0));
  } catch { return []; }
}
function changed() {
  listeners.forEach(listener => listener());
  globalThis.window?.dispatchEvent(new Event('louvesync:outbox'));
}
export function updateJobs(update) {
  const previous=readJobs(),jobs = update(previous);
  try {
    for(const job of jobs)localStorage.setItem(prefix+job.id,JSON.stringify(job));
    localStorage.setItem(marker,'1');localStorage.setItem(key,'[]');
    // Remove only records present in our original snapshot. Concurrent appends
    // in another tab have independent keys and cannot be overwritten here.
    const nextIds=new Set(jobs.map(job=>job.id));
    for(const job of previous)if(!nextIds.has(job.id))localStorage.removeItem(prefix+job.id);
  }
  catch { throw new Error('Não há espaço no aparelho para salvar esta alteração. Seu formulário foi mantido; libere espaço e tente novamente.'); }
  changed(); return jobs;
}
export function enqueue(type, data, actorId, metadata={}) {
  if (!actorId) throw new Error('Entre na sua conta para guardar esta alteração.');
  const job = { ...metadata, id: crypto.randomUUID(), type, data: structuredClone(data), actorId, createdAt: new Date().toISOString(),order:Date.now()*1000+(serial++%1000) };
  updateJobs(jobs => [...jobs, job]); return job;
}
export function subscribeJobs(listener) {
  listeners.add(listener);
  const storage = event => { if (event.key === key||event.key?.startsWith(prefix)) listener(); };
  globalThis.window?.addEventListener('storage', storage);
  return () => { listeners.delete(listener); globalThis.window?.removeEventListener('storage', storage); };
}
export function jobsFor(owner) { return readJobs().filter(job => job.actorId === owner); }
export function acknowledge(id) { updateJobs(jobs => jobs.filter(job => job.id !== id)); }
export function cacheRead(key, fallback = null) { try { return JSON.parse(localStorage.getItem('ls_offline:' + key) || 'null') ?? fallback; } catch { return fallback; } }
export function cacheWrite(key, value) { try { localStorage.setItem('ls_offline:' + key, JSON.stringify(value)); return true; } catch { return false; } }
export function cacheRemove(key) { localStorage.removeItem('ls_offline:' + key); }
export function migrateJobs(owner) {
  // Old unowned jobs are kept for recovery. Never attribute an admin write to
  // whichever person happens to sign in next on a shared device.
  if (!owner) return;
  updateJobs(jobs => jobs.map((job,index) => {
    const author = job.data?.memberId || job.data?.member_id || job.data?.created_by || job.data?.updated_by;
    return { ...job, id: job.id || crypto.randomUUID(),order:job.order||((Date.parse(job.createdAt)||Date.now())*1000+index), ...(job.actorId || author !== owner ? {} : { actorId: owner }) };
  }));
}
