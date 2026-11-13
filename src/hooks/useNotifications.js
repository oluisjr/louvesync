import { useCallback, useEffect, useRef, useState } from 'react';
import { applicationServerKey, notificationRequest, pushSupport } from '../lib/notifications-client.js';
import { broadcastUpdate, onRealtime } from '../lib/realtime.js';

const empty = {owner:null,items:[],loading:false,error:'',setupRequired:false,publicKey:'',pushConfigured:false};
const announce = () => { void broadcastUpdate({type:'notifications_changed'},{ensureConnection:false}).catch(()=>{}); };
async function registration() {
  const worker=await navigator.serviceWorker.getRegistration('/');
  if (!worker?.active) throw new Error('Feche e abra o app novamente para ativar os avisos neste aparelho.');
  return worker;
}
export function useNotifications(credentials) {
  const [state,setState]=useState(empty);
  const [push,setPush]=useState({active:false,busy:false,error:''});
  const memberId=credentials?.memberId, pin=credentials?.pin;
  const currentCredentials=useRef(credentials); currentCredentials.current=credentials;
  const loadRef=useRef(()=>{}), configRef=useRef(()=>{}), dispatching=useRef(null);
  const scheduled=useRef(null);
  useEffect(()=>()=>clearTimeout(scheduled.current),[]);
  const support=pushSupport();
  const dispatch=useCallback(async()=>{
    const actor=currentCredentials.current;
    if (!actor || !navigator.onLine) return;
    if (dispatching.current) return dispatching.current;
    const job=notificationRequest(actor,{action:'dispatch'},{keepalive:true}).then(()=>{announce();void loadRef.current();}).catch(()=>{}).finally(()=>{if(dispatching.current===job)dispatching.current=null;});
    dispatching.current=job;
    return job;
  },[]);
  useEffect(()=>{
    if (!memberId || !pin) {setState(empty);setPush({active:false,busy:false,error:''});return;}
    let disposed=false, loading=false;
    const controller=new AbortController(),actor={memberId,pin};
    setState({...empty,owner:memberId,loading:true});
    setPush({active:false,busy:false,error:''});
    const load=async()=>{
      if(disposed||loading||!navigator.onLine||document.visibilityState==='hidden')return;
      loading=true;
      try {
        const data=await notificationRequest(actor,{action:'list'},{signal:controller.signal});
        if(!Array.isArray(data.items))throw new Error('A lista de notificações está indisponível.');
        if(!disposed)setState(previous=>({...previous,owner:memberId,items:data.items,loading:false,error:'',setupRequired:false}));
      } catch(error) {if(!disposed)setState(previous=>({...previous,loading:false,error:error.message,setupRequired:error.setupRequired===true}));}
      finally{loading=false;}
    };
    loadRef.current=load;
    const configure=()=>notificationRequest(actor,{action:'config'},{signal:controller.signal}).then(async config=>{
      if(disposed)return;
      setState(previous=>({...previous,publicKey:config.publicKey||'',pushConfigured:config.pushConfigured===true}));
      if(pushSupport().supported){
        const worker=await navigator.serviceWorker.getRegistration('/');
        const subscription=await worker?.pushManager.getSubscription();
        if(subscription){
          await notificationRequest(actor,{action:'subscribe',subscription:subscription.toJSON()},{signal:controller.signal});
          if(!disposed)setPush({active:true,busy:false,error:''});
        }
      }
    }).catch(()=>{});
    configRef.current=configure;void configure();
    void load();void dispatch();
    const resume=()=>{void load();void dispatch();};
    const off=onRealtime(message=>{if(message.type==='notifications_changed')void load();});
    const timer=setInterval(resume,20000);
    window.addEventListener('online',resume);window.addEventListener('louvesync:resume',resume);document.addEventListener('visibilitychange',resume);
    return()=>{disposed=true;controller.abort();clearInterval(timer);off();loadRef.current=()=>{};configRef.current=()=>{};window.removeEventListener('online',resume);window.removeEventListener('louvesync:resume',resume);document.removeEventListener('visibilitychange',resume);};
  },[memberId,pin,dispatch]);
  const markRead=async ids=>{
    if(!credentials||!ids.length)return;
    try{
      await notificationRequest(credentials,{action:'mark_read',ids});
      setState(previous=>({...previous,items:previous.items.map(item=>ids.includes(item.id)?{...item,read_at:item.read_at||new Date().toISOString()}:item)}));
    }catch(error){setState(previous=>({...previous,error:error.message}));}
  };
  const enablePush=async()=>{
    setPush(previous=>({...previous,busy:true,error:''}));
    try{
      if(!support.supported)throw new Error(support.reason);
      if(!state.pushConfigured||!state.publicKey)throw new Error('Os avisos neste aparelho ainda precisam ser ativados pelo administrador.');
      // Permission is requested in the click handler, before any asynchronous work.
      const permission=await Notification.requestPermission();
      if(permission!=='granted')throw new Error(permission==='denied'?'As notificações foram bloqueadas. Libere-as nas configurações do navegador.':'A permissão não foi concedida. Você pode tentar novamente.');
      const worker=await registration();
      const existing=await worker.pushManager.getSubscription();
      const subscription=existing||await worker.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:applicationServerKey(state.publicKey)});
      try{await notificationRequest(credentials,{action:'subscribe',subscription:subscription.toJSON()});}
      catch(error){if(!existing)await subscription.unsubscribe();throw error;}
      setPush({active:true,busy:false,error:''});
    }catch(error){setPush(previous=>({...previous,busy:false,error:error.message}));}
  };
  const disablePush=async()=>{
    setPush(previous=>({...previous,busy:true,error:''}));
    try{
      const worker=await registration(),subscription=await worker.pushManager.getSubscription();
      if(subscription){await notificationRequest(credentials,{action:'unsubscribe',endpoint:subscription.endpoint});await subscription.unsubscribe();}
      setPush({active:false,busy:false,error:''});
    }catch(error){setPush(previous=>({...previous,busy:false,error:error.message}));}
  };
  const detach=async()=>{
    if(!navigator.serviceWorker)return;
    try{
      const worker=await navigator.serviceWorker.getRegistration('/'),subscription=await worker?.pushManager.getSubscription();
      if(subscription){await Promise.allSettled([notificationRequest(credentials,{action:'unsubscribe',endpoint:subscription.endpoint}),subscription.unsubscribe()]);}
    }catch{/* The browser may have already revoked its subscription. */}
  };
  const current=state.owner===memberId?state:empty;
  const changed=useCallback(()=>{void dispatch();clearTimeout(scheduled.current);scheduled.current=setTimeout(()=>void dispatch(),1500);},[dispatch]);
  return {...current,push,support,enablePush,disablePush,detach,markRead,dispatch,changed,refresh:()=>{void loadRef.current();void configRef.current();},markAllRead:()=>markRead(current.items.filter(item=>!item.read_at).map(item=>item.id))};
}
