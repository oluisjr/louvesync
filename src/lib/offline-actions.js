import { connectionAvailable, connectionFailed, networkFailure } from './connectivity.js';
import { cacheRead, cacheWrite, enqueue, visitorOwner, jobsFor } from './offline-store.js';
import { mutationActor } from './member-session.js';

export async function offlineAction(type, data, execute, optimistic, owner = mutationActor()?.memberId, metadata={}) {
  if (!globalThis.window) return execute();
  if (connectionAvailable() && !jobsFor(owner).length) {
    try { return await execute(); }
    catch (error) { if (!networkFailure(error)) throw error; if(!error.status)connectionFailed(); }
  }
  enqueue(type, data, owner,metadata);
  return typeof optimistic === 'function' ? optimistic() : optimistic;
}
export async function offlineRead(scope, execute) {
  if (!globalThis.window) return execute();
  let failure;
  if (globalThis.navigator?.onLine!==false) {
    try { const value = await execute(); cacheWrite(scope, value); return value; }
    catch (error) { if(error.name==='AbortError'||error.cause?.name==='AbortError')throw error;if (!networkFailure(error)) throw error;failure=error;if(!error.status)connectionFailed(); }
  }
  const value = cacheRead(scope);
  if(value===null&&failure?.status)throw failure;
  if (value === null) throw new Error('Este conteúdo ainda não foi salvo no aparelho. Abra-o uma vez com internet para usá-lo offline.');
  return value&&typeof value==='object'&&!Array.isArray(value)?{...value,_offlineCached:true}:value;
}
export const apiScope = (name, owner, payload) => `${name}:${owner || visitorOwner}:${JSON.stringify(payload)}`;
