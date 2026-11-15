import { useCallback, useEffect, useState } from 'react';
import LouveSync, { Biblia } from './App.jsx';
import ChurchCommunity from './components/ChurchCommunity.jsx';
import { authenticateMember } from './lib/supabase.js';
import { isChurchMember, normalizeMember } from './lib/member-settings.js';
import { publicMember, setMutationActor } from './lib/member-session.js';
import { writeCache } from './lib/domain.js';
import { useAppDisplay } from './hooks/useAppDisplay.js';

export default function Entry() {
  const [session,setSession]=useState(null),[mode,setMode]=useState('community');
  const [dark,setDark]=useState(()=>localStorage.getItem('ls_theme')==='dark');
  const leave=useCallback(()=>{setMutationActor(null);['ls_profile','ls_actor_session','ls_last_activity'].forEach(key=>localStorage.removeItem(key));setDark(localStorage.getItem('ls_theme')==='dark');setSession(null);setMode('community');},[]);
  useEffect(()=>{setMutationActor(null);['ls_profile','ls_actor_session','ls_last_activity'].forEach(key=>localStorage.removeItem(key));},[]);
  const enterCommunity=useCallback((profile,actor)=>{setSession({profile:normalizeMember(publicMember(profile)),actor});setDark(localStorage.getItem('ls_theme')==='dark');setMode('community');},[]);
  useEffect(()=>{
    if(mode!=='community'||!session?.actor)return;
    let disposed=false,running=false;const actor=session.actor;
    const refresh=async()=>{if(running||!navigator.onLine||document.visibilityState==='hidden')return;running=true;try{const profile=normalizeMember(publicMember(await authenticateMember(actor.memberId,actor.pin)));if(disposed)return;if(!isChurchMember(profile)){writeCache('ls_profile',profile);setMutationActor(actor);setSession({profile,actor});setMode('private');return;}writeCache('ls_profile',profile);setSession(previous=>JSON.stringify(previous.profile)===JSON.stringify(profile)?previous:{...previous,profile});}catch(error){if(!disposed&&/incorreto|inativo|inválid|expir/i.test(error.message))leave();}finally{running=false;}};
    void refresh();const timer=setInterval(refresh,30000);window.addEventListener('online',refresh);document.addEventListener('visibilitychange',refresh);return()=>{disposed=true;clearInterval(timer);window.removeEventListener('online',refresh);document.removeEventListener('visibilitychange',refresh);};
  },[mode,session?.actor,leave]);
  if(mode==='private')return <LouveSync onVisitor={leave} onCommunitySession={enterCommunity}/>;
  return <CommunitySurface key={session?.profile?.id||'visitor'} profile={session?.profile||null} credentials={session?.actor||null} onLogin={()=>setMode('private')} onLogout={leave} dark={dark} setDark={setDark} BibleView={Biblia}/>;
}
function CommunitySurface(props) { useAppDisplay(props.dark,true); return <ChurchCommunity {...props}/>; }
