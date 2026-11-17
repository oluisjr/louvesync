import { useEffect, useRef, useState } from 'react';
import { useConnectivity } from './useConnectivity.js';
import { readJobs, jobsFor, subscribeJobs, acknowledge, migrateJobs, updateJobs, cacheRead, cacheWrite } from '../lib/offline-store.js';
import { networkFailure, connectionFailed } from '../lib/connectivity.js';
import { replayJob } from '../lib/offline-replay.js';
import { actorClient } from '../lib/actor-client.js';
import { authenticateMember, publicSupabaseConfig, supabase } from '../lib/supabase.js';
import { Capacitor } from '@capacitor/core';
import { broadcastUpdate } from '../lib/realtime.js';

export function useOfflineSync(actor, profile, onPinChanged) {
  const owner = actor?.memberId || 'visitor', online = useConnectivity();
  const [jobs, setJobs] = useState(readJobs), [error, setError] = useState(''), [syncing, setSyncing] = useState(false), [retry, setRetry] = useState(0);
  const [ready,setReady]=useState(()=>!!import.meta.env?.DEV||Capacitor.isNativePlatform()||!!navigator.serviceWorker?.controller);
  useEffect(()=>{
    if(!navigator.serviceWorker)return;
    let disposed=false;const check=()=>{if(!disposed&&navigator.serviceWorker.controller)setReady(true);};
    navigator.serviceWorker.addEventListener('controllerchange',check);void navigator.serviceWorker.ready.then(check).catch(()=>{});
    return()=>{disposed=true;navigator.serviceWorker.removeEventListener('controllerchange',check);};
  },[]);
  const current = useRef(null), running = useRef(false), after = useRef(0),pinChanged=useRef(onPinChanged);
  pinChanged.current=onPinChanged;
  current.current = { owner, pin: actor?.pin };
  useEffect(()=>{if(online)after.current=0;},[online]);
  useEffect(() => subscribeJobs(() => setJobs(readJobs())), []);
  useEffect(() => { migrateJobs(owner); }, [owner]);
  useEffect(() => {
    const timer = setInterval(() => setRetry(value => value + 1), 15000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!online || running.current || Date.now() < after.current || !jobs.some(job => job.actorId === owner && !job.blocked)) return;
    const active = () => current.current?.owner === owner && current.current?.pin === actor?.pin;
    const run = async () => {
      if (!active() || running.current) return;
      running.current = true; setSyncing(true);
      try {
        // Cached permissions only unlock the local workspace. The live server
        // checks the current PIN, role and assignments before any upload.
        const fresh = actor ? await authenticateMember(owner, actor.pin, { onlineOnly: true }) : null;
        if (!active()) return;
        const client = actor ? (publicSupabaseConfig ? actorClient(publicSupabaseConfig, actor) : supabase) : null;
        const batch=jobsFor(owner).sort((a,b)=>Number(a.type==='save_member'&&a.data.id===owner&&!!a.data.pin)-Number(b.type==='save_member'&&b.data.id===owner&&!!b.data.pin));
        for (const queued of batch) {
          const job=jobsFor(owner).find(value=>value.id===queued.id);
          if(!job)continue;
          if (!active()) break;
          if (job.blocked) continue;
          try {
            const result=await replayJob(job, { client, actor, connection: publicSupabaseConfig, profile: fresh || profile, active });
            if(job.type==='maestro'&&job.data.purpose!=='chat')cacheWrite('completed:'+owner,[...cacheRead('completed:'+owner,[]),{id:job.id,title:'Formatação do Maestro',text:result}]);
            if(job.type==='song_search'||job.type==='song_lookup')cacheWrite('completed:'+owner,[...cacheRead('completed:'+owner,[]),{id:job.id,title:job.type==='song_search'?'Busca de '+job.data.title:'Cifra consultada',text:typeof result==='string'?result:job.type==='song_lookup'?result?.text||'Nenhum texto disponível.':(result||[]).map(item=>item.title+' · '+item.artist+'\n'+item.url).join('\n\n')}]);
            acknowledge(job.id);
            if(active())void broadcastUpdate({type:job.type==='attendance'?'attendance_changed':'data_changed',...(job.data.eventId?{eventId:job.data.eventId}:{})}).catch(()=>{});
            window.dispatchEvent(new CustomEvent('louvesync:synced', { detail: { owner, type: job.type, id: job.id, eventId:job.data?.eventId, entityId:job.data?.requestId||job.data?.id } }));
            if(job.type==='save_member'&&job.data.id===owner&&job.data.pin){await pinChanged.current?.(job.data.pin,result);break;}
          } catch (failure) {
            if (networkFailure(failure)) throw failure;
            updateJobs(list => list.map(value => value.id === job.id ? { ...value, blocked: true, error: failure.message } : value));
            setError(failure.message);
          }
        }
        if (!jobsFor(owner).length) setError('');
      } catch (failure) {
        after.current = Date.now() + 14000;
        setError(failure.message);
        if (networkFailure(failure)&&!failure.status) connectionFailed();
      } finally { running.current = false; setSyncing(false); }
    };
    // One uploader across tabs. The queue is reread after acquiring the lock.
    void (navigator.locks ? navigator.locks.request('louvesync-outbox', { ifAvailable: true }, lock => lock && run()) : run());
  }, [online, jobs, owner, actor, profile, retry]);
  const retryNow = () => { after.current = 0; updateJobs(list => list.map(job => job.actorId === owner ? { ...job, blocked: false, error: undefined } : job)); setRetry(value => value + 1); };
  const results=cacheRead('completed:'+owner,[]);
  const dismissResult=id=>{cacheWrite('completed:'+owner,results.filter(result=>result.id!==id));setRetry(value=>value+1);};
  return { online,ready, pending: jobs.filter(job => job.actorId === owner).length, jobs: jobs.filter(job => job.actorId === owner), error, syncing, retry: retryNow,results,dismissResult };
}
