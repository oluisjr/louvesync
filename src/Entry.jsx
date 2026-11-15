import { useCallback, useEffect, useState } from 'react';
import LouveSync, { Biblia } from './App.jsx';
import ChurchCommunity from './components/ChurchCommunity.jsx';
import { authenticateMember } from './lib/supabase.js';
import { isChurchMember, normalizeMember } from './lib/member-settings.js';
import { publicMember, readActorSession, setMutationActor } from './lib/member-session.js';
import { readCache, writeCache } from './lib/domain.js';
import { useAppDisplay } from './hooks/useAppDisplay.js';

function restored() {
  const profile=readCache('ls_profile',null),actor=readActorSession(),last=Number(localStorage.getItem('ls_last_activity')||0);
  return profile?.id&&actor?.memberId===profile.id&&(!last||Date.now()-last<4*60*60*1000)?{profile:normalizeMember(publicMember(profile)),actor}:null;
}
export default function Entry() {
  const [session,setSession]=useState(restored),[mode,setMode]=useState(()=>{const cached=restored();return cached&&!isChurchMember(cached.profile)?'private':'community';});
  const [dark,setDark]=useState(()=>localStorage.getItem('ls_theme')==='dark');
  const leave=useCallback(()=>{setMutationActor(null);['ls_profile','ls_actor_session','ls_last_activity'].forEach(key=>localStorage.removeItem(key));setSession(null);setMode('community');},[]);
  const enterCommunity=useCallback((profile,actor)=>{setSession({profile:normalizeMember(publicMember(profile)),actor});setDark(localStorage.getItem('ls_theme')==='dark');setMode('community');},[]);
  useEffect(()=>{
    if(mode!=='community'||!session?.actor)return;
    let disposed=false,running=false;const actor=session.actor;
    const refresh=async()=>{if(running||!navigator.onLine||document.visibilityState==='hidden')return;running=true;try{const profile=normalizeMember(publicMember(await authenticateMember(actor.memberId,actor.pin)));if(disposed)return;if(!isChurchMember(profile)){writeCache('ls_profile',profile);setMutationActor(actor);setSession({profile,actor});setMode('private');return;}writeCache('ls_profile',profile);setSession(previous=>JSON.stringify(previous.profile)===JSON.stringify(profile)?previous:{...previous,profile});}catch(error){if(!disposed&&/incorreto|inativo|inválid|expir/i.test(error.message))leave();}finally{running=false;}};
    void refresh();const timer=setInterval(refresh,30000);window.addEventListener('online',refresh);document.addEventListener('visibilitychange',refresh);return()=>{disposed=true;clearInterval(timer);window.removeEventListener('online',refresh);document.removeEventListener('visibilitychange',refresh);};
  },[mode,session?.actor,leave]);
  if(mode==='private')return <LouveSync onVisitor={()=>{setSession(null);setDark(localStorage.getItem('ls_theme')==='dark');setMode('community');}} onCommunitySession={enterCommunity}/>;
  return <CommunitySurface key={session?.profile?.id||'visitor'} profile={session?.profile||null} credentials={session?.actor||null} onLogin={()=>setMode('private')} onLogout={leave} dark={dark} setDark={setDark} BibleView={Biblia}/>;
}
function CommunitySurface(props) { useAppDisplay(props.dark,true); return <ChurchCommunity {...props}/>; }
