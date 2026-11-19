import { useState, useEffect, useRef, useMemo, useId, memo, useCallback, Component } from 'react';
import { fetchMembers, fetchSongs, fetchEvents, upsertSong, deleteSong as dbDelSong, setPresence, setInstrumentForEvent, setSequenceForSong, rejectDeleteSong, supabase, upsertMember, deleteMember, upsertEvent, deleteEvent as dbDelEvent, rejectDeleteEvent, setEventItems, setSingerForSong, saveVocalKey, setSetlistConfirmation, authenticateMember } from './lib/supabase';
import {  searchSongCandidates, fetchCifraClubContent } from './lib/scraper';
import { createPortal } from 'react-dom';
import { printCifra } from './lib/native.js';
import { checkForAppUpdate } from './lib/app-updates.js';
import Bible from './components/Bible.jsx';
import ChromaticTuner from './components/ChromaticTuner.jsx';
import Rehearsal from './components/Rehearsal.jsx';
import { Dialog, Icon, Section, SearchField } from './components/Interface.jsx';
import { publicMember, readActorSession, setMutationActor } from './lib/member-session.js';
import { canManageMinistry, songProposal } from './lib/change-requests.js';
import EventDetails from './components/EventDetails.jsx';
import MentionInput from './components/MentionInput.jsx';
import ChangeRequestsScreen from './components/ChangeRequestsScreen.jsx';
import ChangeRequestDialog from './components/ChangeRequestDialog.jsx';
import { performanceKey, renderChordText } from './lib/chords.js';
import { ALL_VOCALS, isIndividualVocal } from './lib/event-vocals.js';
import { chooseInstrument } from './lib/event-instruments.js';
import { withSongChart } from './lib/song-charts.js';
import MemberEditor from './components/MemberEditor.jsx';
import MaestroScreen from './components/MaestroScreen.jsx';
import ChurchAdmin from './components/ChurchAdmin.jsx';
import { canSeeScreen, effectiveScreens, isChurchMember, normalizeMember, availableMembers, availabilityReason, rosterConflicts } from './lib/member-settings.js';
import { maestroRequest } from './lib/maestro-client.js';
import EquipmentEditor from './components/EquipmentEditor.jsx';
import EquipmentInventory from './components/EquipmentInventory.jsx';
import Repertorio from './components/Repertoire.jsx';
import Home from './components/HomeScreen.jsx';
import ScheduleScreen from './components/ScheduleScreen.jsx';
import AttendanceScreen from './components/AttendanceScreen.jsx';
import { canManageAttendance } from './lib/attendance.js';
import { isSetlistConfirmed } from './lib/setlist-confirmation.js';
import AppNavigation from './components/AppNavigation.jsx';
import MoreMenu from './components/MoreMenu.jsx';
import CommunityMural from './components/CommunityMural.jsx';
import PracticalTraining from './components/PracticalTraining.jsx';
import NotificationInbox from './components/NotificationInbox.jsx';
import { useNotifications } from './hooks/useNotifications.js';
import { notificationDestination } from './lib/notifications-client.js';
import './home.css';
import './song-editor.css';
import MetronomeControls from './components/MetronomeControls.jsx';
import { useMetronome } from './hooks/useMetronome.js';
import { useAppDisplay } from './hooks/useAppDisplay.js';
import { useNavigationClearance } from './hooks/useNavigationClearance.js';
import { useActivity } from './hooks/useActivity.js';
import { useLoginViewport } from './hooks/useLoginViewport.js';
import { ActivityMonitor } from './components/Activity.jsx';
import { useOfflineSync } from './hooks/useOfflineSync.js';
import OfflineStatus from './components/OfflineStatus.jsx';
import { offlineAction } from './lib/offline-actions.js';
import { enqueue, cacheRead, cacheWrite, jobsFor } from './lib/offline-store.js';
import { overlayWorkspace } from './lib/offline-overlay.js';
import { connectionAvailable,connectionSucceeded } from './lib/connectivity.js';
import { unlockIdentity, rememberIdentity } from './lib/offline-identity.js';
import { prepareOfflineWorkspace } from './lib/offline-prepare.js';

import { localDate, transposeKey, keyDistance, normalizeEvent, eventPayload, readCache, writeCache } from './lib/domain.js';
import { withoutRehearsalSongs } from './lib/rehearsal-events.js';
import { onRealtime, onRealtimeStatus, broadcastUpdate, disconnectRealtime } from './lib/realtime.js';

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('🔴 React Error Boundary:', error, info); }
  render() {
    if (this.state.error) {
      return (
        <div style={{padding:24,background:'#1a0000',color:'#ff6b6b',fontFamily:'monospace',fontSize:13,minHeight:'100dvh',overflowY:'auto'}}>
          <div style={{fontSize:18,fontWeight:900,marginBottom:12}}>⚠️ Erro de renderização capturado</div>
          <div style={{background:'rgba(255,0,0,.1)',padding:12,borderRadius:8,marginBottom:12,whiteSpace:'pre-wrap',wordBreak:'break-word'}}>{String(this.state.error?.message || this.state.error)}</div>
          <div style={{fontSize:11,opacity:.7,whiteSpace:'pre-wrap',wordBreak:'break-word'}}>{this.state.error?.stack}</div>
          <button onClick={()=>this.setState({error:null})} style={{marginTop:16,padding:'8px 16px',background:'#7B3FF2',color:'#fff',border:'none',borderRadius:8,cursor:'pointer',fontWeight:700}}>Tentar novamente</button>
        </div>
      );
    }
    return this.props.children;
  }
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
html,body,#root{-webkit-font-smoothing:antialiased;}
:root{
  --fs-xs:12px;--fs-sm:14px;--fs-base:16px;--fs-lg:18px;--fs-xl:22px;--fs-2xl:28px;
  /* Paleta Presença: Violeta + Chama */
  --c-i:#7B3FF2;--c-id:#A855F7;--c-g:#00C9A7;--c-a:#FF6B35;--c-p:#EC4899;--c-r:#EF4444;
  --c-i-light:#9B6BF8;--c-a-light:#FF8C5A;
  --r-sm:10px;--r-md:14px;--r-lg:18px;--r-xl:22px;--r-full:100px;
}
.ls{font-family:'Nunito', sans-serif;height:100%;overflow:hidden;position:relative;}
.font-serif { font-family: 'Nunito', sans-serif; letter-spacing: -.02em; }
.bg{position:fixed;inset:0;z-index:0;transition:background .7s;}
.bg-l{background:linear-gradient(145deg,#EFE3FF 0%,#FFF1E8 50%,#E8F0FF 100%);}
.bg-d{background:linear-gradient(160deg,#211934 0%,#30204F 50%,#251C3D 100%);}
.orb{position:absolute;border-radius:50%;pointer-events:none;filter:blur(100px);will-change:transform;}
@keyframes oA{0%,100%{transform:translate(0,0) scale(1)}40%{transform:translate(30px,-45px) scale(1.1)}70%{transform:translate(-15px,22px) scale(.93)}}
@keyframes oB{0%,100%{transform:translate(0,0) scale(1)}35%{transform:translate(-28px,32px) scale(.9)}70%{transform:translate(22px,-18px) scale(1.08)}}
@keyframes oC{0%,100%{transform:translate(0,0) scale(1)}55%{transform:translate(20px,28px) scale(1.06)}}
@keyframes oD{0%,100%{transform:translate(0,0) scale(1)}45%{transform:translate(-18px,-25px) scale(.95)}}
.gL0{background:rgba(255,255,255,.5);backdrop-filter:blur(16px) saturate(180%) contrast(105%);-webkit-backdrop-filter:blur(16px) saturate(180%) contrast(105%);border:1px solid rgba(255,255,255,.8);box-shadow:inset 0 1px 1px rgba(255,255,255,1), 0 4px 12px rgba(123,63,242,.04);}
.gL1{background:rgba(255,255,255,.6);backdrop-filter:blur(24px) saturate(200%) contrast(110%);-webkit-backdrop-filter:blur(24px) saturate(200%) contrast(110%);border:1px solid rgba(255,255,255,1);box-shadow:inset 0 1px 1px rgba(255,255,255,1), 0 8px 24px rgba(0,0,0,.04);}
.gL2{background:rgba(255,255,255,.7);backdrop-filter:blur(32px) saturate(200%) contrast(115%);-webkit-backdrop-filter:blur(32px) saturate(200%) contrast(115%);border-top:1px solid rgba(255,255,255,1);border-left:1px solid rgba(255,255,255,1);box-shadow:inset 0 1px 1px rgba(255,255,255,1), 0 -12px 56px rgba(0,0,0,.05);}
.gNav{background:linear-gradient(135deg,rgba(255,255,255,.68),rgba(247,235,255,.4) 50%,rgba(255,255,255,.58));backdrop-filter:blur(18px) saturate(200%) contrast(108%);-webkit-backdrop-filter:blur(18px) saturate(200%) contrast(108%);border:1px solid rgba(255,255,255,.76);box-shadow:inset 0 2px 2px #ffffffd9,inset 0 -1px 2px #ffffff80,inset 1px 0 2px #ffffff99,0 8px 32px #5420ac26;}
.gIn{background:rgba(255,255,255,.4);backdrop-filter:blur(16px) saturate(180%);-webkit-backdrop-filter:blur(16px) saturate(180%);border:1px solid rgba(255,255,255,1);border-radius:var(--r-lg);transition:border .2s,box-shadow .2s;box-shadow:inset 0 2px 4px rgba(0,0,0,.02), 0 2px 8px rgba(0,0,0,.01);}
.gIn:focus-within{border-color:var(--c-i);box-shadow:inset 0 1px 2px rgba(0,0,0,.02), 0 0 0 3px rgba(123,63,242,.15), 0 4px 12px rgba(123,63,242,.1);}
.dark .gL0{background:#2A1F42;border:1px solid #715392;box-shadow:inset 0 1px 1px #d0a4ff14,0 4px 12px #14072533;}
.dark .gL1{background:#34244F;border:1px solid #8960AE;box-shadow:inset 0 1px 1px #d0a4ff1a,0 8px 24px #14072540;}
.dark .gL2{background:#402C5F;border-top:1px solid #A578D0;border-left:1px solid #8960AE;box-shadow:0 -12px 40px #14072555;}
.dark .gNav{background:linear-gradient(135deg,rgba(100,59,152,.6),rgba(41,23,66,.42) 50%,rgba(73,40,113,.58));border-color:#d8b4ff66;box-shadow:inset 0 2px 2px #eddbff4d,inset 0 -1px 2px #bb82ff33,inset 1px 0 2px #e3c8ff33,0 8px 32px #14072559;}
.dark .gIn{background:#402B5D;border-color:#A578C4;box-shadow:inset 0 1px 2px #14072533;}
.dark .gIn:focus-within{border-color:var(--c-id);box-shadow:inset 0 1px 2px rgba(0,0,0,.2), 0 0 0 3px rgba(168,85,247,.18);}
.aC-jubilo{border-left:3.5px solid #00C9A7;}.aC-adoracao{border-left:3.5px solid #7B3FF2;}
.aC-hinario{border-left:3.5px solid #FF6B35;}.aC-oferta{border-left:3.5px solid #EC4899;}
.aC-corinho{border-left:3.5px solid #06B6D4;}.aC-ceia{border-left:3.5px solid #E11D48;}
.event-setlist-song-open{display:flex;flex-direction:column;align-items:flex-start;gap:4px;flex:1;min-width:0;padding:0;border:0;background:transparent;text-align:left;font-family:inherit;cursor:pointer;overflow-wrap:anywhere;}
.event-setlist-song-open:focus-visible{outline:2px solid var(--app-link);outline-offset:4px;border-radius:6px;}
.event-setlist-meta{display:flex;align-items:center;flex-wrap:wrap;gap:4px 8px;font-size:var(--fs-xs);line-height:1.4;}
.event-setlist-category{display:inline-flex;align-items:center;gap:5px;max-width:100%;font-size:11px;font-weight:600;}
.event-setlist-category::before{content:'';width:4px;height:4px;flex:0 0 4px;border-radius:50%;background:var(--song-category);opacity:.8;}
::-webkit-scrollbar{width:3px;height:3px;}::-webkit-scrollbar-thumb{background:rgba(123,63,242,.25);border-radius:2px;}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
@keyframes slideUp{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}
@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
@keyframes bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
@keyframes stageIn{from{opacity:0;transform:scale(.97)}to{opacity:1;transform:scale(1)}}
@keyframes confDrop{0%{transform:translateY(-10px) rotate(0deg);opacity:1}100%{transform:translateY(280px) rotate(560deg);opacity:0}}
@keyframes pinShake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-8px)}40%,80%{transform:translateX(8px)}}
@keyframes loginIn{from{opacity:0;transform:scale(.95) translateY(16px)}to{opacity:1;transform:scale(1) translateY(0)}}
@keyframes pulse{0%,100%{opacity:.5}50%{opacity:.2}}
@keyframes flameGlow{0%,100%{box-shadow:0 0 18px rgba(255,107,53,.3)}50%{box-shadow:0 0 32px rgba(255,107,53,.5)}}
.aUp{animation:slideUp .38s cubic-bezier(.22,1,.36,1) both;}
.touch-scale{transition:transform .2s cubic-bezier(.34,1.56,.64,1);cursor:pointer;}
.touch-scale:active{transform:scale(.97);}
.stage-wrap{position:absolute;inset:0;z-index:200;overflow:hidden;animation:stageIn .35s ease;}
.conf-p{position:fixed;pointer-events:none;z-index:9999;animation:confDrop 1.5s ease-out forwards;}
.bp{background:linear-gradient(135deg,#7B3FF2 0%,#5B21B6 100%);color:#fff;border:none;border-radius:var(--r-md);padding:14px 20px;font-family:'Nunito',sans-serif;font-weight:800;font-size:var(--fs-base);cursor:pointer;width:100%;display:flex;align-items:center;justify-content:center;gap:8px;transition:all .25s;box-shadow:0 4px 20px rgba(123,63,242,.3);}
.bp:hover{opacity:.92;box-shadow:0 8px 32px rgba(123,63,242,.45);transform:translateY(-1px);}.bp:active{transform:scale(.97) translateY(0);}.bp:disabled{opacity:.5;cursor:not-allowed;transform:none;}
.bSec{border:1.5px solid rgba(123,63,242,.3);color:#7B3FF2;background:rgba(123,63,242,.07);border-radius:var(--r-sm);padding:11px 16px;font-family:'Nunito',sans-serif;font-weight:700;font-size:var(--fs-sm);cursor:pointer;width:100%;transition:all .2s;display:flex;align-items:center;justify-content:center;gap:8px;}
.dark .bSec{color:#D2B8FF;border-color:#88759C;background:#3A2F55;}
.sc{border-radius:var(--r-xl);padding:16px;cursor:pointer;transition:transform .22s cubic-bezier(.34,1.56,.64,1),box-shadow .22s;margin-bottom:11px;}
.sc:hover{transform:translateY(-3px);box-shadow:0 16px 36px rgba(123,63,242,.15);}.sc:active{transform:scale(.97);}
.nb{display:flex;flex-direction:column;align-items:center;gap:4px;padding:10px 14px;border:none;background:transparent;cursor:pointer;position:relative;transition:transform .15s;}
.nb:active{transform:scale(.9);}.nb .ni{transition:transform .28s cubic-bezier(.34,1.56,.64,1);}.nb.on .ni{transform:scale(1.18);}
.nl{font-size:10px;font-weight:700;letter-spacing:.02em;font-family:'Nunito',sans-serif;transition:color .2s;}
.ndot{position:absolute;bottom:3px;left:50%;transform:translateX(-50%);height:3px;border-radius:100px;transition:width .32s cubic-bezier(.34,1.56,.64,1);}
.chord{font-family:'JetBrains Mono',monospace;color:#FF6B35;font-weight:800;font-size:12px;line-height:1.1;display:block;min-height:14px;}
.bdg{display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:100px;font-size:var(--fs-xs);font-weight:800;}
.bJ{background:rgba(0,201,167,.1);color:#00956E;border:1px solid rgba(0,201,167,.25);}
.bA{background:rgba(123,63,242,.1);color:#7B3FF2;border:1px solid rgba(123,63,242,.22);}
.bH{background:rgba(255,107,53,.1);color:#D94E1A;border:1px solid rgba(255,107,53,.22);}
.bO{background:rgba(236,72,153,.1);color:#DB2777;border:1px solid rgba(236,72,153,.22);}
.bC{background:rgba(225,29,72,.1);color:#BE123C;border:1px solid rgba(225,29,72,.22);}
.bCo{background:rgba(6,182,212,.1);color:#0891B2;border:1px solid rgba(6,182,212,.22);}
.dark .bJ{background:rgba(0,201,167,.15);color:#5CE5C8;}.dark .bA{background:rgba(168,85,247,.15);color:#D2B8FF;}
.dark .bH{background:rgba(255,107,53,.15);color:#FFB38B;}.dark .bO{background:rgba(236,72,153,.15);color:#FFA8D0;}
.dark .bC{background:rgba(225,29,72,.15);color:#FFA0B2;}.dark .bCo{background:rgba(6,182,212,.15);color:#75D8EA;}
.tog{width:52px;height:28px;border-radius:100px;border:none;cursor:pointer;position:relative;flex-shrink:0;transition:background .35s;}
.tog::after{content:'';position:absolute;top:4px;left:4px;width:20px;height:20px;background:#fff;border-radius:50%;transition:transform .32s cubic-bezier(.34,1.56,.64,1);box-shadow:0 1px 5px rgba(0,0,0,.18);}
.tog.on::after{transform:translateX(24px);}
input, textarea, select, button { touch-action: manipulation; }
select { -webkit-appearance: none; appearance: none; }
@keyframes shareBtn{0%{transform:scale(1)}50%{transform:scale(.9)}100%{transform:scale(1)}}
@keyframes rotatePhone{0%,100%{transform:rotate(0deg) scale(1)}45%,55%{transform:rotate(-90deg) scale(.85)}}
.rotate-msg{position:absolute;inset:0;z-index:9999;background:#1D1B2D;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;color:#E2E8F0;}
.pbar{height:3px;border-radius:100px;background:rgba(123,63,242,.12);overflow:hidden;}
.pbar-fill{height:100%;border-radius:100px;background:linear-gradient(90deg,#7B3FF2,#A855F7);transition:width .5s ease;}
.fi{width:100%;padding:12px 14px;background:transparent;border:none;outline:none;font-family:'Nunito',sans-serif;font-size:var(--fs-base);font-weight:500;}
textarea.fi{resize:none;}.ndot-ring{position:absolute;top:-1px;right:-1px;width:9px;height:9px;background:#EF4444;border-radius:50%;border:2px solid rgba(255,255,255,.9);}
input,textarea,button{font-family:'Nunito',sans-serif;}
/* ─── DARK MODE GLOBAL ────────────────────────── */
.dark{color-scheme:dark;}
.dark .fi{color:#F5F2FF;}
.dark .fi::placeholder{color:#B9AFCD;opacity:1;}
.dark .chord{color:#FF8C5A;}
.dark .sc{background:linear-gradient(135deg,rgba(30,12,70,.92),rgba(18,6,45,.88));border:1px solid rgba(168,85,247,.15);box-shadow:0 2px 16px rgba(0,0,0,.5);}
.dark .sc:hover{box-shadow:0 8px 28px rgba(0,0,0,.6),0 0 0 1px rgba(168,85,247,.22);}
.dark .bp{box-shadow:0 4px 22px rgba(123,63,242,.45);}
.dark .nb{color:#94A3B8;}
.dark .nb.on .nl,.dark .nb.on .ni{color:#A855F7;}
.dark .ndot-ring{border-color:rgba(10,4,20,.9);}
.dark input[type=date],.dark input[type=time]{color-scheme:dark;color:#CBD5E1;background:transparent;}
.dark .bdg{opacity:.9;}
.dark hr,.dark [style*="height:1px"]{background:rgba(255,255,255,.07)!important;}
`;

/* ─── CONSTANTS ─────────────────────────────────────────────── */
const CAT = {
  jubilo:   { label:'Júbilo',   color:'#00C9A7', cls:'bJ', acc:'aC-jubilo' },
  adoracao: { label:'Adoração', color:'#7B3FF2', cls:'bA', acc:'aC-adoracao' },
  hinario:  { label:'Hinário',  color:'#FF6B35', cls:'bH', acc:'aC-hinario' },
  oferta:   { label:'Oferta',   color:'#EC4899', cls:'bO', acc:'aC-oferta' },
  corinho:  { label:'Corinhos', color:'#06B6D4', cls:'bCo', acc:'aC-corinho' },
  ceia:     { label:'Santa Ceia', color:'#E11D48', cls:'bC', acc:'aC-ceia' }
};
const TIME_SIGS = ['4/4','3/4','2/4','6/8','12/8'];
const KEYS     = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

const IcoHeart    = ({s=16,filled=false})=><svg width={s} height={s} viewBox="0 0 24 24" fill={filled?'currentColor':'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>;
const IcoScroll   = ({s=16})=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="7 11 12 16 17 11"/><polyline points="7 7 12 12 17 7"/><line x1="12" y1="20" x2="12" y2="16"/></svg>;
const IcoShare    = ({s=16})=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>;
const IcoTap      = ({s=14})=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z"/><path d="M12 6v6l4 2"/></svg>;

const M = [
  { id:'aaaa0001-0001-0001-0001-000000000001', name:'Junior',       role:'Líder de Louvor', instrument:'Teclado / Vocal', avatar:'JR', color:'#4F46E5', status:'ativo', is_admin:true, vocal_category:null },
  { id:'aaaa0002-0002-0002-0002-000000000002', name:'Ignacio',      role:'Músico',          instrument:'Baixo',          avatar:'IG', color:'#10B981', status:'ativo', is_admin:false, vocal_category:null },
  { id:'aaaa0003-0003-0003-0003-000000000003', name:'Cleide',       role:'Vocal',           instrument:'Vocal 1',        avatar:'CL', color:'#EC4899', status:'ativo', is_admin:false, vocal_category:'adoracao' },
  { id:'aaaa0004-0004-0004-0004-000000000004', name:'Sonia',        role:'Vocal',           instrument:'Vocal 2',        avatar:'SO', color:'#F59E0B', status:'ativo', is_admin:false, vocal_category:'jubilo' },
  { id:'aaaa0005-0005-0005-0005-000000000005', name:'Kassya',       role:'Vocal',           instrument:'Vocal 4',        avatar:'KA', color:'#8B5CF6', status:'ativo', is_admin:false, vocal_category:'adoracao' },
  { id:'aaaa0006-0006-0006-0006-000000000006', name:'Maria Helena', role:'Vocal',           instrument:'Back Vocal',     avatar:'MH', color:'#06B6D4', status:'ativo', is_admin:false, vocal_category:'hinario' },
  { id:'aaaa0007-0007-0007-0007-000000000007', name:'Lidia',        role:'Vocal',           instrument:'Vocal 5',        avatar:'LI', color:'#EF4444', status:'ativo', is_admin:false, vocal_category:'hinario' },
  { id:'aaaa0008-0008-0008-0008-000000000008', name:'Josi',         role:'Vocal',           instrument:'Vocal 3',        avatar:'JO', color:'#14B8A6', status:'ativo', is_admin:false, vocal_category:'jubilo' },
  { id:'aaaa0009-0009-0009-0009-000000000009', name:'Aragão',       role:'Músico',          instrument:'Violão',         avatar:'AR', color:'#F97316', status:'ativo', is_admin:false, vocal_category:null },
  { id:'aaaa0010-0010-0010-0010-000000000010', name:'Samuel',       role:'Músico',          instrument:'Bateria',        avatar:'SA', color:'#84CC16', status:'ativo', is_admin:false, vocal_category:null },
  { id:'aaaa0011-0011-0011-0011-000000000011', name:'Darci',        role:'Músico',          instrument:'Violão',         avatar:'DA', color:'#A855F7', status:'ativo', is_admin:false, vocal_category:null },
];

const BIBLE_BOOKS = [
  {a:'genesis',n:'Gênesis',c:50}, {a:'exodus',n:'Êxodo',c:40}, {a:'leviticus',n:'Levítico',c:27}, {a:'numbers',n:'Números',c:36}, {a:'deuteronomy',n:'Deuteronômio',c:34},
  {a:'joshua',n:'Josué',c:24}, {a:'judges',n:'Juízes',c:21}, {a:'ruth',n:'Rute',c:4}, {a:'1 samuel',n:'1 Samuel',c:31}, {a:'2 samuel',n:'2 Samuel',c:24},
  {a:'1 kings',n:'1 Reis',c:22}, {a:'2 kings',n:'2 Reis',c:25}, {a:'1 chronicles',n:'1 Crônicas',c:29}, {a:'2 chronicles',n:'2 Crônicas',c:36}, {a:'ezra',n:'Esdras',c:10},
  {a:'nehemiah',n:'Neemias',c:13}, {a:'esther',n:'Ester',c:10}, {a:'job',n:'Jó',c:42}, {a:'psalms',n:'Salmos',c:150}, {a:'proverbs',n:'Provérbios',c:31},
  {a:'ecclesiastes',n:'Ecclesiastes',c:12}, {a:'song of solomon',n:'Cânticos',c:8}, {a:'isaiah',n:'Isaías',c:66}, {a:'jeremiah',n:'Jeremias',c:52}, {a:'lamentations',n:'Lamentações',c:5},
  {a:'ezekiel',n:'Ezequiel',c:48}, {a:'daniel',n:'Daniel',c:12}, {a:'hosea',n:'Oséias',c:14}, {a:'joel',n:'Joel',c:3}, {a:'amos',n:'Amós',c:9},
  {a:'obadiah',n:'Obadias',c:1}, {a:'jonah',n:'Jonas',c:4}, {a:'micah',n:'Miquéias',c:7}, {a:'nahum',n:'Naum',c:3}, {a:'habakkuk',n:'Habacuque',c:3},
  {a:'zephaniah',n:'Sofonias',c:3}, {a:'haggai',n:'Ageu',c:2}, {a:'zechariah',n:'Zacarias',c:14}, {a:'malachi',n:'Malaquias',c:4},
  {a:'matthew',n:'Mateus',c:28}, {a:'mark',n:'Marcos',c:16}, {a:'luke',n:'Lucas',c:24}, {a:'john',n:'João',c:21}, {a:'acts',n:'Atos',c:28},
  {a:'romans',n:'Romanos',c:16}, {a:'1 corinthians',n:'1 Coríntios',c:16}, {a:'2 corinthians',n:'2 Coríntios',c:13}, {a:'galatians',n:'Gálatas',c:6}, {a:'ephesians',n:'Efésios',c:6},
  {a:'philippians',n:'Filipenses',c:4}, {a:'colossians',n:'Colossenses',c:4}, {a:'1 thessalonians',n:'1 Tessalonicenses',c:5}, {a:'2 thessalonians',n:'2 Tessalonicenses',c:3}, {a:'1 timothy',n:'1 Timóteo',c:6},
  {a:'2 timothy',n:'2 Timóteo',c:4}, {a:'titus',n:'Tito',c:3}, {a:'philemon',n:'Filemom',c:1}, {a:'hebrews',n:'Hebreus',c:13}, {a:'james',n:'Tiago',c:5},
  {a:'1 peter',n:'1 Pedro',c:5}, {a:'2 peter',n:'2 Pedro',c:3}, {a:'1 john',n:'1 João',c:5}, {a:'2 john',n:'2 João',c:1}, {a:'3 john',n:'3 João',c:1},
  {a:'jude',n:'Judas',c:1}, {a:'revelation',n:'Apocalipse',c:22}
];




/* ─── HELPERS ───────────────────────────────────────────────── */
function getKey(k,st){return transposeKey(k,st);}
function today(){return localDate();}
function parseLine(line){const segs=[];const parts=line.split(/(\[[^\]]+\])/);let i=0;while(i<parts.length){if(parts[i]?.startsWith('[')&&parts[i]?.endsWith(']')){const ch=parts[i].slice(1,-1);const nx=parts[i+1];const ly=(nx&&!nx.startsWith('['))?nx:'';segs.push({ch,ly});i+=(nx&&!nx.startsWith('['))?2:1;}else{if(parts[i])segs.push({ch:'',ly:parts[i]});i++;}}return segs;}
// Garante que um evento já no formato do app tenha todos os campos obrigatórios
function patchEvent(ev){
  if (!ev) return ev;
  // Se veio do Supabase sem normalizar (tem event_songs), normaliza
  if (ev.event_songs !== undefined) return normalizeEvent(ev);
  // Caso contrário, apenas garante campos ausentes
  return withoutRehearsalSongs({
    items: [],
    requested_songs: [],
    santa_ceia_song: null,
    ...ev,
    songs: ev.songs || [],
    members: ev.members || [],
    confirmations: ev.confirmations || {},
    singerBySong: ev.singerBySong || {},
    sequenceBySong: ev.sequenceBySong || {},
  });
}
function readableTextColor(color,dark){
  const tints=dark?{'#4F46E5':'#BD97FF','#7B3FF2':'#CA9FFF','#00C9A7':'#2EE0B6','#FF6B35':'#FFAA68','#EC4899':'#FF83C1','#E11D48':'#FF8BA4','#06B6D4':'#47D7F0','#10B981':'#37E3A3','#EF4444':'#FF8BA4','#F59E0B':'#FFC250','#94A3B8':'#D7C7EA'}:{'#00C9A7':'#007A63','#FF6B35':'#B64315','#EC4899':'#B61969','#E11D48':'#BE123C','#06B6D4':'#08758B','#10B981':'#007A59','#EF4444':'#C92D4A','#F59E0B':'#9B6100','#94A3B8':'#514064'};
  return typeof color==='string'?(tints[color.toUpperCase()]||color):color;
}
function vib(){if(navigator.vibrate)navigator.vibrate(10);}

function generateDynamicSetlist(eventDate, eventType, allSongs, recentEvents=[], requestedSongs=[], santaCeiaSong=null){
  // Returns array of song IDs for dynamic setlist based on event type
  if(eventType!=='culto'||!allSongs.length)return [];
  const isQuinta=new Date(eventDate+'T12:00:00').getDay()===4;
  const isDomingo=new Date(eventDate+'T12:00:00').getDay()===0;


  const recentSongs = new Set();
  const dObj = new Date(eventDate+'T12:00:00');
  const dMin = new Date(dObj);
  dMin.setDate(dMin.getDate() - 21);
  const dMinStr = dMin.toLocaleDateString('sv-SE');
  recentEvents.forEach(e => {
    if(e.date >= dMinStr && e.date < eventDate && e.type === 'culto') {
      e.songs.forEach(sid => recentSongs.add(sid));
    }
  });

  // Get requested songs first
  const selected=[...requestedSongs.filter(id=>allSongs.find(s=>s.id===id))];

  // Define quotas by event type
  const quotas = isQuinta ?
    {jubilo:1, adoracao:1, hinario:1, oferta:1} :
    isDomingo ?
    {jubilo:1, adoracao:1, hinario:2, oferta:1} :
    {jubilo:1, adoracao:1, hinario:1, oferta:1};

  // Count already selected by category
  const categoryCounts={jubilo:0,adoracao:0,hinario:0,oferta:0};
  selected.forEach(id=>{
    const s=allSongs.find(x=>x.id===id);
    if(s&&categoryCounts[s.cat]!==undefined)categoryCounts[s.cat]++;
  });

  for(const [cat,quota] of Object.entries(quotas)){
    while(categoryCounts[cat]<quota){
      const candidates=allSongs.filter(s=>s.cat===cat&&!selected.includes(s.id)&&!recentSongs.has(s.id));
      if(!candidates.length){
        const fallback = allSongs.filter(s=>s.cat===cat&&!selected.includes(s.id));
        if(!fallback.length) break;
        const song=fallback[Math.floor(Math.random()*fallback.length)];
        selected.push(song.id);
      } else {
        const song=candidates[Math.floor(Math.random()*candidates.length)];
        selected.push(song.id);
      }
      categoryCounts[cat]++;
    }
  }

  if(santaCeiaSong && !selected.includes(santaCeiaSong)) {
    selected.push(santaCeiaSong);
  }

  // Ordenar o Setlist conforme layout desejado:
  // Júbilo (1), Hinário (2), Adoração (3), Oferta (4), Pedidos (5), Santa Ceia (6)
  const catOrder = { 'jubilo': 1, 'hinario': 2, 'adoracao': 3, 'oferta': 4, 'ceia': 6 };
  selected.sort((a,b) => {
    const sa = allSongs.find(x=>x.id===a);
    const sb = allSongs.find(x=>x.id===b);
    const getOrder = (sid, song) => {
      if(sid === santaCeiaSong || song?.cat === 'ceia') return 6;
      if(requestedSongs.includes(sid)) return 5;
      return catOrder[song?.cat] || 99;
    };
    return getOrder(a, sa) - getOrder(b, sb);
  });

  return selected;
}



/* ─── SVG ICONS ─────────────────────────────────────────────── */
const IcoHome    = ({s=22})=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>;
const IcoMusic   = ({s=22})=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>;
const IcoCal     = ({s=22})=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
const IcoPeople  = ({s=22})=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>;
const IcoSpark   = ({s=22})=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>;
const IcoBell    = ({s=20})=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>;
const IcoChevL   = ({s=18})=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>;
const IcoTrash   = ({s=16})=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>;
const IcoGuitar  = ({s=16})=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11.11 8.89L4 16l-1 3 3-1 7.11-7.11"/><path d="M14 7l3-3 1 1-3 3"/><circle cx="14.5" cy="9.5" r="2.5"/></svg>;
const IcoMural   = ({s=22})=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M7 7h10M7 11h8M7 15h5"/></svg>;
const IcoMic     = ({s=22})=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 1 3 3v7a3 3 0 0 1-6 0V4a3 3 0 0 1 3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><path d="M12 19v4"/><path d="M8 23h8"/></svg>;
const IcoEdit    = ({s=14})=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>;
const IcoBook    = ({s=14})=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>;
const IcoLogout  = ({s=16})=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>;
const IcoBox     = ({s=22})=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>;

/* ─── ATOMS ─────────────────────────────────────────────────── */
const Ava = memo(({m,size=36,ring=false})=><div style={{width:size,height:size,borderRadius:'50%',background:m.color,color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:size*.32,fontWeight:900,flexShrink:0,border:ring?'2.5px solid rgba(255,255,255,.9)':`${size>30?2:1.5}px solid rgba(255,255,255,.8)`,boxShadow:`0 2px 10px ${m.color}50`}}>{m.avatar}</div>);
const Bdg = ({cat})=>{
  const sCat = (cat && typeof cat === 'string') ? cat : '';
  const c = CAT[sCat] || { cls: '', label: sCat || 'Sem Cat.' };
  return <span className={`bdg ${c.cls}`} style={!CAT[sCat]?{background:'rgba(0,0,0,.05)',color:'#64748B',border:'1px solid rgba(0,0,0,.1)'}:{}}>{String(c.label)}</span>;
};
const Loader = ()=><div style={{width:20,height:20,borderRadius:'50%',border:'2.5px solid rgba(123,63,242,.2)',borderTopColor:'#7B3FF2',animation:'spin .7s linear infinite'}}/>;
const Skeleton = ({dark, h=60, count=3}) => <div style={{display:'flex', flexDirection:'column', gap:10, padding:16}}>{Array.from({length:count}).map((_,i) => <div key={i} style={{height:h, borderRadius:'var(--r-md)', background:dark?'rgba(255,255,255,.05)':'rgba(0,0,0,.04)', animation:'pulse 1.5s infinite ease-in-out', animationDelay:`${i*0.15}s`}}/>)}</div>;
const Sec = ({t})=><div style={{fontSize:'var(--fs-xs)',fontWeight:900,color:'#FF6B35',letterSpacing:'.14em',textTransform:'uppercase',margin:'18px 0 6px',display:'flex',alignItems:'center',gap:6}}><div style={{width:16,height:1.5,background:'#FF6B35',opacity:.5}}/>{t}<div style={{flex:1,height:1.5,background:'#FF6B35',opacity:.5}}/></div>;
const EmptyState = ({icon,title,sub,cta,onCta})=><div style={{textAlign:'center',padding:'48px 20px',display:'flex',flexDirection:'column',alignItems:'center',gap:12}}><div style={{fontSize:40,opacity:.35}}>{icon}</div><div style={{fontWeight:800,fontSize:'var(--fs-lg)',opacity:.5}}>{title}</div>{sub&&<div style={{fontSize:'var(--fs-sm)',opacity:.35,maxWidth:220}}>{sub}</div>}{cta&&<button onClick={onCta} style={{marginTop:4,padding:'10px 22px',borderRadius:'var(--r-full)',border:'none',background:'#4F46E5',color:'#fff',fontWeight:700,fontSize:'var(--fs-sm)',cursor:'pointer'}}>{cta}</button>}</div>;
const ConfirmDialog = ({dark, title, msg, onConfirm, onCancel, isAlert}) => (
  <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,.6)', zIndex:999, display:'flex', alignItems:'center', justifyContent:'center', padding:20, backdropFilter:'blur(8px)'}}>
    <div className={`aUp ${dark?'gL2':'gL0'}`} style={{width:'100%', maxWidth:340, padding:24, borderRadius:'var(--r-xl)', background:dark?'rgba(15,23,42,.95)':'rgba(255,255,255,.95)'}}>
       <div className="font-serif" style={{fontSize:22, fontWeight:900, marginBottom:8, color:dark?'#F1F5F9':'#0F172A'}}>{title}</div>
       <div style={{fontSize:'var(--fs-sm)', color:dark?'#C9C3DD':'#475569', marginBottom:24, lineHeight:1.5}}>{msg}</div>
       <div style={{display:'flex', gap:10}}>
         {!isAlert&&<button onClick={()=>{vib();if(onCancel)onCancel();}} style={{flex:1, padding:'10px', borderRadius:'var(--r-full)', border:'none', background:dark?'rgba(255,255,255,.1)':'rgba(0,0,0,.05)', color:dark?'#F5F2FF':'#0F172A', fontWeight:700, cursor:'pointer'}}>Cancelar</button>}
         <button onClick={()=>{vib();onConfirm();}} style={{flex:1, padding:'10px', borderRadius:'var(--r-full)', border:'none', background:'#4F46E5', color:'#fff', fontWeight:800, cursor:'pointer'}}>OK</button>
       </div>
    </div>
  </div>
);

/* ─── LYRIC VIEW ────────────────────────────────────────────── */
const LyricView = memo(({text,baseKey='C',st=0,mode='chords',dark,fs=17,fontFam,chordColor})=>{
  const color=dark?'#F5F2FF':'#1E293B';
  return <div style={{fontFamily:fontFam||"'Nunito',sans-serif"}}>{renderChordText(text,baseKey,st).split('\n').map((line,index)=>{
    if(!line.trim())return <div key={index} style={{height:12}}/>;
    if(/^\[?(Verso|Coro|Refrão|Pré-Refrão|Pré-Coro|Ponte|Intro|Final|Outro|Bridge)(?:[\s:]*\d*)?\]?$/i.test(line.trim()))return <Sec key={index} t={line.replace(/[[\]]/g,'')}/>;
    return <div key={index} style={{fontSize:fs,lineHeight:1.7,color,marginBottom:6,whiteSpace:'pre-wrap'}}>{parseLine(line).map((segment,i)=>mode==='lyrics'?segment.ly:<span key={i} style={{display:'inline-flex',flexDirection:'column',verticalAlign:'bottom',whiteSpace:'pre-wrap',minWidth:segment.ch?'1.5em':undefined}}>{segment.ch&&<b style={{fontSize:Math.max(12,fs-2),color:chordColor||(dark?'#C4A7FF':'#7B3FF2'),fontFamily:'monospace',lineHeight:1.4}}>{segment.ch}</b>}<span>{segment.ly||' '}</span></span>)}</div>;
  })}</div>;
});

/* ─── BIBLIA ────────────────────────────────────────────────── */
const BIBLE_PLANS = [
  { id: 'fe', title: 'Aumentando a Fé', icon: '⛰️', verses: [{b:'hebrews',c:11,v:'1'}, {b:'romans',c:10,v:'17'}, {b:'mark',c:9,v:'23'}] },
  { id: 'perdao', title: 'Perdão e Graça', icon: '🤍', verses: [{b:'1 john',c:1,v:'9'}, {b:'matthew',c:6,v:'14'}, {b:'colossians',c:3,v:'13'}] },
  { id: 'paz', title: 'Paz Constante', icon: '🕊️', verses: [{b:'john',c:14,v:'27'}, {b:'philippians',c:4,v:'7'}, {b:'romans',c:5,v:'1'}] },
  { id: 'ansiedade', title: 'Vencendo a Ansiedade', icon: '🍃', verses: [{b:'1 peter',c:5,v:'7'}, {b:'matthew',c:6,v:'34'}, {b:'psalms',c:94,v:'19'}] },
  { id: 'forca', title: 'Força e Coragem', icon: '🛡️', verses: [{b:'isaiah',c:41,v:'10'}, {b:'philippians',c:4,v:'13'}, {b:'psalms',c:46,v:'1'}] }
];

export const Biblia = ({dark,profileId})=><Bible key={profileId} profileId={profileId} dark={dark} books={BIBLE_BOOKS} plans={BIBLE_PLANS}/>;

/* ─── CAROUSEL HELPER ───────────────────────────────────────── */
const ContentCarousel = memo(({content, dark}) => {
  const tc=dark?'#F5F2FF':'#0F172A', t2=dark?'#C9C3DD':'#475569';
  const gc='gL1', CS={borderRadius:'var(--r-xl)',padding:20,marginBottom:16};

  return <div style={{display:'flex', gap:14, overflowX:'auto', scrollSnapType:'x mandatory', paddingBottom:10, scrollbarWidth:'none'}} className="hide-scroll">
    {content.map((c, i) => (
      <div key={i} className={`${gc} aUp`} style={{...CS, flexShrink:0, width:'85%', scrollSnapAlign:'center', padding: c.type==='video'||c.type==='podcast'?12:20, minHeight: 280, display:'flex', flexDirection:'column'}}>
        <span style={{display:'inline-block',fontSize:'var(--fs-xs)',fontWeight:800,padding:'3px 10px',borderRadius:100,marginBottom:10,background:'rgba(245,158,11,.1)',color:"var(--app-warning, #D97706)",border:'1px solid rgba(245,158,11,.2)', alignSelf:'flex-start'}}>{c.theme || c.cat}</span>
        <div className="font-serif" style={{fontSize:18,fontWeight:900,color:tc,lineHeight:1.2,marginBottom:4}}>{c.title}</div>

        {c.type === 'text' && <>
          {c.author && <div style={{fontSize:'var(--fs-xs)',color:t2,marginBottom:12,fontStyle:'italic'}}>Reflexão - {c.author}</div>}
          <div style={{fontSize:'var(--fs-sm)',lineHeight:1.7,color:tc,flex:1}}>{c.text}</div>
        </>}

        {c.type === 'podcast' && <>
          {c.desc && <div style={{fontSize:'var(--fs-xs)',color:t2,marginBottom:12}}>{c.desc}</div>}
          <iframe style={{borderRadius: '12px', flex:1}} src={`https://open.spotify.com/embed/${c.embedType||'episode'}/${c.spotifyId || c.id}?utm_source=generator`} width="100%" height="152" frameBorder="0" allowFullScreen="" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>
        </>}

        {c.type === 'video' && <>
          {c.desc && <div style={{fontSize:'var(--fs-xs)',color:t2,marginBottom:12}}>{c.desc}</div>}
          <div style={{borderRadius:'var(--r-lg)',overflow:'hidden',aspectRatio:'16/9', flex:1}}>
            <iframe width="100%" height="100%" src={`https://www.youtube.com/embed/${c.ytId || c.id}`} title={c.title} frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen></iframe>
          </div>
        </>}
      </div>
    ))}
  </div>;
});

/* ─── DEVOCIONAL ────────────────────────────────────────────── */
const Devocional = memo(({dark})=>{
  const tc=dark?'#F5F2FF':'#0F172A';
  const gc='gL1', CS={borderRadius:'var(--r-xl)',padding:20,marginBottom:16};

  const content = [
    { type: 'podcast', title: 'O coração do Ministro', theme: 'Liderança', desc: 'Podcast JesusCopy - Refletindo sobre a verdadeira adoração e os perigos de buscar os holofotes.', spotifyId: '5bU5h2C3N4957pE5FjUa7P', embedType: 'show' },
    { type: 'text', title: 'Comunidade: Onde a Graça Opera', theme: 'Comunhão', author: 'Baseado em John Wesley', text: 'A fé cristã é essencialmente social. Quando nos reunimos para ensaiar, estamos praticando a disciplina do amor mútuo. As discordâncias no tom da música ou no volume da bateria são oportunidades para exercer a paciência e suportar uns aos outros em amor. A adoração perfeita não vem de notas executadas sem erro, mas de corações unidos em uma única voz.'},
    { type: 'video', title: 'A Essência da Adoração', theme: 'Devocional', desc: 'Ministração Nívea Soares', ytId: 'WNnFmy-cqzg' },
    { type: 'text', title: 'O Altar Não É Palco', theme: 'Postura', author: 'C.S. Lewis', text: 'O louvor não existe para nos entreter, mas para completar a nossa alegria em Deus. Quando estamos no altar, devemos ser como janelas: as pessoas não devem olhar PARA nós, mas sim ATRAVÉS de nós, para verem a Cristo.'},
    { type: 'video', title: 'Como fluir no louvor', theme: 'Devocional', desc: 'Dicas práticas de adoração', ytId: 'BEkStuKw5Ow' }
  ];

  return <div className="app-page">
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}} className="aUp">
      <div style={{fontSize:'var(--fs-xl)',fontWeight:900,color:tc,letterSpacing:'-.02em',display:'flex',alignItems:'center',gap:8}}><IcoBook s={20}/>Devocional</div>
    </div>

    <div className={`${gc} aUp`} style={{...CS, background:'linear-gradient(135deg,rgba(79,70,229,.1),rgba(236,72,153,.05))',border:'1px solid rgba(79,70,229,.15)'}}>
      <div style={{fontSize:'var(--fs-sm)',fontWeight:800,color:'var(--app-link, #4F46E5)',textTransform:'uppercase',letterSpacing:'.1em',marginBottom:6}}>Cuidado Pastoral</div>
      <div style={{fontSize:'var(--fs-base)',fontWeight:600,color:tc,lineHeight:1.6}}>Recursos selecionados para a sua edificação espiritual antes de ministrar aos outros.</div>
    </div>

    <ContentCarousel content={content} dark={dark}/>
  </div>;
});

/* ─── TREINAMENTO ───────────────────────────────────────────── */
const Treinamento = memo(({dark, profile})=>{

  const isVocal = profile?.role === 'Vocal' || profile?.instrument?.toLowerCase().includes('vocal') || profile?.instrument?.toLowerCase().includes('voz');

  const content = isVocal ? [
    { type: 'video', title: 'Técnica de Respiração e Apoio', id: 'OH5sKfBDjW8', cat: 'Técnica Vocal' },
    { type: 'text', title: 'O Papel do Backing Vocal', cat: 'Dica Prática', text: 'O backing vocal não está ali para competir com a voz principal. O seu papel é "fazer a cama", preencher os espaços vazios e fortalecer a melodia. Muitas vezes, menos é mais. Aprenda a ouvir seus colegas de naipe antes de soltar a própria voz.' },
    { type: 'podcast', title: 'Afinação e Saúde Vocal', id: '5bU5h2C3N4957pE5FjUa7P', embedType: 'show', cat: 'Saúde' },
    { type: 'video', title: 'Divisão de Vozes e Harmonia', id: 'TuBeo5f-RZU', cat: 'Harmonia' },
    { type: 'text', title: 'Aquecimento Rápido', cat: 'Dica Prática', text: 'Sempre reserve 10 minutos antes do ensaio para fazer trinados de lábio (brrr) e sirenes. Isso aumenta o fluxo sanguíneo nas pregas vocais e previne lesões durante o culto.' }
  ] : [
    { type: 'video', title: 'Entendendo Bússola e Tempo', id: 'BEkStuKw5Ow', cat: 'Rítmica' },
    { type: 'text', title: 'Tocando de Ouvido', cat: 'Teoria Musical', text: 'Não seja escravo da cifra! Comece a decorar as sequências de acordes de músicas que seguem o padrão I - IV - V - vi. Quando você foca apenas em ler a cifra na tela, perde a conexão com a banda e com o Espírito durante o culto.' },
    { type: 'podcast', title: 'Dinâmica de Banda', id: '5bU5h2C3N4957pE5FjUa7P', embedType: 'show', cat: 'Podcast' },
    { type: 'video', title: 'Campo Harmônico Simplificado', id: 'wWU1Bn6wy9o', cat: 'Teoria Musical' },
    { type: 'text', title: 'Volume não é Qualidade', cat: 'Dica Prática', text: 'Bateristas e guitarristas: a dinâmica é a alma da música. Saibam a hora de diminuir o volume para que a igreja ouça a si mesma cantando. O volume da banda deve servir à congregação, não encobri-la.' }
  ];

  return <PracticalTraining dark={dark} profile={profile}>
    <ContentCarousel content={content.map(item=>({...item,theme:item.cat,ytId:item.type==='video'?item.id:undefined,spotifyId:item.type==='podcast'?item.id:undefined}))} dark={dark}/>
    <ChromaticTuner/>
  </PracticalTraining>;
});
/* ─── DASHBOARD ADMIN ───────────────────────────────────────── */
const AdminDashboard = memo(({pastEvents, members, songs = [], dark, tc, t2, gc, CS}) => {
  const chartPoints = useMemo(() => {
    const evs = pastEvents.slice(0, 5).reverse();
    if (evs.length === 0) {
      return [
        { label: 'Sem dados', rate: 0 },
        { label: 'Sem dados', rate: 0 }
      ];
    }
    return evs.map(ev => {
      const confs = ev.confirmations || {};
      const confirmed = Object.values(confs).filter(v => v === true).length;
      const total = ev.members?.length || 1;
      const rate = Math.round((confirmed / total) * 100);
      const day = ev.date?.split('-')[2] || '00';
      const mName = ev.label?.split(' ')[0] || 'Culto';
      return { label: `${mName} ${day}`, rate };
    });
  }, [pastEvents]);

  const ranking = useMemo(() => {
    const counts = {};
    pastEvents.forEach(ev => {
      (ev.members || []).forEach(mId => {
        counts[mId] = (counts[mId] || 0) + 1;
      });
    });
    return Object.entries(counts)
      .map(([mId, count]) => {
        const m = members.find(x => x.id === mId);
        return { name: m ? m.name.split(' ')[0] : 'Membro', count };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [pastEvents, members]);

  // 📊 Cálculo de Faltas e Presenças dos Membros
  const memberStats = useMemo(() => {
    const stats = {};
    members.forEach(m => {
      stats[m.id] = { name: m.name, instrument: m.instrument, color: m.color || '#7B3FF2', presence: 0, absence: 0, pending: 0, scaled: 0 };
    });
    pastEvents.forEach(ev => {
      const confs = ev.confirmations || {};
      (ev.members || []).forEach(mId => {
        if (stats[mId]) {
          stats[mId].scaled += 1;
          if (confs[mId] === true) {
            stats[mId].presence += 1;
          } else if (confs[mId] === false) {
            stats[mId].absence += 1;
          } else {
            stats[mId].pending += 1;
          }
        }
      });
    });
    return Object.values(stats)
      .sort((a, b) => b.absence - a.absence || b.scaled - a.scaled)
      .slice(0, 8);
  }, [pastEvents, members]);

  // 📊 Cálculo de Repetição de Músicas
  const songStats = useMemo(() => {
    const counts = {};
    pastEvents.forEach(ev => {
      (ev.songs || []).forEach(songId => {
        counts[songId] = (counts[songId] || 0) + 1;
      });
    });
    return Object.entries(counts)
      .map(([songId, count]) => {
        const s = songs.find(x => x.id === songId);
        return {
          title: s ? s.title : 'Música Removida',
          artist: s ? s.artist || 'Ministério' : 'Desconhecido',
          category: s ? s.cat || 'adoracao' : 'adoracao',
          count
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [pastEvents, songs]);

  const width = 320;
  const height = 120;
  const paddingX = 40;
  const paddingY = 20;
  const chartW = width - paddingX * 2;
  const chartH = height - paddingY * 2;

  const pointsSVG = useMemo(() => {
    if (chartPoints.length < 2) return [];
    return chartPoints.map((pt, i) => {
      const x = paddingX + (i * (chartW / (chartPoints.length - 1)));
      const y = paddingY + chartH - (pt.rate * (chartH / 100));
      return { x, y, rate: pt.rate, label: pt.label };
    });
  }, [chartPoints, chartW, chartH]);

  const pathD = useMemo(() => {
    if (!pointsSVG || pointsSVG.length < 2) return '';
    return pointsSVG.reduce((acc, pt, i) => {
      return acc + `${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.y} `;
    }, '');
  }, [pointsSVG]);

  const areaD = useMemo(() => {
    if (!pointsSVG || pointsSVG.length < 2) return '';
    const last = pointsSVG[pointsSVG.length - 1];
    const first = pointsSVG[0];
    return `${pathD} L ${last.x} ${paddingY + chartH} L ${first.x} ${paddingY + chartH} Z`;
  }, [pointsSVG, pathD, chartH]);

  // 💾 Função para exportar CSV de Faltas
  const exportAbsencesCSV = () => {
    vib();
    const headers = ['Membro', 'Instrumento', 'Escalas', 'Presencas', 'Faltas (Recusou)', 'Pendente'];
    const rows = memberStats.map(m => [m.name, m.instrument, m.scaled, m.presence, m.absence, m.pending]);
    const csvContent = "data:text/csv;charset=utf-8,\uFEFF"
      + [headers.join(','), ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))].join('\n');
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", `relatorio_faltas_membros_${today()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 💾 Função para exportar CSV de Músicas
  const exportSongsCSV = () => {
    vib();
    const headers = ['Musica', 'Artista', 'Categoria', 'Quantidade de Vezes Tocada'];
    const rows = songStats.map(s => [s.title, s.artist, s.category, s.count]);
    const csvContent = "data:text/csv;charset=utf-8,\uFEFF"
      + [headers.join(','), ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))].join('\n');
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", `repeticao_musicas_${today()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return <div className="aUp" id="print-dashboard">
    <div style={{display:'flex', gap:10, marginBottom:16}} className="no-print">
      <button onClick={() => window.print()} className="bp" style={{flex:1, padding:11, fontSize:'var(--fs-xs)'}}>🖨️ Exportar PDF / Imprimir Relatório</button>
    </div>

    {/* ── Bloco 1: Gráfico de Engajamento ── */}
    <div className={gc} style={CS}>
      <div style={{fontSize:'var(--fs-sm)',fontWeight:800,color:tc,marginBottom:12}}>Engajamento nos Últimos Cultos</div>
      <div style={{position:'relative', width:'100%', height:height, display:'flex', justifyContent:'center'}}>
        <svg viewBox={`0 0 ${width} ${height}`} style={{width:'100%', height:'100%', display:'block'}}>
          <defs>
            <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4F46E5" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#4F46E5" stopOpacity="0.0" />
            </linearGradient>
          </defs>
          {[0, 25, 50, 75, 100].map(val => {
            const y = paddingY + chartH - (val * (chartH / 100));
            return <g key={val}>
              <line x1={paddingX} y1={y} x2={width - paddingX} y2={y} stroke={dark?'rgba(255,255,255,.05)':'rgba(0,0,0,.04)'} strokeWidth="1" />
              <text x={paddingX - 10} y={y + 3} fill={t2} fontSize="8" fontWeight="700" textAnchor="end">{val}%</text>
            </g>;
          })}
          {areaD && <path d={areaD} fill="url(#chartGrad)" />}
          {pathD && <path d={pathD} fill="none" stroke="#4F46E5" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}
          {pointsSVG && pointsSVG.map((pt, i) => (
            <g key={i}>
              <circle cx={pt.x} cy={pt.y} r="4" fill="#4F46E5" stroke={dark?'#0F0524':'#FFF'} strokeWidth="1.5" />
              <text x={pt.x} y={pt.y - 8} fill={tc} fontSize="8" fontWeight="800" textAnchor="middle">{pt.rate}%</text>
              <text x={pt.x} y={height - 2} fill={t2} fontSize="7" fontWeight="700" textAnchor="middle">{pt.label}</text>
            </g>
          ))}
        </svg>
      </div>
    </div>

    {/* ── Bloco 2: Gráfico de Faltas/Ausências de Membros ── */}
    <div className={gc} style={CS}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12}}>
        <div style={{fontSize:'var(--fs-sm)',fontWeight:800,color:tc}}>Relatório de Faltas por Membro (Top 8)</div>
        <button onClick={exportAbsencesCSV} className="no-print" style={{padding:'4px 10px', borderRadius:100, border:'none', background:'rgba(239,68,68,0.12)', color:'var(--app-danger, #EF4444)', fontSize:10, fontWeight:800, cursor:'pointer'}}>💾 CSV</button>
      </div>
      {memberStats.filter(m => m.scaled > 0).length === 0 ? (
        <div style={{fontSize:'var(--fs-xs)',color:t2,fontStyle:'italic',textAlign:'center',padding:10}}>Nenhum registro de falta encontrado...</div>
      ) : (
        <div style={{display:'flex', flexDirection:'column', gap:10}}>
          {memberStats.map((item, idx) => {
            const total = item.scaled || 1;
            const presenceRate = Math.round((item.presence / total) * 100);
            const absenceRate = Math.round((item.absence / total) * 100);
            const pendingRate = Math.round((item.pending / total) * 100);

            return <div key={idx} style={{display:'flex', flexDirection:'column', gap:4}}>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                <div style={{fontSize:'var(--fs-xs)', fontWeight:800, color:tc}}>{item.name} <span style={{fontSize:10, fontWeight:500, color:t2}}>({item.instrument})</span></div>
                <div style={{fontSize:10, fontWeight:800, color:'var(--app-danger, #EF4444)'}}>{item.absence} Faltas / {item.scaled} Escalas</div>
              </div>
              <div style={{height:10, background:dark?'rgba(255,255,255,.05)':'rgba(0,0,0,.04)', borderRadius:100, overflow:'hidden', display:'flex'}}>
                {item.presence > 0 && <div style={{width: `${presenceRate}%`, background:'#10B981'}} title={`Presenças: ${item.presence}`} />}
                {item.pending > 0 && <div style={{width: `${pendingRate}%`, background:'#F59E0B'}} title={`Pendentes: ${item.pending}`} />}
                {item.absence > 0 && <div style={{width: `${absenceRate}%`, background:'#EF4444'}} title={`Faltas: ${item.absence}`} />}
              </div>
              <div style={{display:'flex', gap:10, fontSize:9, fontWeight:700, color:t2}}>
                <span style={{display:'flex', alignItems:'center', gap:3}}><span style={{width:6, height:6, background:'#10B981', borderRadius:'50%'}} /> Presenças: {item.presence}</span>
                <span style={{display:'flex', alignItems:'center', gap:3}}><span style={{width:6, height:6, background:'#EF4444', borderRadius:'50%'}} /> Recusados/Faltas: {item.absence}</span>
                {item.pending > 0 && <span style={{display:'flex', alignItems:'center', gap:3}}><span style={{width:6, height:6, background:'#F59E0B', borderRadius:'50%'}} /> Sem Resposta: {item.pending}</span>}
              </div>
            </div>;
          })}
        </div>
      )}
    </div>

    {/* ── Bloco 3: Repetição de Músicas (Top 10) ── */}
    <div className={gc} style={CS}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12}}>
        <div style={{fontSize:'var(--fs-sm)',fontWeight:800,color:tc}}>Músicas Mais Tocadas (Top 10)</div>
        <button onClick={exportSongsCSV} className="no-print" style={{padding:'4px 10px', borderRadius:100, border:'none', background:'rgba(79,70,229,0.12)', color:'var(--app-link, #4F46E5)', fontSize:10, fontWeight:800, cursor:'pointer'}}>💾 CSV</button>
      </div>
      {songStats.length === 0 ? (
        <div style={{fontSize:'var(--fs-xs)',color:t2,fontStyle:'italic',textAlign:'center',padding:10}}>Nenhuma música tocada recentemente...</div>
      ) : (
        <div style={{display:'flex', flexDirection:'column', gap:10}}>
          {songStats.map((item, idx) => {
            const maxVal = songStats[0]?.count || 1;
            const barW = Math.round((item.count / maxVal) * 70) + 10;
            const catColor = CAT[item.category]?.color || '#7B3FF2';
            return <div key={idx} style={{display:'flex', flexDirection:'column', gap:2}}>
              <div style={{display:'flex', justifyContent:'space-between', fontSize:'var(--fs-xs)'}}>
                <div style={{fontWeight:800, color:tc, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1}}>{item.title} <span style={{fontSize:9, fontWeight:500, color:t2}}>· {item.artist}</span></div>
                <div style={{fontWeight:800, color:'#7B3FF2', marginLeft:10}}>{item.count}x</div>
              </div>
              <div style={{display:'flex', alignItems:'center', gap:8}}>
                <div style={{width:6, height:6, borderRadius:'50%', background:catColor}} />
                <div style={{flex:1, height:10, background:dark?'rgba(255,255,255,.05)':'rgba(0,0,0,.04)', borderRadius:5, overflow:'hidden'}}>
                  <div style={{width:`${barW}%`, height:'100%', background:`linear-gradient(90deg, #7B3FF2, #EC4899)`, borderRadius:5}} />
                </div>
              </div>
            </div>;
          })}
        </div>
      )}
    </div>

    {/* ── Bloco 4: Ranking Geral de Escalas ── */}
    <div className={gc} style={CS}>
      <div style={{fontSize:'var(--fs-sm)',fontWeight:800,color:tc,marginBottom:12}}>Ranking de Escalas (Membros Ativos)</div>
      {ranking.length === 0 ? (
        <div style={{fontSize:'var(--fs-xs)',color:t2,fontStyle:'italic',textAlign:'center',padding:10}}>Sem dados de ministração suficientes...</div>
      ) : (
        <div style={{display:'flex', flexDirection:'column', gap:10}}>
          {ranking.map((item, idx) => {
            const maxVal = ranking[0]?.count || 1;
            const barW = Math.round((item.count / maxVal) * 60) + 15;
            return <div key={idx} style={{display:'flex', alignItems:'center', gap:12}}>
              <div style={{width:65, fontSize:'var(--fs-xs)', fontWeight:700, color:tc, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{item.name}</div>
              <div style={{flex:1, height:12, background:dark?'rgba(255,255,255,.05)':'rgba(0,0,0,.04)', borderRadius:6, overflow:'hidden'}}>
                <div style={{width:`${barW}%`, height:'100%', background:'linear-gradient(90deg,#4F46E5,#818CF8)', borderRadius:6}} />
              </div>
              <div style={{width:25, fontSize:'var(--fs-xs)', fontWeight:800, color:'var(--app-link, #4F46E5)', textAlign:'right'}}>{item.count}x</div>
            </div>;
          })}
        </div>
      )}
    </div>
  </div>;
});

/* ─── PATRIMÔNIO SCREEN ─────────────────────────────────────── */
const PatrimonioScreen = memo(({members, profile, dark, embedded = false}) => {
  const [equipment, setEquipment] = useState(()=>cacheRead('equipment:'+profile.id,[]));
  const [loading, setLoading] = useState(true);
  const isAdm = !!profile?.is_admin;

  // Carrega e sincroniza com o banco de dados Supabase em tempo real!
  useEffect(() => {
    async function loadEquipment() {
      if (!supabase || !connectionAvailable()) {
        // Fallback local se o Supabase não estiver conectado
        const stored = JSON.stringify(cacheRead('equipment:'+profile.id,[]));
        if (stored) {
          try { setEquipment(JSON.parse(stored)); } catch {/* preserve existing local state */}
        } else {
          setEquipment([
            { id: 'eq_1', name: 'Microfone sem fio SM58', brand: 'Shure', status: 'Disponível', custodian_id: null, serial_number: 'SN-SHURE-581' },
            { id: 'eq_2', name: 'Violão Eletroacústico', brand: 'Tanglewood', status: 'Em uso', custodian_id: (members || [])[0]?.id || null, serial_number: 'SN-TANG-202' },
            { id: 'eq_3', name: 'Mesa de Som UI24R', brand: 'Soundcraft', status: 'Disponível', custodian_id: null, serial_number: 'SN-SOUND-24' }
          ]);
        }
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const { data, error } = await supabase.from('equipment').select('*');
        if (!error && data) {
          if (data.length === 0) {
            // Inicializar dados padrão se o banco estiver vazio
            const defaults = [
              { id: 'eq_1', name: 'Microfone sem fio SM58', brand: 'Shure', status: 'Disponível', custodian_id: null, serial_number: 'SN-SHURE-581' },
              { id: 'eq_2', name: 'Violão Eletroacústico', brand: 'Tanglewood', status: 'Em uso', custodian_id: (members || [])[0]?.id || null, serial_number: 'SN-TANG-202' },
              { id: 'eq_3', name: 'Mesa de Som UI24R', brand: 'Soundcraft', status: 'Disponível', custodian_id: null, serial_number: 'SN-SOUND-24' }
            ];
            await supabase.from('equipment').upsert(defaults);
            setEquipment(defaults);
          } else {
            let local=data;for(const job of jobsFor(profile.id)){if(job.type==='equipment')local=local.some(row=>row.id===job.data.id)?local.map(row=>row.id===job.data.id?job.data:row):[...local,job.data];if(job.type==='delete_equipment')local=local.filter(row=>row.id!==job.data.id);}setEquipment(local);
          }
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }

    loadEquipment();
    const resume=()=>void loadEquipment();window.addEventListener('louvesync:synced',resume);window.addEventListener('louvesync:connected',resume);

    if (!supabase) return;
    const channel = supabase.channel(`equipment_realtime_${Math.random().toString(36).substring(7)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'equipment' }, () => {
         loadEquipment();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);window.removeEventListener('louvesync:synced',resume);window.removeEventListener('louvesync:connected',resume);
    };
  }, [members,profile.id]);

  // Salva no localStorage como backup local
  useEffect(() => {
    if (equipment.length > 0) {
      cacheWrite('equipment:'+profile.id,equipment);
    }
  }, [equipment,profile.id]);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [editItem, setEditItem] = useState(null);

  const filtered = useMemo(() => {
    return equipment.filter(eq => {
      const matchSearch = (eq.name || '').toLowerCase().includes(search.toLowerCase()) || (eq.brand || '').toLowerCase().includes(search.toLowerCase());
      const matchFilter = statusFilter === 'all' || eq.status === statusFilter;
      return matchSearch && matchFilter;
    });
  }, [equipment, search, statusFilter]);

  const handleSave = async item => {
    if (!isAdm) throw new Error('Acesso exclusivo do administrador.');
    const payload = {id:item.id,name:item.name,brand:item.brand||'',status:item.status,custodian_id:item.custodian_id||null,serial_number:item.serial_number||''};
    await offlineAction('equipment',payload,async()=>{if(supabase){const {error}=await supabase.from('equipment').upsert(payload);if(error)throw error;}},{pendingOffline:true});
    setEquipment(previous=>previous.some(row=>row.id===payload.id)?previous.map(row=>row.id===payload.id?{...row,...payload}:row):[...previous,payload]);
    setEditItem(null);
  };

  const handleDelete = async id => {
    if (!isAdm) throw new Error('Acesso exclusivo do administrador.');
    if (!window.confirm('Tem certeza que deseja excluir este equipamento?')) return;
    await offlineAction('delete_equipment',{id},async()=>{if(supabase){const {error}=await supabase.from('equipment').delete().eq('id',id);if(error)throw error;}},{pendingOffline:true});
    setEquipment(previous=>previous.filter(row=>row.id!==id));
    setEditItem(null);
  };

  return <>
    <EquipmentInventory dark={dark} equipment={equipment} items={filtered} members={members} loading={loading}
      search={search} onSearchChange={setSearch} statusFilter={statusFilter} onStatusChange={setStatusFilter}
      isAdmin={isAdm} embedded={embedded} onEdit={item=>setEditItem({...item})}
      onAdd={()=>setEditItem({id:'eq_'+Date.now(),name:'',brand:'',status:'Disponível',custodian_id:null,serial_number:''})}/>
    {isAdm&&editItem&&<EquipmentEditor key={editItem.id} dark={dark} item={editItem} members={members} isNew={!equipment.some(row=>row.id===editItem.id)} onSave={handleSave} onDelete={()=>handleDelete(editItem.id)} onClose={()=>setEditItem(null)}/>}
  </>;
});

/* ─── PAINEL ADMIN ──────────────────────────────────────────── */
const PainelAdmin = memo(({dark, events, members, profile, songs, setSongs, setConfirmState, setMembers, activity, onUpdateOwnPin, onNavTo})=>{
  const tc=dark?'#F5F2FF':'#0F172A', t2=dark?'#C9C3DD':'#475569';
  const gc='gL1', CS={borderRadius:'var(--r-xl)',padding:20,marginBottom:16};

  const pendingDeletes = songs?.filter(s => s.delete_requested_by) || [];

  const handleApproveDelete = async (songId) => {
    setConfirmState({
      title: 'Aprovar Exclusão',
      msg: 'Aprovar e EXCLUIR definitivamente esta música?',
      onConfirm: async () => {
        try{await dbDelSong(songId,activity.credentials);setSongs(s=>s.filter(x=>x.id!==songId));await broadcastUpdate({type:'data_changed'});}catch(error){alert(`Não foi possível excluir: ${error.message}`);}
        setConfirmState(null);
      },
      onCancel: () => setConfirmState(null)
    });
  };

  const [editMember, setEditMember] = useState(null);

  const saveMember = async member => {
    const newMember = {...member};
    // Garante UUID válido para novos membros
    if (!newMember.id || String(newMember.id).startsWith('new_')) {
      newMember.id = crypto.randomUUID();
    }
    // Preserve the existing database contract. Keep the form open if this write
    // fails, and update the list only after the save succeeds.
    const { confirmRate, ...dbMember } = newMember;
    const saved = await upsertMember(dbMember);
    if(!saved?._pendingOffline&&member.id===profile.id&&dbMember.pin)await onUpdateOwnPin(dbMember.pin,saved);
    const record = normalizeMember(publicMember({...newMember,...saved}));
    setMembers(list => list.some(item => item.id === record.id) ? list.map(item => item.id === record.id ? record : item) : [...list,record]);
    setEditMember(null);await broadcastUpdate({type:'data_changed'});
  };

  const delMember = (id) => {
    setConfirmState({
      title: 'Excluir Membro',
      msg: 'Excluir permanentemente este membro?',
      onConfirm: async () => {
        setMembers(mList => mList.filter(m => m.id !== id));
        setConfirmState(null);
        try {
          await deleteMember(id);
        } catch (e) {
          console.error('Failed to delete member:', e);
        }
      },
      onCancel: () => setConfirmState(null)
    });
  };

  const handleRejectDelete = async (songId) => {
    setSongs(s=>s.map(x=>x.id===songId?{...x, delete_requested_by:null}:x));
    rejectDeleteSong(songId).catch(console.error);
  };

  const [adminTab, setAdminTab] = useState('geral'); // 'geral'|'dashboard'|'patrimonio'

  const [featSong, setFeatSong] = useState(songs?.find(s=>s.featured_week)?.id || '');
  const [featNote, setFeatNote] = useState(songs?.find(s=>s.featured_week)?.featured_note || '');

  const saveFeaturedSong = async () => {
    try {
      setSongs(prev => prev.map(s => s.id === featSong ? {...s, featured_week: true, featured_note: featNote} : {...s, featured_week: false, featured_note: null}));
      const saved=await offlineAction('featured_song',{id:featSong,note:featNote},async()=>{if (supabase) {
        const {error}=await supabase.from('songs').update({ featured_week: false, featured_note: null }).eq('featured_week', true);if(error)throw error;
        if (featSong) {
          await supabase.from('songs').update({ featured_week: true, featured_note: featNote }).eq('id', featSong);
        }
      }
      },{pendingOffline:true});
      alert(saved?.pendingOffline?'Música da semana salva no aparelho. Aguardando sincronização.':'✅ Música da Semana atualizada com sucesso!');
    } catch(e) {
      console.error(e);
      alert('Erro ao salvar Música da Semana.');
    }
  };

  if(!profile?.is_admin) return <div style={{padding:40,textAlign:'center',color:t2}}>Acesso Restrito</div>;

  // KPIs
  const pastEvents = events.filter(e => e.date < new Date().toLocaleDateString('sv-SE'));
  const avgAttendance = pastEvents.length ? Math.round(pastEvents.reduce((acc, ev) => {
     const confirmed = Object.values(ev.confirmations).filter(v => v === true).length;
     const total = ev.members.length || 1;
     return acc + (confirmed / total * 100);
  }, 0) / pastEvents.length) : 0;

  return <div className="app-page">
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}} className="aUp">
      <div style={{fontSize:'var(--fs-xl)',fontWeight:900,color:tc,letterSpacing:'-.02em',display:'flex',alignItems:'center',gap:8}}><IcoPeople s={20}/>Painel Admin</div>
    </div>

    <ActivityMonitor activity={activity} members={members} dark={dark}/>
    {/* Admin tabs */}
    <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:16}} className="aUp">
      {[['geral','⚙️ Geral'],['dashboard','📊 Dashboard'],['patrimonio','🏛️ Patrimônio'],['comunidade','Comunidade da igreja']].map(([k,l])=>
        <button key={k} onClick={()=>setAdminTab(k)} style={{padding:'7px 14px',borderRadius:100,border:'none',cursor:'pointer',fontSize:'var(--fs-xs)',fontWeight:700,background:adminTab===k?'#4F46E5':'rgba(79,70,229,.08)',color:adminTab===k?'#fff':'var(--app-link, #4F46E5)'}}>{l}</button>
      )}
    </div>

    {adminTab === 'comunidade' && <ChurchAdmin dark={dark} credentials={activity.credentials} onOpenSchedule={()=>onNavTo('escala')}/>}
    {adminTab === 'geral' && <>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16}} className="aUp">
        <div className={gc} style={{padding:16,borderRadius:'var(--r-lg)',textAlign:'center'}}>
           <div style={{fontSize:28,fontWeight:900,color:'#10B981'}}>{avgAttendance}%</div>
           <div style={{fontSize:'var(--fs-xs)',color:t2,fontWeight:700,textTransform:'uppercase'}}>Engajamento Médio</div>
        </div>
        <div className={gc} style={{padding:16,borderRadius:'var(--r-lg)',textAlign:'center'}}>
           <div style={{fontSize:28,fontWeight:900,color:'var(--app-link, #4F46E5)'}}>{pastEvents.length}</div>
           <div style={{fontSize:'var(--fs-xs)',color:t2,fontWeight:700,textTransform:'uppercase'}}>Ministrações</div>
        </div>
      </div>

    {pendingDeletes.length > 0 && <div className={`${gc} aUp`} style={{...CS, border:'1px solid rgba(239,68,68,.2)'}}>
       <div style={{fontSize:'var(--fs-sm)',fontWeight:800,color:'var(--app-danger, #EF4444)',marginBottom:10,textTransform:'uppercase'}}>Solicitações de Exclusão (Músicas)</div>
       <div style={{display:'flex',flexDirection:'column',gap:10}}>
         {pendingDeletes.map(s => {
            const reqBy = members.find(m => m.id === s.delete_requested_by)?.name || 'Usuário';
            return <div key={s.id} style={{padding:12, background:'rgba(239,68,68,.05)', borderRadius:'var(--r-md)', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
               <div>
                  <div style={{fontWeight:800,color:tc}}>{s.title}</div>
                  <div style={{fontSize:'var(--fs-xs)',color:t2}}>Pedida por: {reqBy}</div>
               </div>
               <div style={{display:'flex',gap:6}}>
                  <button onClick={()=>handleRejectDelete(s.id)} style={{padding:'6px 12px',borderRadius:100,border:'1px solid rgba(239,68,68,.3)',background:'transparent',color:'var(--app-danger, #EF4444)',fontWeight:700,fontSize:'var(--fs-xs)',cursor:'pointer'}}>Recusar</button>
                  <button onClick={()=>handleApproveDelete(s.id)} style={{padding:'6px 12px',borderRadius:100,border:'none',background:'#EF4444',color:'#fff',fontWeight:700,fontSize:'var(--fs-xs)',cursor:'pointer'}}>Aprovar (Excluir)</button>
               </div>
            </div>
         })}
       </div>
    </div>}

    {events?.filter(e => e.delete_requested_by).length > 0 && <div className={`${gc} aUp`} style={{...CS, border:'1px solid rgba(239,68,68,.2)'}}>
       <div style={{fontSize:'var(--fs-sm)',fontWeight:800,color:'var(--app-danger, #EF4444)',marginBottom:10,textTransform:'uppercase'}}>Solicitações de Exclusão (Eventos)</div>
       <div style={{display:'flex',flexDirection:'column',gap:10}}>
         {events.filter(e => e.delete_requested_by).map(ev => {
            const reqBy = members.find(m => m.id === ev.delete_requested_by)?.name || 'Usuário';
            return <div key={ev.id} style={{padding:12, background:'rgba(239,68,68,.05)', borderRadius:'var(--r-md)', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
               <div>
                  <div style={{fontWeight:800,color:tc}}>{ev.label}</div>
                  <div style={{fontSize:'var(--fs-xs)',color:t2}}>Data: {ev.date} · {ev.time}</div>
                  <div style={{fontSize:'var(--fs-xs)',color:t2}}>Pedida por: {reqBy}</div>
               </div>
               <div style={{display:'flex',gap:6}}>
                  <button onClick={()=>{
                     rejectDeleteEvent(ev.id).catch(console.error);
                  }} style={{padding:'6px 12px',borderRadius:100,border:'1px solid rgba(239,68,68,.3)',background:'transparent',color:'var(--app-danger, #EF4444)',fontWeight:700,fontSize:'var(--fs-xs)',cursor:'pointer'}}>Recusar</button>
                  <button onClick={()=>{
                     setConfirmState({
                       title: 'Aprovar Exclusão',
                       msg: `Aprovar e EXCLUIR definitivamente o evento "${ev.label}"?`,
                       onConfirm: async () => {
                         try{await dbDelEvent(ev.id,activity.credentials);await broadcastUpdate({type:'data_changed'});}catch(error){alert(`Não foi possível excluir: ${error.message}`);}
                         setConfirmState(null);
                       },
                       onCancel: () => setConfirmState(null)
                     });
                  }} style={{padding:'6px 12px',borderRadius:100,border:'none',background:'#EF4444',color:'#fff',fontWeight:700,fontSize:'var(--fs-xs)',cursor:'pointer'}}>Aprovar (Excluir)</button>
               </div>
            </div>
         })}
       </div>
    </div>}

    <div className={`${gc} aUp`} style={CS}>
       <div style={{fontSize:'var(--fs-sm)',fontWeight:800,color:tc,marginBottom:12}}>Comprometimento (Últimos Eventos)</div>
       {members.filter(m=>m.status==='ativo').slice(0,5).map(m=>{
          const myEvs = pastEvents.filter(e => (e.members||[]).includes(m.id));
          const presences = myEvs.filter(e => (e.confirmations||{})[m.id] === true).length;
          const rate = myEvs.length ? Math.round(presences/myEvs.length*100) : 0;
          return <div key={m.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10,padding:'6px 0',borderBottom:`1px solid ${dark?'rgba(255,255,255,.05)':'rgba(0,0,0,.05)'}`}}>
             <div style={{display:'flex',alignItems:'center',gap:10}}>
               <Ava m={m} size={28}/>
               <span style={{fontSize:'var(--fs-sm)',fontWeight:700,color:tc}}>{m.name.split(' ')[0]}</span>
             </div>
             <div style={{fontSize:'var(--fs-sm)',fontWeight:800,color:rate>70?'#10B981':rate>40?'#F59E0B':'var(--app-danger, #EF4444)'}}>{rate}%</div>
          </div>
       })}
    </div>

    <div className={`${gc} aUp`} style={CS}>
       <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
         <div style={{fontSize:'var(--fs-sm)',fontWeight:800,color:tc}}>Gerenciar Membros</div>
         <button aria-label="Adicionar membro" onClick={()=>setEditMember({id:crypto.randomUUID(), name:'', pin:'', role:'Membro', instrument:'', is_admin:false, status:'ativo', permissions:null, unavailableDays:[], scheduleEnabled:true, color: '#4F46E5', avatar: 'NM'})} style={{padding:'6px 12px',borderRadius:100,border:'none',background:'#10B981',color:'#fff',fontWeight:700,fontSize:'var(--fs-xs)',cursor:'pointer'}}>+ Novo membro</button>
       </div>
       {members.map(m => (
         <div key={m.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10,padding:'6px 0',borderBottom:`1px solid ${dark?'rgba(255,255,255,.05)':'rgba(0,0,0,.05)'}`}}>
             <div style={{display:'flex',alignItems:'center',gap:10}}>
               <Ava m={m} size={28}/>
               <div style={{display:'flex',flexDirection:'column'}}>
                 <span style={{fontSize:'var(--fs-sm)',fontWeight:700,color:tc}}>{m.name}</span>
                 <span style={{fontSize:'var(--fs-xs)',color:t2}}>{m.instrument} {m.is_admin ? '(Admin)' : ''}</span>
               </div>
             </div>
             <button aria-label={'Editar '+m.name} onClick={()=>setEditMember({...m})} style={{padding:'6px 12px',borderRadius:100,border:'none',background:'rgba(79,70,229,.1)',color:'var(--app-link, #4F46E5)',fontWeight:700,fontSize:'var(--fs-xs)',cursor:'pointer'}}>Editar</button>
         </div>
       ))}
    </div>

    <div className={`${gc} aUp`} style={CS}>
       <div style={{fontSize:'var(--fs-sm)',fontWeight:800,color:tc,marginBottom:12}}>Músicas Adicionadas (Mês Atual)</div>
       <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
          {Object.entries(CAT).map(([id, c]) => {
             const cnt = songs.filter(s => {
               if(s.cat !== id) return false;
               if(!s.created_at) return false;
               const createdMonth = new Date(s.created_at).getMonth();
               const currentMonth = new Date().getMonth();
               return createdMonth === currentMonth;
             }).length;
             return <div key={id} style={{background:`rgba(${id==='adoracao'?'79,70,229':id==='jubilo'?'16,185,129':id==='hinario'?'245,158,11':'236,72,153'},.1)`, border:`1px solid rgba(${id==='adoracao'?'79,70,229':id==='jubilo'?'16,185,129':id==='hinario'?'245,158,11':'236,72,153'},.2)`, borderRadius:'var(--r-md)', padding:'10px 14px', flex:'1 1 40%', display:'flex', alignItems:'center', justifyContent:'space-between'}}>
                <span style={{fontSize:'var(--fs-xs)',fontWeight:700,color:readableTextColor(c.color,dark),textTransform:'uppercase'}}>{c.label}</span>
                <span style={{fontSize:20,fontWeight:900,color:tc}}>{cnt}</span>
             </div>
          })}
       </div>
    </div>

    {/* ── Música da Semana (Foco de Estudo) ── */}
    <div className={`${gc} aUp`} style={CS}>
       <div style={{fontSize:'var(--fs-sm)',fontWeight:800,color:tc,marginBottom:12,display:'flex',alignItems:'center',gap:6}}>
         📌 Configurar Música da Semana (Estudo)
       </div>
       <div style={{fontSize:'var(--fs-xs)',color:t2,marginBottom:10,lineHeight:1.4}}>
         Escolha a música que receberá a marcação especial de estudo na tela de Início de todos os membros.
       </div>
       <div className="gIn" style={{marginBottom:10}}>
         <select
           className="fi"
           value={featSong}
           onChange={e=>setFeatSong(e.target.value)}
           style={{color:tc,padding:'10px',background:'transparent',border:'none',outline:'none',fontSize:'var(--fs-sm)'}}
         >
           <option value="">-- Selecione uma música --</option>
           {songs.map(s => <option key={s.id} value={s.id}>{s.title} ({s.artist})</option>)}
         </select>
       </div>
       <div className="gIn" style={{marginBottom:14}}>
         <input
           className="fi"
           value={featNote}
           onChange={e=>setFeatNote(e.target.value)}
           placeholder="Observação para estudo (ex: Foco nas transições)"
           style={{color:tc}}
         />
       </div>
       <button className="bp" onClick={saveFeaturedSong} style={{padding:'10px',fontSize:'var(--fs-sm)',width:'100%',fontWeight:800}}>
         Salvar Música da Semana
       </button>
    </div>

    {editMember && <MemberEditor dark={dark} member={editMember} isNew={!members.some(member=>member.id===editMember.id)} canDelete={members.some(member=>member.id===editMember.id)&&editMember.id!==profile.id} onSave={saveMember} onClose={()=>setEditMember(null)} onDelete={()=>{setEditMember(null);delMember(editMember.id);}}/>}

    {/* ── QR Code de Convite ── */}
    <div className={`${gc} aUp`} style={CS}>
      <div style={{fontSize:'var(--fs-sm)',fontWeight:800,color:tc,marginBottom:12,display:'flex',alignItems:'center',gap:6}}>
        <IcoShare s={14}/>QR Code — Convite para o App
      </div>
      <div style={{display:'flex',gap:12,alignItems:'center'}}>
        <img
          src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(window.location.origin)}&color=4F46E5&bgcolor=F8FAFC`}
          alt="QR Code do app"
          style={{borderRadius:'var(--r-md)',width:100,height:100,flexShrink:0}}
        />
        <div>
          <div style={{fontSize:'var(--fs-xs)',color:t2,marginBottom:6,lineHeight:1.5}}>Mostre este QR Code para novos membros escanearem com a câmera do celular. Eles chegarão direto na tela de login do app.</div>
          <div style={{fontSize:'var(--fs-xs)',fontWeight:800,color:'var(--app-link, #4F46E5)',background:'rgba(79,70,229,.08)',padding:'5px 10px',borderRadius:'var(--r-sm)',wordBreak:'break-all'}}>{window.location.origin}</div>
        </div>
      </div>
    </div>
    </>}

    {adminTab === 'dashboard' && (
      <AdminDashboard
        pastEvents={pastEvents}
        members={members}
        songs={songs}
        dark={dark}
        tc={tc}
        t2={t2}
        gc={gc}
        CS={CS}
      />
    )}

    {adminTab === 'patrimonio' && (
      <PatrimonioScreen
        embedded
        members={members}
        profile={profile}
        dark={dark}
      />
    )}
  </div>;
});


/* ─── LOGIN SCREEN ──────────────────────────────────────────── */
const LoginScreen = memo(({members,loading,onLogin,dark,setDark,onVisitor})=>{
  const [step,setStep]=useState('select');
  const { viewportRef, controlsRef } = useLoginViewport(step==='pin');
  const pinRef = useRef(null);
  const [sel,setSel]=useState(null);
  const [pin,setPin]=useState('');
  const [err,setErr]=useState('');
  const [shake,setShake]=useState(false);
  const [signingIn,setSigningIn]=useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const tc=dark?'#F5F2FF':'#0F172A';
  const t2=dark?'#C9C3DD':'#64748B';

  useEffect(() => {
    const handler = (e) => { e.preventDefault(); setDeferredPrompt(e); };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;

  function handleInstallClick() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(() => setDeferredPrompt(null));
    } else if (isIOS && !isStandalone) {
      alert("Para instalar no iPhone/iPad: Toque no ícone de Compartilhar (quadrado com seta para cima) na barra inferior do Safari, e depois escolha 'Adicionar à Tela de Início'.");
    }
  }

  async function tryLogin(){
    if(!sel||!pin||signingIn)return;
    setSigningIn(true);setErr('');
    try{await onLogin(sel,pin);}
    catch(error){setErr(error.message||'Não foi possível entrar. Tente novamente.');pinRef.current?.focus({preventScroll:true});setShake(true);setTimeout(()=>setShake(false),500);}
    finally{setSigningIn(false);}
  }

  return <div ref={viewportRef} data-step={step} className={`ls app-login${dark?' dark':''}`} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:0}}>
    <style>{CSS}</style>
    <div className={`bg ${dark?'bg-d':'bg-l'}`}>
      <div className="orb" style={{width:400,height:400,top:-120,left:-100,background:dark?'rgba(79,70,229,.14)':'rgba(79,70,229,.22)',animation:'oA 14s ease-in-out infinite'}}/>
      <div className="orb" style={{width:300,height:300,bottom:-80,right:-60,background:dark?'rgba(16,185,129,.1)':'rgba(16,185,129,.16)',animation:'oB 17s ease-in-out infinite'}}/>
    </div>
    <div className="login-content">
      {step==='select'&&onVisitor&&<button type="button" className="login-back" style={{color:dark?'#d7b7ff':'#7544a8'}} onClick={onVisitor}><IcoChevL s={15}/>Continuar como visitante</button>}
      {/* Header */}
      <div className="login-brand">
        <img src="/brand/v2/mark-color.png" alt="LouveSync" width="100" height="100" />
        {(deferredPrompt || (isIOS && !isStandalone)) && (
          <button onClick={handleInstallClick} style={{marginTop:16,padding:'8px 16px',borderRadius:'var(--r-full)',border:'none',background:'rgba(79,70,229,.1)',color:'var(--app-link, #4F46E5)',fontSize:'var(--fs-xs)',fontWeight:800,cursor:'pointer',display:'inline-flex',alignItems:'center',gap:6}}><IcoSpark s={14}/> Instalar App</button>
        )}
      </div>

      {loading ? <div style={{display:'flex',justifyContent:'center',padding:40}}><Loader/></div> : step==='select' ? <>
        <div style={{fontSize:'var(--fs-sm)',fontWeight:700,color:t2,textAlign:'center',marginBottom:16,letterSpacing:'.06em',textTransform:'uppercase'}}>Quem é você?</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10}}>
          {members.map(m=><button key={m.id} onClick={()=>{setSel(m);setPin('');setErr('');setStep('pin');}} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:7,padding:'14px 8px',borderRadius:'var(--r-lg)',border:'none',background:dark?'rgba(255,255,255,.06)':'rgba(255,255,255,.65)',backdropFilter:'blur(12px)',cursor:'pointer',transition:'all .2s'}}
            onMouseEnter={e=>{e.currentTarget.style.transform='translateY(-2px)';e.currentTarget.style.boxShadow=`0 8px 24px ${m.color}30`;}}
            onMouseLeave={e=>{e.currentTarget.style.transform='';e.currentTarget.style.boxShadow='';}}>
            <Ava m={m} size={44}/>
            <span style={{fontSize:'var(--fs-xs)',fontWeight:700,color:tc,textAlign:'center',lineHeight:1.3}}>{m.name}</span>
            {m.is_admin&&<span style={{fontSize:8,background:'rgba(79,70,229,.12)',color:'var(--app-link, #4F46E5)',padding:'1px 6px',borderRadius:100,fontWeight:800}}>ADMIN</span>}
          </button>)}
        </div>
      </> : <>
        <button type="button" className="login-back" onClick={()=>setStep('select')} style={{color:t2}}><IcoChevL s={16}/>Voltar</button>
        <form className="gL1 login-panel" onSubmit={event=>{event.preventDefault();tryLogin();}}>
          <div className="login-member">
            <Ava m={sel} size={44} ring/>
            <div className="login-member-copy"><div className="login-member-name" style={{color:tc}}>{sel.name}</div><div className="login-member-instrument" style={{color:t2}}>{sel.instrument}</div></div>
          </div>
          <div ref={controlsRef}>
          <div className="login-field">
            <label htmlFor="login-pin" style={{color:t2}}>Senha</label>
            <div className="gIn" style={{animation:shake?'pinShake .4s ease':''}}>
              <input ref={pinRef} id="login-pin" className="fi" name="password" type="password" autoComplete="current-password" enterKeyHint="go" aria-invalid={!!err} aria-describedby={err?'login-error':undefined} value={pin} onChange={e=>{setPin(e.target.value);setErr('');}} placeholder="Digite sua senha..." style={{color:tc,letterSpacing:'.2em',fontSize:20}} autoFocus/>
            </div>
            {err&&<div id="login-error" role="alert" style={{marginTop:8,fontSize:'var(--fs-xs)',color:'var(--app-danger, #EF4444)',fontWeight:700}}>{err}</div>}
          </div>
          <button className="bp" type="submit" disabled={!pin.trim()||signingIn}>{signingIn?'Entrando…':'Entrar'}</button>
          </div>
        </form>
      </>}

      <div className="login-theme">
        <button className={`tog${dark?' on':''}`} onClick={()=>setDark(p=>!p)} style={{background:dark?'#4F46E5':'#CBD5E1'}} aria-label="Modo escuro"/>
      </div>
    </div>
  </div>;
});

/* ─── HOME ──────────────────────────────────────────────────── */
/* ─── CIFRA ─────────────────────────────────────────────────── */
const Cifra = memo(({dark,song,event,tr,setTr,mode,setMode,metronome,setStageMode,onSendAI,onNavTo,onDeleteSong,onSetSequence,onSaveVocalKey,onSaveSong,profile,members,fontFam})=>{
  const iframeRef = useRef(null);
  const [seqStr, setSeqStr] = useState(event?.sequenceBySong?.[song?.id] || '');
  const [editKey, setEditKey] = useState(String(song?.key || ''));
  const editBpm = metronome.bpm, setEditBpm = metronome.setBpm;
  const bpmDirty = editBpm !== metronome.sourceBpm;
  const [editLyrics, setEditLyrics] = useState(String(song?.lyrics || ''));
  const [isDirty, setIsDirty] = useState(false);
  const assignedVocal = event?.singerBySong?.[song?.id] || (members.some(m=>m.id===profile?.id && /vocal|voz/i.test(m.instrument||'')) ? profile.id : '');
  const [vocalChoice,setVocalChoice]=useState(null);
  const followsAssigned = !vocalChoice || vocalChoice.assigned!==assignedVocal;
  const vocalId = followsAssigned ? assignedVocal : vocalChoice.id;
  const automaticKey = followsAssigned && event ? performanceKey(song,event) : song?.vocal_keys?.[vocalId] || song?.key;
  const [saving,setSaving]=useState(false);
  const [isEditingLyrics, setIsEditingLyrics] = useState(false);

  useEffect(()=>{setVocalChoice(null);},[assignedVocal]);
  useEffect(()=>{setTr(keyDistance(song?.key,automaticKey));},[song?.key,automaticKey,setTr]);

  useEffect(() => {
    setEditKey(String(song?.key || ''));
    setEditLyrics(String(song?.lyrics || ''));
    setIsDirty(false);
  }, [song?.id, song?.key, song?.bpm, song?.lyrics]);

  const handleSaveMetadata = async () => {
    if(!song) return;
    const updated = {
      ...song,
      key: String(editKey || song.key || ''),
      bpm: String(editBpm || 0),
      lyrics: String(editLyrics || '')
    };
    setSaving(true);
    try {await onSaveSong?.(updated);setIsDirty(false);setIsEditingLyrics(false);} catch(error){console.error(error);} finally{setSaving(false);}
  };

  const markDirty = () => setIsDirty(true);

  console.log('🎵 Cifra component rendering with song:', song?.title);

  // 🦶 Pedal Bluetooth — qualquer pedal que emule PageDown/seta rola a cifra
  useEffect(() => {
    const onKey = (e) => {
      if(e.target.closest?.('input, textarea, select, [contenteditable]'))return;
      if(e.key===' ' && e.target.closest?.('button, a, [role="button"]'))return;
      const scroller=document.querySelector('[data-main-scroll]');
      if (['ArrowDown','ArrowRight','PageDown',' '].includes(e.key)) {
        e.preventDefault(); scroller?.scrollBy({top:240,behavior:'smooth'});
      } else if (['ArrowUp','ArrowLeft','PageUp'].includes(e.key)) {
        e.preventDefault(); scroller?.scrollBy({top:-240,behavior:'smooth'});
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
     if(event && song) setSeqStr(event.sequenceBySong?.[song.id] || '');
  }, [event, song]);

  if(!song){
    console.log('🎵 Cifra: song is null/undefined, returning null');
    return null;
  }

  // Coerção de tipos extremamente robusta para blindar contra campos do tipo Objeto em JSON
  const sTitle = String(song.title || 'Música Sem Título');
  const sArtist = String(song.artist || 'Ministério');
  const sKey = String(song.key || 'N/A');
  const sLyrics = String(song.lyrics || '');
  const sBpm = editBpm;
  const sTimeSignature = String(song.time_signature || '4/4');

  console.log('🎵 Cifra component initialized:', {sTitle, sArtist, sKey, sBpm, sTimeSignature, lyricsLength: sLyrics.length});

  const sendYoutubeCommand = (func, args=[]) => {
    if (iframeRef.current) {
      iframeRef.current.contentWindow.postMessage(JSON.stringify({
        event: 'command',
        func: func,
        args: args
      }), '*');
    }
  };
  const tc=dark?'#F5F2FF':'#0F172A', t2=dark?'#C9C3DD':'#475569';
  const gc='ui-card', CS={borderRadius:'var(--r-xl)',padding:17,marginBottom:12};
  const curKey=getKey(sKey,tr);


  const getEmbedUrl = (url) => {
    if(!url || typeof url !== 'string') return null;
    const cleanUrl = url.trim();
    try {
      if (/^[a-zA-Z0-9_-]{11}$/.test(cleanUrl)) {
          return `https://www.youtube.com/embed/${cleanUrl}?enablejsapi=1`;
      }
      if(cleanUrl.includes('youtube.com/shorts/')) {
          const parts = cleanUrl.split('youtube.com/shorts/');
          const v = parts[1].split('?')[0];
          return `https://www.youtube.com/embed/${v}?enablejsapi=1`;
      }
      if(cleanUrl.includes('youtube.com/watch?v=')) {
          let u = cleanUrl.startsWith('http') ? cleanUrl : 'https://'+cleanUrl;
          const v = new URLSearchParams(new URL(u).search).get('v');
          return `https://www.youtube.com/embed/${v}?enablejsapi=1`;
      }
      if(cleanUrl.includes('youtube.com/embed/')) {
          let u = cleanUrl.startsWith('http') ? cleanUrl : 'https://'+cleanUrl;
          const urlObj = new URL(u);
          urlObj.searchParams.set('enablejsapi', '1');
          return urlObj.toString();
      }
      if(cleanUrl.includes('youtu.be/')) {
          const v = cleanUrl.split('youtu.be/')[1].split('?')[0];
          return `https://www.youtube.com/embed/${v}?enablejsapi=1`;
      }
      if(cleanUrl.includes('spotify.com/track/')) return cleanUrl.replace('spotify.com/track/', 'open.spotify.com/embed/track/');
    } catch {/* preserve existing local state */}
    return null;
  };
  // Usa ytUrl como fallback quando media_url não está preenchida
  const embedUrl = getEmbedUrl(song.media_url || song.ytUrl);

  return <div className="ui-scope ui-page" data-theme={dark?'dark':'light'} data-update-blocking={isDirty||bpmDirty||isEditingLyrics||saving||metronome.active||metronome.starting}>
    {/* Key info card */}
    <div className={`${gc} aUp`} style={CS}>
      <Bdg cat={song.cat}/>
      <div className="font-serif" style={{fontSize:26,fontWeight:900,color:tc,marginTop:8,letterSpacing:'-.02em',lineHeight:1.15}}>{sTitle}</div>
      <div style={{fontSize:'var(--fs-sm)',color:t2,marginTop:3,marginBottom:16}}>{sArtist}</div>


      <div className="ui-transpose" role="group" aria-label="Transpor a cifra"><button className="ui-button ui-button-soft" aria-label="Baixar um semitom" onClick={()=>setTr(n=>n-1)}>− Tom</button><button className="ui-button ui-button-quiet" onClick={()=>setTr(0)}>Original: {sKey}</button><button className="ui-button ui-button-soft" aria-label="Subir um semitom" onClick={()=>setTr(n=>n+1)}>+ Tom</button></div>
      <div className="ui-fields">
        <label className="ui-field">Tom<select aria-label="Tom da cifra" value={curKey} onChange={e=>setTr(keyDistance(sKey,e.target.value))}>{[...new Set([...KEYS,...KEYS.map(k=>k+'m'),'Db','Eb','Gb','Ab','Bb',curKey])].map(k=><option key={k} value={k}>{k}</option>)}</select></label>
        <label className="ui-field">BPM<div className="ui-stepper"><button aria-label="Diminuir BPM" onClick={()=>{setEditBpm(Math.max(20,editBpm-1));markDirty();}}>−</button><input aria-label="BPM" type="number" min="20" max="300" value={editBpm} onChange={e=>{setEditBpm(Math.max(20,Math.min(300,parseInt(e.target.value)||80)));markDirty();}}/><button aria-label="Aumentar BPM" onClick={()=>{setEditBpm(Math.min(300,editBpm+1));markDirty();}}>+</button></div></label>
      </div>
      {tr!==0&&<p className="ui-helper">Tom atual: {curKey} · {tr>0?'+':''}{tr} semitom</p>}
      <div className="ui-vocal-key">
        <label className="ui-field">Tom por vocal<select aria-label="Vocal para o tom" value={vocalId} onChange={e=>{setVocalChoice({assigned:assignedVocal,id:e.target.value});const key=song.vocal_keys?.[e.target.value]||sKey;setTr(keyDistance(sKey,key));}}><option value="">Tom original</option>{assignedVocal===ALL_VOCALS&&<option value={ALL_VOCALS}>TODOS</option>}{members.filter(m=>(m.instrument||'').match(/vocal|voz/i)).map(m=><option value={m.id} key={m.id}>{m.name}</option>)}</select></label>
        <p className="ui-helper">A cifra acompanha o tom salvo do vocal selecionado, incluindo acordes com baixo e modulações.</p>
        {isIndividualVocal(vocalId)&&(canManageMinistry(profile)||(vocalId===profile?.id&&event?.singerBySong?.[song.id]===profile.id&&event?.members?.includes(profile.id)))&&<button className="ui-button ui-button-soft ui-button-wide" style={{marginTop:10}} onClick={()=>onSaveVocalKey(song.id,vocalId,curKey)}><Icon name="check" size={15}/>{canManageMinistry(profile)?'Salvar tom deste vocal':'Solicitar tom deste evento'}</button>}{!canManageMinistry(profile)&&<p className="ui-helper">A transposição é local. Para mudar o tom usado pela equipe, envie uma solicitação no evento em que você é o vocal principal.</p>}
      </div>
      {(isDirty||bpmDirty) && <div style={{display:'flex',gap:8,marginTop:12}}><button disabled={saving} onClick={handleSaveMetadata} className="bp" style={{flex:1,padding:'10px 14px',fontSize:'var(--fs-xs)',fontWeight:800}}>✓ Salvar</button><button onClick={()=>{setEditKey(String(song?.key||'')); setEditBpm(parseInt(song?.bpm)||80); setIsDirty(false);}} style={{flex:1,padding:'10px 14px',borderRadius:'var(--r-md)',border:`1.5px solid ${dark?'rgba(168,85,247,.2)':'rgba(79,70,229,.25)'}`,background:'transparent',color:tc,fontSize:'var(--fs-xs)',fontWeight:800,cursor:'pointer'}}>✕ Cancelar</button></div>}
    </div>

    {/* Media Player */}
    {embedUrl && <div className={`${gc} aUp`} style={{...CS, padding:0, overflow:'hidden', marginBottom:12, height: String(song.media_url||'').includes('spotify') ? 80 : 200}}>
       <iframe ref={iframeRef} src={embedUrl} width="100%" height="100%" frameBorder="0" allow="encrypted-media; picture-in-picture" allowFullScreen></iframe>
    </div>}
    {embedUrl && !String(song.media_url||'').includes('spotify') && (
      <div style={{display:'flex', gap:8, marginBottom:12}} className="aUp">
        <button onClick={() => { vib(); sendYoutubeCommand('playVideo'); }} className="bSec" style={{flex:1, padding:8, background:'rgba(16,185,129,0.08)', color:'#10B981', borderColor:'rgba(16,185,129,0.2)'}}>▶ Iniciar</button>
        <button onClick={() => { vib(); sendYoutubeCommand('pauseVideo'); }} className="bSec" style={{flex:1, padding:8, background:'rgba(239,68,68,0.08)', color:'var(--app-danger, #EF4444)', borderColor:'rgba(239,68,68,0.2)'}}>⏸ Pausar</button>
        <button onClick={() => { vib(); sendYoutubeCommand('seekTo', [0, true]); }} className="bSec" style={{flex:1, padding:8, background:'rgba(79,70,229,0.08)', color:'var(--app-link, #4F46E5)', borderColor:'rgba(79,70,229,0.2)'}}>🔄 Reiniciar</button>
      </div>
    )}

    <div className="ui-mode-buttons"><button className="ui-chip" aria-pressed={mode==='chords'} onClick={()=>setMode('chords')}>Letra e acordes</button><button className="ui-chip" aria-pressed={mode==='lyrics'} onClick={()=>setMode('lyrics')}>Somente letra</button></div>
    {/* Mode controls */}
    <div className={`${gc} aUp`} style={{...CS,animationDelay:'.1s'}}>
      <MetronomeControls metronome={metronome} action={<button className="ui-button" onClick={()=>setStageMode(true)}>Modo Palco 🖥️</button>}/>
    </div>

    {/* Sequence field if event is present */}
    {event && <div className={`${gc} aUp`} style={{...CS,animationDelay:'.12s'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
        <div style={{fontSize:'var(--fs-xs)',fontWeight:800,color:t2,textTransform:'uppercase',letterSpacing:'.1em'}}>Sequência p/ Evento</div>
        {profile?.is_admin && seqStr !== (event.sequenceBySong?.[song.id] || '') && <button onClick={()=>onSetSequence(event.id, song.id, seqStr)} style={{fontSize:'var(--fs-xs)',fontWeight:800,color:'var(--app-link, #4F46E5)',background:'rgba(79,70,229,.15)',padding:'5px 12px',borderRadius:100,border:'none',cursor:'pointer'}}>Salvar</button>}
      </div>
      <div className="gIn"><input className="fi" data-update-blocking={seqStr!==(event?.sequenceBySong?.[song.id]||'')} readOnly={!profile?.is_admin} value={seqStr} onChange={e=>setSeqStr(e.target.value)} placeholder="Ex: Intro, V1, Coro (2x), Ponte..." style={{color:tc,fontSize:'var(--fs-sm)',fontWeight:600}}/></div>
    </div>}

    {/* Lyrics */}
    <div className={`${gc} aUp`} style={{...CS,animationDelay:'.14s'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
        <div style={{fontSize:'var(--fs-xs)',fontWeight:800,color:t2,letterSpacing:'.1em',textTransform:'uppercase'}}>Letra</div>
        <button onClick={()=>{setIsEditingLyrics(!isEditingLyrics); if(!isEditingLyrics) markDirty();}} style={{fontSize:'var(--fs-xs)',fontWeight:800,padding:'6px 12px',borderRadius:'var(--r-md)',border:`1.5px solid ${isEditingLyrics?'#A855F7':'rgba(79,70,229,.25)'}`,background:isEditingLyrics?'rgba(168,85,247,.15)':'rgba(79,70,229,.08)',color:isEditingLyrics?'#A855F7':'var(--app-link, #4F46E5)',cursor:'pointer',transition:'all .2s'}}>{isEditingLyrics?'Fechar Edição':'✎ Editar'}</button>
      </div>
      {isEditingLyrics?(
        <>
          <textarea className="ui-manual-lyrics" aria-label="Editar cifra" value={editLyrics} onChange={e=>{setEditLyrics(e.target.value);markDirty();}} rows={14} placeholder="Cole ou digite a cifra aqui..." />
          <p className="ui-helper">Acordes: [G], [Em7], [D/F#]. Graus: [1], [6m7], [5/7]. Os graus acompanham o tom escolhido.</p>
          <div style={{display:'flex',gap:8,marginTop:12}}>
            <button disabled={saving} onClick={handleSaveMetadata} className="bp" style={{flex:1,padding:'10px 14px',fontSize:'var(--fs-xs)',fontWeight:800}}>✓ Salvar Letra</button>
            <button onClick={()=>{setEditLyrics(String(song?.lyrics||'')); setIsDirty(false); setIsEditingLyrics(false);}} style={{flex:1,padding:'10px 14px',borderRadius:'var(--r-md)',border:`1.5px solid ${dark?'rgba(168,85,247,.2)':'rgba(79,70,229,.25)'}`,background:'transparent',color:tc,fontSize:'var(--fs-xs)',fontWeight:800,cursor:'pointer'}}>Descartar</button>
          </div>
        </>
      ):(
        <div className="lyrics-content" style={{lineHeight:1.6,color:tc}}><LyricView text={editLyrics} baseKey={sKey} st={tr} mode={mode} dark={dark} fontFam={fontFam}/></div>
      )}
    </div>

    {/* AI button */}
    <button className="bp aUp" style={{marginBottom:8,animationDelay:'.18s'}} onClick={()=>{onSendAI(`Analise "${sTitle}" (tom ${curKey}, ${CAT[song.cat]?.label || song.cat || 'Sem Categoria'}, ${sBpm}bpm, compasso ${sTimeSignature}) e sugira 3 músicas complementares para setlist com justificativa de fluxo.`);onNavTo('ia');}}>
      <IcoSpark s={16}/>Analisar com Maestro
    </button>
    <button onClick={()=>printCifra().catch(error=>alert(error.message))} style={{width:'100%',marginBottom:8,padding:'11px',borderRadius:'var(--r-md)',border:'1px solid rgba(79,70,229,.2)',background:'rgba(79,70,229,.05)',color:'var(--app-link, #4F46E5)',fontWeight:700,fontSize:'var(--fs-sm)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
      <IcoShare s={14}/>Imprimir / Salvar PDF
    </button>
    {profile?.is_admin&&<button onClick={()=>onDeleteSong(song.id)} style={{width:'100%',marginBottom:16,padding:'11px',borderRadius:'var(--r-md)',border:'1px solid rgba(239,68,68,.22)',background:'rgba(239,68,68,.05)',color:"var(--app-negative, #DC2626)",fontWeight:700,fontSize:'var(--fs-sm)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:6}}><IcoTrash s={14}/>Excluir música</button>}
    {/* ── Div oculta usada pelo @media print ── */}
    {typeof document !== 'undefined' && createPortal(<div id="print-cifra">
      <div className="print-title">{sTitle}</div>
      <div className="print-sub">{sArtist} · Tom: {curKey} {tr!==0?`(${tr>0?'+':''}${tr} st)`:''} · {sBpm} BPM · {sTimeSignature}</div>
      <pre style={{fontFamily:'monospace',whiteSpace:'pre-wrap',fontSize:13,lineHeight:1.7}}>{renderChordText(editLyrics,sKey,tr)||'(sem letra cadastrada)'}</pre>
    </div>,document.body)}
  </div>;
});

/* ─── STAGE ─────────────────────────────────────────────────── */
const Stage = memo(({song,tr,mode,stageFs,setStageFs,dark,onClose,chordColor,setChordColor,fontFam,setFontFam,metronome})=>{
  const [autoScroll,setAutoScroll]=useState(false);
  const [showSettings,setShowSettings] = useState(false);
  const lyricsRef=useRef(null);
  const scrollTimer=useRef(null);

  useEffect(()=>{
    if(autoScroll&&lyricsRef.current){
      scrollTimer.current=setInterval(()=>{
        const el=lyricsRef.current;if(!el)return;
        el.scrollTop+=1;
        if(el.scrollTop>=el.scrollHeight-el.clientHeight-2){setAutoScroll(false);}
      },60);
    }else{clearInterval(scrollTimer.current);}
    return()=>clearInterval(scrollTimer.current);
  },[autoScroll]);

  if(!song)return null;

  const curK=getKey(song.key,tr);
  return <div data-update-blocking={true} className="stage-wrap" style={{background:dark?'#05091A':'#0A0F1E',color:'#E2E8F0',display:'flex',flexDirection:'column'}}>
    <div style={{background:dark?'rgba(5,9,26,.95)':'rgba(10,15,30,.95)',padding:'12px 16px',paddingTop:'calc(12px + var(--app-safe-top))',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0,borderBottom:'1px solid rgba(255,255,255,.07)'}}>
      <button onClick={onClose} style={{display:'flex',alignItems:'center',gap:6,padding:'7px 12px',borderRadius:'var(--r-sm)',border:'1px solid rgba(255,255,255,.14)',background:'rgba(255,255,255,.05)',color:'rgba(255,255,255,.7)',fontSize:'var(--fs-sm)',fontWeight:700,cursor:'pointer'}}><IcoChevL s={14}/>Sair</button>
      <div style={{textAlign:'center'}}><div className="font-serif" style={{fontSize:22,fontWeight:800,color:'#E2E8F0'}}>{String(song.title || 'Música Sem Título')}</div><div style={{fontSize:'var(--fs-xs)',color:'rgba(255,255,255,.4)'}}>{String(song.artist || 'Ministério')}</div></div>
      <div style={{display:'flex',gap:8,alignItems:'center'}}>
        <button onClick={()=>setAutoScroll(a=>!a)} title="Auto-scroll" style={{display:'flex',alignItems:'center',gap:4,padding:'6px 10px',borderRadius:'var(--r-sm)',border:`1px solid ${autoScroll?'rgba(16,185,129,.5)':'rgba(255,255,255,.14)'}`,background:autoScroll?'rgba(16,185,129,.18)':'rgba(255,255,255,.05)',color:autoScroll?'#10B981':'rgba(255,255,255,.7)',fontSize:'var(--fs-xs)',fontWeight:700,cursor:'pointer'}}><IcoScroll s={12}/>{autoScroll?'⏸':'▶'}</button>
        <div style={{background:'rgba(79,70,229,.22)',border:'1px solid rgba(99,102,241,.4)',borderRadius:'var(--r-sm)',padding:'5px 12px',textAlign:'center'}}>
          <div style={{fontSize:8,color:'rgba(255,255,255,.4)',letterSpacing:'.08em'}}>TOM</div>
          <div style={{fontSize:18,fontWeight:900,color:'#818CF8',fontFamily:"'JetBrains Mono',monospace",lineHeight:1}}>{curK}</div>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:3}}>
          <button onClick={()=>setStageFs(f=>Math.min(f+3,42))} style={{border:'1px solid rgba(255,255,255,.14)',background:'rgba(255,255,255,.05)',color:'#E2E8F0',fontSize:'var(--fs-sm)',borderRadius:7,padding:'3px 8px',cursor:'pointer'}}>A+</button>
          <button onClick={()=>setStageFs(f=>Math.max(f-3,14))} style={{border:'1px solid rgba(255,255,255,.14)',background:'rgba(255,255,255,.05)',color:'#E2E8F0',fontSize:'var(--fs-xs)',borderRadius:7,padding:'3px 8px',cursor:'pointer'}}>A−</button>
        </div>
      </div>
    </div>
    <div className="ui-scope ui-stage-metronome" data-theme="dark"><MetronomeControls metronome={metronome} compact/></div>
    <button className="bSec" onClick={()=>setShowSettings(value=>!value)}>Ajustes de palco</button>
    {showSettings && (
      <div style={{background:'rgba(10,15,30,.98)', padding:16, borderBottom:'1px solid rgba(255,255,255,.07)', display:'flex', flexDirection:'column', gap:10}} className="aUp">
        <div style={{fontSize:11, fontWeight:800, color:'rgba(255,255,255,.4)', textTransform:'uppercase'}}>Cor das Cifras</div>
        <div style={{display:'flex', gap:8}}>
          {[['#FF6B35','🔥 Laranja'],['#7B3FF2','💜 Roxo'],['#FFFFFF','⚪ Branco']].map(([c,l]) => (
            <button key={c} onClick={() => setChordColor(c)} style={{flex:1, padding:6, borderRadius:6, border:'none', background: chordColor === c ? 'rgba(255,255,255,.12)' : 'rgba(255,255,255,.03)', color: chordColor === c ? c : '#fff', fontWeight:700, fontSize:12, cursor:'pointer'}}>{l}</button>
          ))}
        </div>

        <div style={{fontSize:11, fontWeight:800, color:'rgba(255,255,255,.4)', textTransform:'uppercase'}}>Tipo de Fonte</div>
        <div style={{display:'flex', gap:8}}>
          {[[`'Nunito', sans-serif`,'Nunito'],[`'Montserrat',sans-serif`,'Montserrat'],[`'JetBrains Mono',monospace`,'Monospace']].map(([f,l]) => (
            <button key={l} onClick={() => setFontFam(f)} style={{flex:1, padding:6, borderRadius:6, border:'none', background: fontFam === f ? 'rgba(255,255,255,.12)' : 'rgba(255,255,255,.03)', color: '#fff', fontWeight:700, fontSize:12, cursor:'pointer', fontFamily:f}}>{l}</button>
          ))}
        </div>
      </div>
    )}
    <div ref={lyricsRef} style={{flex:1,overflowY:'auto',padding:'16px 18px',paddingBottom:'calc(48px + var(--app-safe-bottom))',scrollBehavior:'smooth'}}><LyricView text={song.lyrics||''} baseKey={song.key} st={tr} mode={mode} dark={true} fs={stageFs} chordColor={chordColor} fontFam={fontFam}/></div>
  </div>;
});

/* ─── MEMBROS ─── */
const Membros = memo(({profile,dark,members,events,selRole,setSelRole})=>{
  const tc=dark?'#F5F2FF':'#0F172A', t2=dark?'#C9C3DD':'#475569';
  const gc='gL1', CS={borderRadius:'var(--r-xl)',padding:17,marginBottom:12};
  const roles=[...new Set(members.map(m=>m.instrument))].filter(Boolean);
  const filtered=selRole==='Todos'?members:members.filter(m=>m.instrument===selRole);

  return <div className="app-page">
    <div style={{fontSize:'var(--fs-xl)',fontWeight:900,color:tc,marginBottom:14,letterSpacing:'-.02em',display:'flex',alignItems:'center',gap:8}} className="aUp"><IcoPeople s={20}/>Membros</div>
    <div style={{display:'flex',gap:8,overflowX:'auto',marginBottom:14,paddingBottom:2}} className="aUp">
      {['Todos',...roles].map(r=><button key={r} onClick={()=>setSelRole(r)} style={{flexShrink:0,padding:'7px 14px',borderRadius:100,border:'none',cursor:'pointer',background:selRole===r?'#4F46E5':dark?'rgba(255,255,255,.08)':'rgba(79,70,229,.07)',color:selRole===r?'#fff':tc,fontSize:'var(--fs-sm)',fontWeight:700,transition:'all .2s'}}>{r}</button>)}
    </div>
    {filtered.length===0&&<EmptyState icon={<IcoPeople s={32}/>} title="Nenhum membro nesse filtro"/>}

    {/* Member list — 1 column */}
    <div style={{display:'flex',flexDirection:'column',gap:10,marginBottom:18}}>
      {filtered.map((m,i)=>{
        const cCount=events.filter(e=>(e.members||[]).includes(m.id)&&e.type==='culto').length;
        return <div key={m.id} className={`${gc} aUp`} style={{borderRadius:'var(--r-xl)',padding:'14px 16px',animationDelay:`${i*.04}s`,opacity:m.status==='licença'?.7:1,display:'flex',alignItems:'center',gap:14}}>
          <div style={{position:'relative',flexShrink:0}}>
            <Ava m={m} size={52} ring/>
            <div style={{position:'absolute',bottom:0,right:0,width:13,height:13,borderRadius:'50%',background:m.status==='ativo'?'#10B981':'#94A3B8',border:'2px solid white'}}/>
          </div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
              <div style={{fontSize:'var(--fs-base)',fontWeight:800,color:tc,lineHeight:1.4}}>
                {m.name} <br/> <span style={{fontWeight:400, fontSize:'var(--fs-sm)'}}>{m.instrument}</span>
              </div>
              {m.is_admin&&<span style={{fontSize:8,background:'rgba(79,70,229,.12)',color:'var(--app-link, #4F46E5)',padding:'1px 6px',borderRadius:100,fontWeight:800,alignSelf:'flex-start'}}>ADMIN</span>}
              {m.status==='licença'&&<span style={{fontSize:'var(--fs-xs)',color:'#94A3B8',background:'rgba(148,163,184,.1)',padding:'1px 8px',borderRadius:100,fontWeight:700,alignSelf:'flex-start'}}>Em licença</span>}
            </div>
          </div>
          {profile?.is_admin&&<div style={{display:'flex',gap:8,flexShrink:0}}>
            <div style={{textAlign:'center'}}>
              <div style={{fontSize:'var(--fs-lg)',fontWeight:900,color:'var(--app-link, #4F46E5)',lineHeight:1}}>{m.confirmRate||cCount*10||'—'}{m.confirmRate?'%':''}</div>
              <div style={{fontSize:8,color:t2,fontWeight:700}}>PRES.</div>
            </div>
            <div style={{textAlign:'center'}}>
              <div style={{fontSize:'var(--fs-lg)',fontWeight:900,color:'#10B981',lineHeight:1}}>{cCount}</div>
              <div style={{fontSize:8,color:t2,fontWeight:700}}>CULTOS</div>
            </div>
          </div>}
        </div>;
      })}
    </div>

    {/* Team stats — admin only */}
    {profile?.is_admin&&<div className={`${gc} aUp`} style={CS}>
      <div style={{fontSize:'var(--fs-xs)',fontWeight:800,color:t2,textTransform:'uppercase',letterSpacing:'.1em',marginBottom:12}}>Estatísticas da Equipe</div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10}}>
        {[{l:'Membros Ativos',v:members.filter(m=>m.status==='ativo').length,c:'#10B981'},{l:'Instrumentos',v:[...new Set(members.map(m=>m.instrument))].filter(Boolean).length,c:'#F59E0B'},{l:'Total Eventos',v:events.length,c:'#4F46E5'}].map(s=>
          <div key={s.l} style={{textAlign:'center',padding:'11px 6px',borderRadius:'var(--r-sm)',background:dark?'rgba(255,255,255,.04)':'rgba(0,0,0,.03)'}}>
            <div style={{fontSize:19,fontWeight:900,color:readableTextColor(s.c,dark),lineHeight:1}}>{s.v}</div>
            <div style={{fontSize:8,color:t2,marginTop:3,fontWeight:700}}>{s.l}</div>
          </div>)}
      </div>
    </div>}
  </div>;
});

/* ─── MAESTRO (IA) ──────────────────────────────────────────── */
/* ─── ADD SONG OVERLAY ──────────────────────────────────────── */
const AddSong = memo(({dark,onSave,onClose,initialData,requestApproval,credentials})=>{
  const [step,setStep]=useState(initialData ? 3 : 1);
  const [form,setForm]=useState(initialData ? {...initialData,title:initialData.title||'',lyrics:initialData.lyrics||'',rawLyrics:''} : {title:'',artist:'',cat:'adoracao',key:'C',bpm:'80',timeSignature:'4/4',lyrics:'',tags:'',rawLyrics:'',sequence:'',media_url:''});
  const [candidates,setCandidates]=useState([]);
  const [searchLoading,setSearchLoading]=useState(false);
  const [selLoading,setSelLoading]=useState(false);
  const [genLoad,setGenLoad]=useState(false);
  const [saving,setSaving]=useState(false);
  const [saveError,setSaveError]=useState('');
  const [showPaste,setShowPaste]=useState(false);
  const tapTimes=useRef([]);


  function tapTempo(){
    try{const AC=window.AudioContext||window.webkitAudioContext;if(AC){const c=new AC();const o=c.createOscillator();const g=c.createGain();o.connect(g);g.connect(c.destination);o.frequency.value=1100;g.gain.setValueAtTime(0.22,c.currentTime);g.gain.exponentialRampToValueAtTime(0.001,c.currentTime+0.055);o.start(c.currentTime);o.stop(c.currentTime+0.055);setTimeout(()=>c.close(),250);}}catch{/* optional capability unavailable */}
    const now=Date.now();
    tapTimes.current=[...tapTimes.current.slice(-7),now];
    if(tapTimes.current.length>=2){
      const intervals=tapTimes.current.slice(1).map((t,i)=>t-tapTimes.current[i]);
      const avg=intervals.reduce((a,b)=>a+b,0)/intervals.length;
      const bpm=Math.round(60000/avg);
      if(bpm>=40&&bpm<=250)setForm(f=>({...f,bpm:String(bpm)}));
    }
  }

  function tryClose(){
    if(form.lyrics.trim() !== (initialData?.lyrics || "").trim() || (!initialData && form.title.trim())){
      // To simplify, we keep window.confirm for local draft discard.
      if(!window.confirm('Descartar rascunho?'))return;
    }
    onClose();
  }

  /* ── Start search when leaving step 1 ── */
  function goToSearch(){
    if(!form.title)return;
    setStep(2);
    setCandidates([]);
    setSearchLoading(true);
    setShowPaste(false);
    searchSongCandidates(form.title,form.artist)
      .then(r=>{setCandidates(r);setSearchLoading(false);})
      .catch(()=>setSearchLoading(false));
  }

  /* ── User tapped a candidate ── */
  async function selectCandidate(c){
    setSelLoading(true);
    let full=c;
    try {
      if(!c.text&&c.url){
        if (c.source === 'CifraClub' || c.source === 'Cifras.com.br') { // Keep compat with old source if somehow passed
          const fetched = await fetchCifraClubContent(c.url);
          if (fetched) {
            full = {...c, ...fetched};
            setForm(f => ({...f, key: fetched.key || 'C'}));
          } else {
            alert('Falha ao baixar cifra completa. A conexão foi bloqueada.');
            setSelLoading(false); return;
          }
        }
      }

      if (full.source === 'CifraClub') {
         setForm(f=>({...f,lyrics:full.text}));
         setStep(3);
      } else {
         await runAIFormat(full);
      }
    } catch(e) {
      console.error(e);
      alert('Erro inesperado ao processar a música.');
    } finally {
      setSelLoading(false);
    }
  }

  /* ── User pasted lyrics manually ── */
  function usePasted(){setForm(f=>({...f,lyrics:f.rawLyrics}));setStep(3);}

  /* ── Core AI formatting function ── */
  async function runAIFormat(scraped){
    setGenLoad(true);
    let userPrompt;
    const sText = scraped?.text || '';
    const seqInst = form.sequence ? `\nAPLIQUE ESTA SEQUÊNCIA ESTRUTURAL À MÚSICA: ${form.sequence}\n(Repita as seções conforme a sequência acima).` : '';

    if(!scraped || !scraped.hasCifra){
      userPrompt=`Apenas formate a seguinte letra de "${form.title}" de ${form.artist||'Ministério'}. Organize em Verso/Coro/Ponte. NÃO adicione nenhum acorde, não use colchetes, apenas entregue a letra limpa e estruturada.${seqInst}\n\nTEXTO:\n${sText.slice(0,2500) || form.rawLyrics.slice(0,2500)}`;
    }else{
      userPrompt=`Você receberá uma cifra onde os acordes JÁ ESTÃO na mesma linha da letra, perfeitamente sincronizados no formato [Acorde]Palavra.
Sua ÚNICA tarefa é identificar as partes da música e adicionar os cabeçalhos (Verso 1, Coro, Ponte).
${seqInst}
MANTENHA OS ACORDES ORIGINAIS EXATAMENTE COMO ESTÃO. Não adicione novos acordes. Não mude a posição de nenhum acorde. Retorne APENAS o texto puro sem markdown.\n\nCIFRA BRUTA:\n${sText.slice(0,3500)}`;
    }
    try{
      const lyric=await maestroRequest(credentials,[{role:'system',content:'Especialista em cifras gospel brasileiras. Preserve os acordes e a letra enviados; use [Acorde]Palavra em texto puro. Não invente cifras. Se não houver informação suficiente, explique a limitação. Aceite apenas música cristã/religiosa.'},{role:'user',content:userPrompt}],{purpose:'chart',maxTokens:1300});
      if(lyric?.pendingOffline){alert('Pedido de formatação salvo. A resposta do Maestro ficará disponível após a conexão voltar.');setForm(f=>({...f,lyrics:sText||form.rawLyrics}));setStep(3);return;}
      if(lyric.includes('ERRO: O LouveSync aceita apenas músicas de cunho religioso/gospel')) {
        alert(lyric);
      } else {
        setForm(f=>({...f,lyrics: lyric || sText || form.rawLyrics}));
        setStep(3);
      }
    }catch(e){
      console.error(e);
      alert('A IA não pôde formatar a cifra. Usando texto bruto.');
      setForm(f=>({...f,lyrics: sText || form.rawLyrics}));
      setStep(3);
    }
    finally { setGenLoad(false); }
  }

  async function save(){
    if(saving||!form.title.trim()||!form.lyrics.trim())return;
    const songId = form.id || crypto.randomUUID();
    setSaving(true);setSaveError('');
    try {await onSave({id:songId,title:form.title.trim(),artist:form.artist?.trim()||'Ministério',cat:form.cat,key:form.key,bpm:parseInt(form.bpm)||80,time_signature:form.timeSignature||form.time_signature||'4/4',lyrics:form.lyrics,tags:(Array.isArray(form.tags)?form.tags.join(','):form.tags||'').split(',').map(t=>t.trim()).filter(Boolean),media_url:form.media_url});}catch(error){setSaveError(error.message);}finally{setSaving(false);}
  }

  const busy=selLoading||genLoad;
  const title = initialData ? 'Editar Música' : 'Nova Música';
  const update = (key,value) => setForm(previous=>({...previous,[key]:value}));
  const titleValid = Boolean(form.title.trim());
  const lyricsValid = Boolean(form.lyrics.trim());
  const canSave = titleValid && lyricsValid;
  const formBusy = saving || busy || searchLoading;
  const songFields = <div className="song-editor-fields">
    <label className="ui-field">Título<input value={form.title} onChange={e=>update('title',e.target.value)} placeholder="Título da música *" required/></label>
    <label className="ui-field">Artista ou ministério<input value={form.artist || ''} onChange={e=>update('artist',e.target.value)} placeholder="Artista / Ministério"/></label>
  </div>;

  return <Dialog dark={dark} title={title} className="song-editor" eyebrow="Repertório" icon="music" closeLabel="Fechar cadastro de música"
    onClose={tryClose} busy={formBusy} contentKey={step}
    footer={<>
      {saveError && <p className="ui-message ui-error" role="alert">{saveError}</p>}
      <div className="ui-dialog-buttons">
        {step===1 ? <>
          <button type="button" className="ui-button" onClick={()=>setStep(3)}>Digitar cifra manualmente</button>
          <button type="button" className="ui-button ui-button-primary" onClick={goToSearch} disabled={!titleValid}><Icon name="search" size={16}/>Buscar música</button>
        </> : <button type="button" className="ui-button" disabled={formBusy} onClick={()=>setStep(1)}><Icon name="left" size={16}/>Voltar para detalhes</button>}
      {step===3 && <button type="submit" form="song-editor-form" className="ui-button ui-button-primary" disabled={!canSave||saving}><Icon name="check" size={16}/>{saving?'Salvando…':requestApproval?'Enviar para aprovação':initialData?'Salvar Alterações':'Salvar Música'}</button>}
      </div>
    </>}>
    {step===1 && <div className="song-editor-sections">
      <Section icon="music" title="Dados da música">
        {songFields}
        <label className="ui-field">Categoria<select value={form.cat} onChange={e=>update('cat',e.target.value)}>{Object.entries(CAT).map(([id,category])=><option value={id} key={id}>{category.label}</option>)}</select></label>
      </Section>
      <Section icon="sound" title="Tom e ritmo">
        <div className="song-editor-grid">
          <label className="ui-field">Tom original<select value={form.key} disabled={requestApproval&&!!initialData} onChange={e=>update('key',e.target.value)}>{[...new Set([form.key,...KEYS,...KEYS.map(key=>key+'m')].filter(Boolean))].map(key=><option key={key}>{key}</option>)}</select></label>
          <label className="ui-field">Compasso<select value={form.timeSignature||form.time_signature||'4/4'} onChange={e=>update('timeSignature',e.target.value)}>{TIME_SIGS.map(signature=><option key={signature}>{signature}</option>)}</select></label>
        </div>
        <div className="song-editor-tempo">
          <label className="ui-field">BPM<input type="number" min="20" max="300" value={form.bpm} onChange={e=>update('bpm',e.target.value)}/></label>
          <button type="button" className="ui-button" onClick={tapTempo}><IcoTap s={16}/>Marcar ritmo</button>
        </div>
      </Section>
      <details className="song-editor-extra"><summary>Tags e sequência musical</summary>
        <label className="ui-field">Tags<input value={form.tags || ''} onChange={e=>update('tags',e.target.value)} placeholder="Separe por vírgulas"/></label>
        <label className="ui-field">Sequência musical<input value={form.sequence || ''} onChange={e=>update('sequence',e.target.value)} placeholder="Intro, verso, refrão…"/></label>
      </details>
    </div>}
    {step===2 && <div className="song-editor-sections">
      <h3>Escolher versão</h3>
      {searchLoading ? <p role="status">Buscando {form.title}…</p> : candidates.length ? <div className="song-search-results">{candidates.map(candidate=>
        <button type="button" key={candidate.id} className="ui-button" disabled={busy} onClick={()=>selectCandidate(candidate)}>
          <span><strong>{candidate.title}</strong><small>{candidate.artist} · {candidate.source}{candidate.hasCifra?' · Com acordes':' · Letra'}</small></span><Icon name="right" size={17}/>
        </button>)}</div> : <p>Nenhuma versão encontrada. Confira o título ou digite a cifra.</p>}
      {busy && <p role="status">{selLoading?'Carregando cifra…':'Formatando cifra…'}</p>}
      {!formBusy && <><button type="button" className="ui-button" onClick={()=>setShowPaste(value=>!value)} aria-expanded={showPaste}>Colar letra ou cifra</button>
        {showPaste && <><label className="ui-field">Letra ou cifra<textarea value={form.rawLyrics || ''} onChange={e=>update('rawLyrics',e.target.value)} rows={5}/></label><button type="button" className="ui-button ui-button-soft" disabled={!form.rawLyrics?.trim()} onClick={usePasted}>Usar cifra como está</button></>}
        <button type="button" className="ui-button" onClick={()=>setStep(3)}>Digitar cifra manualmente</button>
      </>}
    </div>}
    {step===3 && <form id="song-editor-form" className="song-editor-sections" onSubmit={event=>{event.preventDefault();void save();}}>
      {songFields}
      <label className="ui-field">Letra e cifra<textarea value={form.lyrics} onChange={e=>update('lyrics',e.target.value)} placeholder={'Verso:\n[G]Letra com [D]acordes'} rows={8} required/></label>
      <p className="ui-helper">Coloque os acordes entre colchetes, como [G], [Em] e [C7].</p>
      <label className="ui-field">Áudio de referência (opcional)<input type="url" value={form.media_url || ''} onChange={e=>update('media_url',e.target.value)} placeholder="Link do YouTube ou Spotify"/></label>
      {lyricsValid && <details className="song-editor-extra"><summary>Prévia da cifra</summary><LyricView text={form.lyrics} baseKey={form.key} st={0} mode="chords" dark={dark}/></details>}
    </form>}
  </Dialog>;
});
/* ─── EVENT EDITOR ──────────────────────────────────────────── */
const CreateEvent = memo(({dark,members,songs,events,initialDate,editEvent,onSave,onClose})=>{

  const [form,setForm]=useState({date:editEvent?.date||initialDate||'',time:editEvent?.time||'19:00',type:editEvent?.type||'culto',label:editEvent?.label||'',theme:editEvent?.theme||'',notes:editEvent?.notes||'',mention_member_ids:editEvent?.mention_member_ids||[],selMembers:editEvent?.members||[],selSongs:editEvent?.songs||[],requestedSongs:editEvent?.requested_songs||[],santaCeiaSong:editEvent?.santa_ceia_song||null,singerBySong:editEvent?.singerBySong||{},instrument_assignments:editEvent?.instrument_assignments||{}});
  const [tab,setTab]=useState('details');
  const tabId=useId();
  const [memberSearch,setMemberSearch]=useState('');
  const [songSearch,setSongSearch]=useState('');
  const [saving,setSaving]=useState(false);
  const [saveError,setSaveError]=useState('');
  function moveSong(index,delta){setForm(previous=>{const next=[...previous.selSongs];[next[index],next[index+delta]]=[next[index+delta],next[index]];return {...previous,selSongs:next};});}
  const [isRecurring,setIsRecurring]=useState(false);
  const [occurrences,setOccurrences]=useState(4);

  const PRESETS = [
    { label: 'Culto de Quinta', time: '19:30', type: 'culto', members: [] },
    { label: 'Culto de Domingo', time: '18:00', type: 'culto', members: [] },
    { label: 'Consagração', time: '08:00', type: 'consagracao', members: availableMembers(members,form.date).map(m=>m.id) },
    { label: 'Escola Bíblica (EBD)', time: '09:00', type: 'ebd', members: availableMembers(members,form.date).map(m=>m.id) },
    { label: 'Ensaio Geral', time: '15:00', type: 'ensaio', members: availableMembers(members,form.date).map(m=>m.id) }
  ];

  function toggleMember(id){if(!form.selMembers.includes(id)&&availabilityReason(members.find(member=>member.id===id),form.date))return;setForm(f=>({...f,selMembers:f.selMembers.includes(id)?f.selMembers.filter(x=>x!==id):[...f.selMembers,id]}));}
  function toggleSong(id){setForm(f=>({...f,selSongs:f.selSongs.includes(id)?f.selSongs.filter(x=>x!==id):[...f.selSongs,id]}));}
  function toggleRequestedSong(id){setForm(f=>({...f,requestedSongs:f.requestedSongs.includes(id)?f.requestedSongs.filter(x=>x!==id):[...f.requestedSongs,id]}));}

  function autoGenerate(){
    if(!form.date) return alert("Selecione a data primeiro para auto-gerar!");

    let draftedMembers = form.selMembers;
    if (form.selMembers.length === 0) {
      const day = new Date(form.date+'T12:00:00').getDay();
      const ativos = availableMembers(members,form.date);
      if (form.type === 'culto') {
         const instr = ativos.filter(m => !(m.instrument||'').toLowerCase().includes('vocal') && !(m.instrument||'').toLowerCase().includes('voz'));
         const vocais = ativos.filter(m => ((m.instrument||'').toLowerCase().includes('vocal') || (m.instrument||'').toLowerCase().includes('voz')) && !(m.unavailableDays||[]).includes(day));
         const shuffledVocais = [...vocais].sort(()=>Math.random()-0.5).slice(0,3);
         draftedMembers = [...instr.map(m=>m.id), ...shuffledVocais.map(m=>m.id)];
      } else if (form.type === 'ebd' || form.type === 'consagracao' || form.type === 'ensaio') {
         draftedMembers = ativos.map(m=>m.id);
      }
    }

    const generatedSongs = generateDynamicSetlist(form.date, form.type, songs, events, form.requestedSongs, form.santaCeiaSong);

    let sbs = {...form.singerBySong};
    if (form.type === 'culto' && draftedMembers.length > 0) {
       const draftedVocais = draftedMembers.filter(mid => {
           const m = members.find(x=>x.id===mid);
           return m && ((m.instrument||'').toLowerCase().includes('vocal') || (m.instrument||'').toLowerCase().includes('voz'));
       });
       if (draftedVocais.length > 0) {
           let vocalIdx = 0;
           generatedSongs.forEach(sid => {
               const s = songs.find(x=>x.id===sid);
               if (s && s.cat !== 'oferta') {
                   sbs[sid] = draftedVocais[vocalIdx % draftedVocais.length];
                   vocalIdx++;
               }
           });
       }
    }

    setForm(f=>({...f, selSongs: generatedSongs, selMembers: draftedMembers, singerBySong: sbs}));
  }

  async function save(){
    if(!form.date||!form.label)return;
    const evs = [];
    const baseDate = new Date(form.date+'T12:00:00');
    const iters = editEvent ? 1 : (isRecurring?occurrences:1);
    for(let i=0; i<iters; i++){
       const d = new Date(baseDate);
       d.setDate(d.getDate() + i * 7);
       const dStr = d.toLocaleDateString('sv-SE');

       let songsToUse = form.type==='ensaio'?[]:[...new Set([...form.selSongs,...form.requestedSongs,...(form.santaCeiaSong?[form.santaCeiaSong]:[])])];
       let membersToUse = form.selMembers;
       let sbsToUse = {...form.singerBySong};

       if (form.type === 'culto' && (d.getDay()===0 || d.getDay()===4)) {
           if (membersToUse.length === 0) {
              const day = d.getDay();
              const ativos = availableMembers(members,dStr);
              const instr = ativos.filter(m => !(m.instrument||'').toLowerCase().includes('vocal') && !(m.instrument||'').toLowerCase().includes('voz'));
              const vocais = ativos.filter(m => ((m.instrument||'').toLowerCase().includes('vocal') || (m.instrument||'').toLowerCase().includes('voz')) && !(m.unavailableDays||[]).includes(day));
              const shuffledVocais = [...vocais].sort(()=>Math.random()-0.5).slice(0,3);
              membersToUse = [...instr.map(m=>m.id), ...shuffledVocais.map(m=>m.id)];
           }
           if (songsToUse.length === 0) {
               songsToUse = generateDynamicSetlist(dStr, 'culto', songs, events, form.requestedSongs, form.santaCeiaSong);
               const draftedVocais = membersToUse.filter(mid => {
                   const m = members.find(x=>x.id===mid);
                   return m && ((m.instrument||'').toLowerCase().includes('vocal') || (m.instrument||'').toLowerCase().includes('voz'));
               });
               if (draftedVocais.length > 0) {
                   let vocalIdx = 0;
                   songsToUse.forEach(sid => {
                       const s = songs.find(x=>x.id===sid);
                       if (s && s.cat !== 'oferta') {
                           sbsToUse[sid] = draftedVocais[vocalIdx % draftedVocais.length];
                           vocalIdx++;
                       }
                   });
               }
           }
       } else if ((form.type === 'ebd' || form.type === 'consagracao' || form.type === 'ensaio') && membersToUse.length === 0) {
           membersToUse = availableMembers(members,dStr).map(m=>m.id);
       }

       sbsToUse=Object.fromEntries(Object.entries(sbsToUse).filter(([,id])=>id===ALL_VOCALS||membersToUse.includes(id)));
       const evId = editEvent ? editEvent.id : crypto.randomUUID();
       const itemsToUse = songsToUse.map((songId, idx) => ({
         id: `song_${songId}_${idx}`,
         type: 'song',
         song_id: songId,
         singer_id: sbsToUse[songId] || null,
         text: ''
       }));
       (editEvent?.items||[]).forEach((item,index)=>{if(item.type!=='song')itemsToUse.splice(Math.min(index,itemsToUse.length),0,item);});
       const newEv = withoutRehearsalSongs({id:evId,date:dStr,time:form.time,type:form.type,label:form.label,theme:form.theme||null,notes:form.notes,mention_member_ids:form.mention_member_ids,songs:songsToUse,members:membersToUse,confirmations:editEvent?editEvent.confirmations:{},singerBySong:sbsToUse,instrument_assignments:form.instrument_assignments,sequenceBySong:editEvent?editEvent.sequenceBySong:{},keyBySong:editEvent?.keyBySong||{},setlist_confirmation:editEvent?.setlist_confirmation||null,requested_songs:form.requestedSongs,santa_ceia_song:form.santaCeiaSong,items:itemsToUse});
       evs.push(newEv);

       // Criar ensaio de sábado automaticamente se for domingo (apenas na criação)
       if (!editEvent && form.type === 'culto' && d.getDay() === 0) {
           const dSat = new Date(d);
           dSat.setDate(dSat.getDate() - 1);
           evs.push({id:crypto.randomUUID(),date:dSat.toLocaleDateString('sv-SE'),time:'15:00',type:'ensaio',label:'Ensaio (Sáb)',theme:form.theme||null,songs:[],members:membersToUse.filter(id=>{const person=members.find(member=>member.id===id);return person&&!availabilityReason(person,localDate(dSat));}),confirmations:{},singerBySong:{},sequenceBySong:{},requested_songs:[],santa_ceia_song:null,items:[]});
       }
    }
    const conflicts=evs.flatMap(event=>rosterConflicts(event,members,editEvent).map(conflict=>conflict.name+' · '+event.date.split('-').reverse().join('/')+' · '+conflict.reason));
    if(conflicts.length){setSaveError('Revise a equipe antes de salvar: '+conflicts.join('; '));setTab('team');return;}
    setSaving(true);setSaveError('');
    try{await onSave(evs);}catch(error){setSaveError(error.message);}finally{setSaving(false);}
  }
  const filtM=members.filter(m=>m.name.toLowerCase().includes(memberSearch.toLowerCase()));
  const filtS=songs.filter(s=>s.title.toLowerCase().includes(songSearch.toLowerCase()));
  const categoryIds = [...new Set(['jubilo','hinario','adoracao','oferta','corinho','ceia',...filtS.map(song=>song.cat||'uncategorized')])];
  const songGroups = categoryIds.map(id=>({id,label:CAT[id]?.label||(id==='uncategorized'?'Sem categoria':id),color:CAT[id]?.color||'#64748B',songs:filtS.filter(song=>(song.cat||'uncategorized')===id).sort((a,b)=>a.title.localeCompare(b.title,'pt-BR',{sensitivity:'base',numeric:true}))})).filter(group=>group.songs.length);


  const hasSetlist = form.type !== 'ensaio' && form.type !== 'ebd' && form.type !== 'consagracao';
  const activeTab = !hasSetlist && tab === 'setlist' ? 'details' : tab;
  const tabs = [{id:'details',label:'Detalhes',icon:'calendar'},...(hasSetlist?[{id:'setlist',label:'Setlist',icon:'music',count:form.selSongs.length}]:[]),{id:'team',label:'Equipe',icon:'users',count:form.selMembers.length}];
  const selectedCount = new Set([...form.selSongs,...form.requestedSongs,...(form.santaCeiaSong?[form.santaCeiaSong]:[])]).size;
  const types = {culto:'Culto',ensaio:'Ensaio',ebd:'EBD',consagracao:'Consagração',outro:'Outro'};
  function tabKeys(event) {
    const direction = {ArrowRight:1,ArrowLeft:-1}[event.key];
    if (!direction && !['Home','End'].includes(event.key)) return;
    event.preventDefault();
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (tabs.findIndex(item=>item.id===activeTab)+direction+tabs.length)%tabs.length;
    setTab(tabs[index].id);
    document.getElementById(tabId+'-'+tabs[index].id)?.focus();
  }
  return <Dialog dark={dark} title={editEvent?'Editar evento':'Novo evento'} description="Organize os detalhes, as músicas e a equipe." busy={saving} onClose={onClose} contentKey={activeTab}
    tabs={<div className="ui-dialog-tabs" role="tablist" aria-label="Edição do evento" onKeyDown={tabKeys} style={{gridTemplateColumns:'repeat('+tabs.length+', minmax(0,1fr))'}}>
      {tabs.map(item=><button key={item.id} className="ui-dialog-tab" role="tab" id={tabId+'-'+item.id} aria-controls={tabId+'-panel'} aria-label={item.label} aria-selected={activeTab===item.id} tabIndex={activeTab===item.id?0:-1} onClick={()=>setTab(item.id)}><Icon name={item.icon} size={16}/>{item.label}{item.count!==undefined&&<span>{item.count}</span>}</button>)}
    </div>}
    footer={<>
      {saveError&&<div className="ui-message ui-error" role="alert">{saveError}</div>}
      <div className="ui-dialog-summary">{hasSetlist&&<span><Icon name="music" size={14}/>{selectedCount} músicas</span>}<span><Icon name="users" size={14}/>{form.selMembers.length} pessoas na equipe</span></div>
      <div className="ui-dialog-buttons"><button className="ui-button" onClick={onClose} disabled={saving}>Cancelar</button><button className="ui-button ui-button-primary" onClick={save} disabled={saving||!form.date||!form.label}><Icon name="check" size={17}/>{saving?'Salvando…':editEvent?'Salvar Alterações':'Criar Compromisso'}</button></div>
    </>}>
    <div role="tabpanel" id={tabId+'-panel'} aria-labelledby={tabId+'-'+activeTab}>
    {activeTab==='details'&&<>
      <details className="ui-card ui-presets">
        <summary><Icon name="sparkles" size={18}/><span>Usar um modelo de evento</span><Icon name="down" size={16}/></summary>
        <div className="ui-chip-group">{PRESETS.map(p=><button key={p.label} className="ui-chip" onClick={()=>setForm(f=>({...f,label:p.label,time:p.time,type:p.type,selMembers:p.members.length?p.members:f.selMembers}))}>{p.label}</button>)}</div>
      </details>
      <Section icon="calendar" title="Sobre o evento">
        <span className="ui-field-label">Tipo de evento</span>
        <div className="ui-chip-group" style={{marginBottom:18}}>{Object.entries(types).map(([id,label])=><button key={id} className="ui-chip" aria-pressed={form.type===id} onClick={()=>setForm(f=>({...f,type:id}))}>{label}</button>)}</div>
        {form.type==='ensaio'&&<p className="ui-helper" style={{marginBottom:16}}>Na tela Ensaio, a equipe acessa as músicas dos cultos e dos demais eventos com repertório definido.</p>}
        <label className="ui-field">Nome do evento <input value={form.label} onChange={e=>setForm(f=>({...f,label:e.target.value}))} placeholder="Nome do compromisso *" required/></label>
        <div className="ui-fields ui-event-date-fields" style={{marginTop:16}}>
          <label className="ui-field">Data <input type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))} required/></label>
          <label className="ui-field">Horário <input type="time" value={form.time} onChange={e=>setForm(f=>({...f,time:e.target.value}))}/></label>
        </div>
        <label className="ui-field">Tema <input value={form.theme} onChange={e=>setForm(f=>({...f,theme:e.target.value}))} placeholder="Tema ou título (opcional)"/></label>
        <MentionInput label="Mensagem para a equipe" value={form.notes} mentionIds={form.mention_member_ids} members={members} maxLength={4000} placeholder="Observações do evento. Digite @ para marcar um integrante." onChange={(notes,mention_member_ids)=>setForm(previous=>({...previous,notes,mention_member_ids}))}/>
      </Section>
      {!editEvent&&<Section icon="reset" title="Repetição">
        <div className="ui-switch-row"><div><strong>Repetir semanalmente</strong><small>Cria os eventos nas próximas semanas.</small></div><button className="ui-switch" role="switch" aria-label="Repetir semanalmente" aria-checked={isRecurring} onClick={()=>setIsRecurring(p=>!p)}><span/></button></div>
        {isRecurring&&<label className="ui-field" style={{marginTop:16}}>Número de ocorrências<input type="number" min="2" max="12" value={occurrences} onChange={e=>setOccurrences(Math.max(2,Math.min(12,Number(e.target.value)||2)))}/></label>}
      </Section>}
    </>}
    {activeTab==='setlist'&&<>
      <Section icon="music" title="Ordem das músicas" description="Use as setas para organizar a sequência." action={form.type==='culto'&&<button className="ui-button ui-button-soft ui-button-small" onClick={autoGenerate}><Icon name="sparkles" size={14}/>Auto-gerar</button>}>
        {form.selSongs.length?<ol className="ui-list" aria-label="Músicas do setlist">{form.selSongs.map((id,index)=>{const song=songs.find(item=>item.id===id);return <li key={id} className="ui-list-row ui-ordered-song ui-category-song" style={{'--song-category':CAT[song?.cat]?.color||'#64748B'}}>
          <span className="ui-row-number">{String(index+1).padStart(2,'0')}</span><div className="ui-row-copy"><strong>{song?.title||'Música indisponível'}</strong><small>{song?.artist}{song?.key?' · '+song.key:''}</small><span className="ui-category-tag">{CAT[song?.cat]?.label||song?.cat||'Sem categoria'}</span></div>
          <div className="ui-row-actions"><button className="ui-icon-button" aria-label={'Subir '+song?.title} disabled={index===0} onClick={()=>moveSong(index,-1)}><Icon name="up" size={16}/></button><button className="ui-icon-button" aria-label={'Descer '+song?.title} disabled={index===form.selSongs.length-1} onClick={()=>moveSong(index,1)}><Icon name="down" size={16}/></button><button className="ui-icon-button" aria-label={'Remover '+song?.title} onClick={()=>toggleSong(id)}><Icon name="close" size={15}/></button></div>
        </li>;})}</ol>:<div className="ui-empty"><Icon name="music" size={26}/><strong>O setlist começa aqui</strong><p>Selecione as músicas no repertório abaixo.</p></div>}
      </Section>
      {form.type==='culto'&&<details className="ui-card ui-presets"><summary><Icon name="note" size={18}/><span>Pedidos e Santa Ceia</span><Icon name="down" size={16}/></summary>
        <p className="ui-helper" style={{marginBottom:16}}>Escolha entre todas as músicas do repertório.</p>
        <label className="ui-field">Música da Santa Ceia<select value={form.santaCeiaSong||''} onChange={e=>setForm(f=>({...f,santaCeiaSong:e.target.value}))}><option value="">Nenhuma</option>{songs.map(song=><option key={song.id} value={song.id}>{song.title} ({song.artist})</option>)}</select></label>
        <label className="ui-field">Músicas pedidas<select value="" onChange={e=>{if(e.target.value)toggleRequestedSong(e.target.value);}}><option value="">+ Adicionar música pedida...</option>{songs.filter(song=>!form.requestedSongs.includes(song.id)).map(song=><option key={song.id} value={song.id}>{song.title} ({song.artist})</option>)}</select></label>
        {!!form.requestedSongs.length&&<div className="ui-chip-group" style={{marginTop:12}}>{form.requestedSongs.map(id=>{const song=songs.find(item=>item.id===id);return song?<button key={id} className="ui-chip" aria-label={'Remover pedido '+song.title} onClick={()=>toggleRequestedSong(id)}>{song.title}<Icon name="close" size={12}/></button>:null;})}</div>}
        <p className="ui-helper">Os pedidos e a música da ceia também entram no setlist ao salvar.</p>
      </details>}
      <Section icon="plus" title="Adicionar do repertório" description="Encontre as músicas por categoria e adicione ao evento." className="ui-song-catalog">
        <SearchField label="Buscar música no repertório" value={songSearch} onChange={e=>setSongSearch(e.target.value)} placeholder="Buscar música..."/>
        {songGroups.map(group=><section className="ui-category-group" key={group.id} aria-label={group.label} style={{'--song-category':group.color}}>
          <div className="ui-category-heading"><h4><span className="ui-category-dot"/>{group.label}</h4><span>{group.songs.length} {group.songs.length===1?'música':'músicas'}{group.songs.some(song=>form.selSongs.includes(song.id))&&' · '+group.songs.filter(song=>form.selSongs.includes(song.id)).length+' no setlist'}</span></div>
          <div className="ui-list">{group.songs.map(song=><button key={song.id} className="ui-list-row ui-song-choice ui-category-song" aria-label={'Selecionar '+song.title} aria-pressed={form.selSongs.includes(song.id)} onClick={()=>toggleSong(song.id)}>
            <span className="ui-selection"><Icon name={form.selSongs.includes(song.id)?'check':'plus'} size={14}/></span><div className="ui-row-copy"><strong>{song.title}</strong><small>{song.artist}</small></div><span className="ui-badge">{song.key}</span>
          </button>)}</div>
        </section>)}
        {!filtS.length&&<div className="ui-empty"><Icon name="search"/><strong>Nenhuma música encontrada</strong><p>Tente buscar por outro nome.</p></div>}
      </Section>

    </>}
    {activeTab==='team'&&<Section icon="users" title="Equipe escalada" description="Selecione quem vai participar deste evento.">
      <SearchField label="Buscar membro" value={memberSearch} onChange={e=>setMemberSearch(e.target.value)} placeholder="Buscar membro..."/>
      <div className="ui-section-label"><span>{form.selMembers.length} pessoas selecionadas</span><span>{availableMembers(filtM,form.date).length} disponíveis</span></div>
      <div className="ui-list">{filtM.map(member=><button key={member.id} className="ui-list-row ui-song-choice" aria-label={member.name} disabled={!form.selMembers.includes(member.id)&&!!availabilityReason(member,form.date)} aria-pressed={form.selMembers.includes(member.id)} onClick={()=>toggleMember(member.id)}>
        <span className="ui-avatar" style={{'--avatar-tint':member.color?member.color+'18':undefined,'--avatar-color':member.color}}>{member.avatar||member.name.split(' ').map(part=>part[0]).slice(0,2).join('')}</span><div className="ui-row-copy"><strong>{member.name}</strong><small>{availabilityReason(member,form.date)||member.instrument||member.role||'Membro'}</small></div><span className="ui-selection">{form.selMembers.includes(member.id)&&<Icon name="check" size={14}/>}</span>
      </button>)}</div>
      {!filtM.length&&<div className="ui-empty"><Icon name="users"/><strong>Nenhuma pessoa encontrada</strong><p>Tente buscar por outro nome.</p></div>}
    </Section>}
    </div>
  </Dialog>;
});

/* ─── EVENT SHEET ───────────────────────────────────────────── */

/* ─── NOTIFS SHEET ──────────────────────────────────────────── */
/* ─── MODO ENSAIO COLABORATIVO ─── */
const Ensaio = props=><Rehearsal {...props} LyricView={LyricView}/>;

/* ─── PUSH SETTINGS MODAL ─── */



export default function LouveSync({onVisitor,onCommunitySession}) {
  // ── Auth
  const [profile,setProfile]=useState(null);
  const [allMembers,setAllMembers]=useState([]);
  const [authLoading,setAuthLoading]=useState(true);
  const [actorSession,setActorSession]=useState(readActorSession);
  const activity=useActivity(isChurchMember(profile)?null:profile,actorSession);
  useEffect(()=>{if(isChurchMember(profile))onCommunitySession?.(profile,actorSession);},[profile,actorSession,onCommunitySession]);
  const [changeDraft,setChangeDraft]=useState(null);
  const [changeNotice,setChangeNotice]=useState('');
  useEffect(()=>{if(profile)writeCache('ls_profile',publicMember(profile));},[profile]);
  const notifications=useNotifications(activity.credentials);
  const notifyChanges=notifications.changed;

  // ── Data
  const [songRecords,setSongs]=useState([]);
  const songs=useMemo(()=>songRecords.map(withSongChart),[songRecords]);
  const [events,setEvents]=useState([]);
  const [dataLoading,setDataLoading]=useState(true);

  useEffect(()=>{if(profile?.id)cacheWrite('workspace:'+profile.id,{songs:songRecords,events,members:allMembers});},[profile?.id,songRecords,events,allMembers]);

  // ── UI
  const [dark,setDark]=useState(()=>{
    try { return localStorage.getItem('ls_theme')==='dark'; }
    catch { return document.documentElement.dataset.theme==='dark'; }
  });
  const navigationRef=useNavigationClearance();
  const [requestedTab,setTab]=useState('home');
  const tab=canSeeScreen(profile,requestedTab)?requestedTab:(effectiveScreens(profile)[0]||'access-denied');
  const [homeDate,setHomeDate]=useState(null);
  const [moreOpen,setMoreOpen]=useState(false);
  const closeMore=useCallback(()=>setMoreOpen(false),[]);
  const [selectedSong,setSelSong]=useState(null);
  const selSong = songs.find(song=>song.id===selectedSong?.id) || selectedSong;
  const metronome = useMetronome(selSong?.id, selSong?.bpm, selSong?.time_signature);
  const stopMetronome = metronome.stop;
  const [selectedEvent,setSelEvent]=useState(null);
  const selEvent = events.find(event=>event.id===selectedEvent?.id) || selectedEvent;
  const [tr,setTr]=useState(0);
  const [mode,setMode]=useState('chords');
  const [stageMode,setStageMode]=useState(false);
  const [stageFs,setStageFs]=useState(22);
  const [catF,setCatF]=useState('all');
  const [search,setSearch]=useState('');
  const [selectedSheet,setEvSheet]=useState(null);
  const evSheet = events.find(event=>event.id===selectedSheet?.id) || null;
  const [scheduleView,setScheduleView]=useState({week:null,day:null,scope:'all',history:false});
  const [attendanceEventId,setAttendanceEventId]=useState(null);
  const attendanceDirty=useRef(false),attendanceBusy=useRef(false);
  const attendanceDirtyChanged=useCallback((value,busy=false)=>{attendanceDirty.current=value;attendanceBusy.current=busy;},[]);
  const mainScrollRef=useRef(null);
  const previousScroll=useRef(0);
  const returnToEvent=useRef(false);
  const [syncError,setSyncError]=useState('');
  const [setlistSavingId,setSetlistSavingId]=useState(null);
  const setlistWriteRef=useRef(false);
  const [connectionStatus,setConnectionStatus]=useState('offline');
  const [addOpen,setAddOpen]=useState(false);
  const [notifsOpen,setNotifsOpen]=useState(false);
  const [selRole,setSelRole]=useState('Todos');
  const [confetti,setConfetti]=useState([]);
  const [confirmState,setConfirmState]=useState(null);
  const [installPrompt,setDeferredPrompt]=useState(null);
  const offline = useOfflineSync(actorSession,profile,handleOwnPinChanged);
  const isOnline = offline.online;
  useEffect(()=>{
    window.dispatchOfflineTask=(type,data)=>enqueue(type,data,profile?.id);
    return()=>{delete window.dispatchOfflineTask;};
  },[profile?.id]);
  useEffect(()=>{
    const handleBeforeInstall=event=>{event.preventDefault();setDeferredPrompt(event);};
    window.addEventListener('beforeinstallprompt',handleBeforeInstall);
    return()=>window.removeEventListener('beforeinstallprompt',handleBeforeInstall);
  },[]);
  const [stageToast, setStageToast] = useState(null);
  const [chordColor, setChordColor] = useState('#FF6B35');
  const [fontFam, setFontFam] = useState("'Nunito', sans-serif");

  // ── Landscape lock (only enforce on touch devices)
  const isTouchDevice = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0 || navigator.msMaxTouchPoints > 0);
  const [landscape,setLandscape]=useState(()=>isTouchDevice && window.matchMedia('(max-height:500px) and (orientation:landscape)').matches);
  useEffect(()=>{
    if (!isTouchDevice) return; // don't install listeners on non-touch (desktop) environments
    const mq=window.matchMedia('(max-height:500px) and (orientation:landscape)');
    const h=e=>setLandscape(e.matches); mq.addEventListener('change',h);
    return()=>mq.removeEventListener('change',h);
  },[isTouchDevice]);

  // ── Favorites (localStorage)
  const [favorites,setFavorites]=useState(()=>{try{return JSON.parse(localStorage.getItem('ls_fav')||'[]');}catch{return [];}});
  function toggleFav(id){setFavorites(p=>{const n=p.includes(id)?p.filter(x=>x!==id):[...p,id];localStorage.setItem('ls_fav',JSON.stringify(n));return n;});}

  // ── Create event
  const [createEvOpen,setCreateEvOpen]=useState(false);
  const [createEvDate,setCreateEvDate]=useState(null);
  const [editEvState,setEditEvState]=useState(null);

  // ── AI
  const [aiMsgs,setAiMsgs]=useState([{r:'a',c:'Olá! Sou o Maestro, assistente de adoração do IMWAL.\n\nPosso ajudar com:\n• Setlists por tema bíblico\n• Fluxo progressivo de adoração\n• Reflexões ministeriais\n• Dicas de condução e ensaio\n\nComo posso servir hoje?'}]);
  const [aiIn,setAiIn]=useState('');
  const aiRequestRef=useRef(null);
  useEffect(()=>()=>aiRequestRef.current?.abort(),[profile?.id]);
  const [aiLoad,setAiLoad]=useState(false);
  const [aiCount,setAiCount]=useState(0);
  useEffect(()=>{if(profile?.id){cacheWrite('maestro-history:'+profile.id,aiMsgs);cacheWrite('maestro-draft:'+profile.id,aiIn);}},[profile?.id,aiMsgs,aiIn]);
  useEffect(()=>{
    if(!profile?.id)return;
    const collect=()=>setAiMsgs(previous=>previous.map(message=>{const result=message.pending&&cacheRead('maestro-result:'+profile.id+':'+message.requestId);return result?{r:'a',c:result.reply}:message;}));
    window.addEventListener('louvesync:synced',collect);collect();return()=>window.removeEventListener('louvesync:synced',collect);
  },[profile?.id]);



  const [keyF,setKeyF]=useState('');
  // inCifra: qualquer tab pode abrir a cifra de uma música
  const inCifra = !!selSong;
  const homeTheme = !!profile && (moreOpen || ['home','mural','treinamento','ensaio','patrimonio','repertorio','biblia'].includes(tab)) && !inCifra;
  useAppDisplay(dark,homeTheme);
  const unread=notifications.items.filter(item=>!item.read_at).length;
  const [muralTarget,setMuralTarget]=useState(null);
  const [pushLink,setPushLink]=useState(()=>new URL(window.location.href).searchParams.has('tab')?window.location.href:null);
  const openNotificationTarget=useCallback(item=>{
    const target=notificationDestination(item,window.location.origin);
    if(!profile||!target||!canSeeScreen(profile,target.tab))return;
    const targetEvent=target.eventId?events.find(event=>event.id===target.eventId)||null:null;
    const mentionEvent=item.type==='mention'&&targetEvent;
    stopMetronome();setMoreOpen(false);setTab(targetEvent?.type==='ensaio'&&!mentionEvent?'ensaio':target.tab);setSelEvent(null);setNotifsOpen(false);
    if(target.tab==='mural')setMuralTarget({...target,requestId:crypto.randomUUID()});
    if(target.tab==='repertorio')setSelSong(songs.find(song=>song.id===target.songId)||null);
    else{setSelSong(null);setEvSheet(targetEvent?.type==='ensaio'&&!mentionEvent?null:targetEvent);}
  },[profile,songs,events,stopMetronome]);
  useEffect(()=>{
    const receive=event=>{
      if(event.data?.type!=='LOUVESYNC_OPEN_NOTIFICATION')return;
      if(!notificationDestination({url:event.data.url},window.location.origin))return;
      setPushLink(event.data.url);event.ports?.[0]?.postMessage({ok:true});
    };
    navigator.serviceWorker?.addEventListener('message',receive);
    return()=>navigator.serviceWorker?.removeEventListener('message',receive);
  },[]);
  useEffect(()=>{
    if(!pushLink||!profile||dataLoading||addOpen||createEvOpen||confirmState||inCifra||stageMode)return;
    openNotificationTarget({url:pushLink});setPushLink(null);
  },[pushLink,profile,dataLoading,addOpen,createEvOpen,confirmState,inCifra,stageMode,openNotificationTarget]);
  function handleOpenNotification(item){void notifications.markRead([item.id]);openNotificationTarget(item);}

  /* Authenticate on the server; member lists and cached profiles never contain PINs. */
  useEffect(()=>{
    let disposed=false;
    async function loadMembers(){
      try{
        const data=await fetchMembers();
        const cachedMembers=readCache('ls_members',M);
        const safe=(Array.isArray(data)&&data.length?data:Array.isArray(cachedMembers)?cachedMembers:M).map(member=>normalizeMember(publicMember(member)));
        if(!disposed){setAllMembers(safe);writeCache('ls_members',safe);setProfile(previous=>{const fresh=safe.find(member=>member.id===previous?.id);if(!previous||!fresh)return previous;const next={...previous,...fresh};return JSON.stringify(previous)===JSON.stringify(next)?previous:next;});}
      }catch{const cache=readCache('ls_members',M);const safe=(Array.isArray(cache)?cache:M).map(member=>normalizeMember(publicMember(member)));if(!disposed){setAllMembers(safe);writeCache('ls_members',safe);setProfile(previous=>{const fresh=safe.find(member=>member.id===previous?.id);if(!previous||!fresh)return previous;const next={...previous,...fresh};return JSON.stringify(previous)===JSON.stringify(next)?previous:next;});}}
      if(!disposed)setAuthLoading(false);
    }
    const cached=readCache('ls_profile',null),actor=readActorSession();
    const last=Number(localStorage.getItem('ls_last_activity')||0);
    if(cached?.id&&actor?.memberId===cached.id&&(!last||Date.now()-last<4*60*60*1000)){
      const safe=normalizeMember(publicMember(cached));const workspace=cacheRead('workspace:'+safe.id,{songs:[],events:[]});setSongs(workspace.songs||[]);setEvents((workspace.events||[]).map(patchEvent));writeCache('ls_profile',safe);setMutationActor(actor);setProfile(safe);
    }else{
      setMutationActor(null);setActorSession(null);
      ['ls_profile','ls_actor_session','ls_last_activity'].forEach(key=>localStorage.removeItem(key));
    }
    void loadMembers();return()=>{disposed=true;};
  },[]);

  const backFromSong=useCallback(()=>{
    stopMetronome();setSelSong(null);setSelEvent(null);
    if(selEvent&&returnToEvent.current)setEvSheet(selEvent);
    requestAnimationFrame(()=>{if(mainScrollRef.current)mainScrollRef.current.scrollTop=previousScroll.current;});
  },[selEvent,stopMetronome]);
  /* ── Preserve event context for browser and Android back navigation ── */
  const overlayType=stageMode?'stage':addOpen?'song-editor':createEvOpen?'event-editor':notifsOpen?'notifications':inCifra?'cifra':evSheet?'event':null;
  const previousOverlay=useRef(null);
  useEffect(()=>{
    if(overlayType && previousOverlay.current!==overlayType)window.history.pushState({louveOverlay:overlayType},'');
    previousOverlay.current=overlayType;
  },[overlayType]);
  useEffect(()=>{
    const handlePopState=()=>{
      if(stageMode){setStageMode(false);previousOverlay.current='cifra';return;}
      if(inCifra){previousOverlay.current=selEvent&&returnToEvent.current?'event':null;backFromSong();return;}
      if(addOpen){setAddOpen(false);return;}
      if(createEvOpen){setCreateEvOpen(false);return;}
      if(notifsOpen){setNotifsOpen(false);return;}
      if(evSheet)setEvSheet(null);
    };
    window.addEventListener('popstate',handlePopState);
    return()=>window.removeEventListener('popstate',handlePopState);
  },[stageMode,inCifra,selEvent,addOpen,createEvOpen,notifsOpen,evSheet,backFromSong]);

  /* ── Data refresh and shared notifications (existing database only) ── */
  useEffect(()=>{
    if(!profile||isChurchMember(profile))return;
    let disposed=false, inFlight=false, pending=false;
    async function loadData(){
      if(navigator.onLine===false){setDataLoading(false);return;}
      if(inFlight){pending=true;return;}
      inFlight=true;
      try {
        const results=await Promise.allSettled([fetchSongs(),fetchEvents(),fetchMembers()]);
        if(disposed)return;
        const pendingJobs=jobsFor(profile.id);
        if(results[0].status==='fulfilled' && results[0].value!==null)setSongs(overlayWorkspace(results[0].value,[],pendingJobs).songs);
        if(results[1].status==='fulfilled' && results[1].value!==null)setEvents(overlayWorkspace([],results[1].value.map(normalizeEvent),pendingJobs).events);
        if(results[2].status==='fulfilled' && results[2].value?.length){const safe=results[2].value.map(member=>normalizeMember(publicMember(member)));setAllMembers(safe);writeCache('ls_members',safe);setProfile(previous=>{const fresh=safe.find(member=>member.id===previous?.id);if(!previous||!fresh)return previous;const next={...previous,...fresh};return JSON.stringify(previous)===JSON.stringify(next)?previous:next;});}
        const failure=results.find(result=>result.status==='rejected');
        if(failure)setSyncError(`Não foi possível atualizar os dados: ${failure.reason.message}`);
      }finally{
        inFlight=false;
        if(!disposed)setDataLoading(false);
        if(pending&&!disposed){pending=false;loadData();}
      }
    }
    loadData();
    const off=onRealtime(message=>{
      if(message.type==='data_changed'){connectionSucceeded();loadData();}
      if(message.type==='stage_chat'){
        setStageToast({sender:message.sender,message:message.message});
        setTimeout(()=>{if(!disposed)setStageToast(null);},5000);
      }
    });
    const offStatus=onRealtimeStatus(state=>{setConnectionStatus(state);if(state==='connected')loadData();});
    const pg=supabase?.channel('louvesync_data_changes');
    ['events','event_songs','event_members','songs','members'].forEach(table=>pg?.on('postgres_changes',{event:'*',schema:'public',table},loadData));
    pg?.subscribe();
    // Also refresh on resume and periodically: existing deployments may not have
    // all tables enabled for Postgres Realtime, and no migration is performed.
    const resume=()=>{if(document.visibilityState==='visible')loadData();};
    document.addEventListener('visibilitychange',resume);
    window.addEventListener('online',loadData);window.addEventListener('louvesync:synced',loadData);window.addEventListener('louvesync:connected',loadData);
    const poll=setInterval(()=>{if(document.visibilityState==='visible'&&navigator.onLine)loadData();},15000);
    return ()=>{disposed=true;off();offStatus();if(pg)supabase.removeChannel(pg);disconnectRealtime();clearInterval(poll);document.removeEventListener('visibilitychange',resume);window.removeEventListener('online',loadData);window.removeEventListener('louvesync:synced',loadData);window.removeEventListener('louvesync:connected',loadData);};
  },[profile]);

  const preparedOffline=useRef(null);
  const [preparingOffline,setPreparingOffline]=useState(false);
  useEffect(()=>{
    if(!profile?.id||!actorSession||!isOnline||dataLoading||preparedOffline.current===profile.id)return;
    preparedOffline.current=profile.id;setPreparingOffline(true);void prepareOfflineWorkspace(actorSession,profile,events).finally(()=>setPreparingOffline(false));
  },[profile,actorSession,isOnline,dataLoading,events]);

  /* ── Handlers ── */
  const handleAppUpdate = () => checkForAppUpdate();

  async function handleLogin(member, pin) {
    const safe=normalizeMember(publicMember(await(navigator.onLine!==false?authenticateMember(member.id,pin):unlockIdentity(member.id,pin))));
    if(navigator.onLine!==false&&!safe._offlineUnlock){connectionSucceeded();await rememberIdentity(safe,pin);}
    const workspace=cacheRead('workspace:'+safe.id,{songs:[],events:[],members:allMembers});
    const local=overlayWorkspace(workspace.songs||[],(workspace.events||[]).map(patchEvent),jobsFor(safe.id));
    setSongs(local.songs);setEvents(local.events);if(workspace.members?.length)setAllMembers(workspace.members);
    setAiMsgs(cacheRead('maestro-history:'+safe.id)||[{r:'a',c:'Olá! Sou o Maestro. Como posso ajudar sua equipe hoje?'}]);setAiIn(cacheRead('maestro-draft:'+safe.id,''));
    const actor={memberId:safe.id,pin};
    localStorage.setItem('ls_actor_session',JSON.stringify(actor));
    localStorage.setItem('ls_profile',JSON.stringify(safe));
    localStorage.setItem('ls_last_activity',String(Date.now()));
    setMutationActor(actor);
    if(isChurchMember(safe)&&onCommunitySession){onCommunitySession(safe,actor);return true;}
    setActorSession(actor);setProfile(safe);
    return true;
  }
  async function handleOwnPinChanged(pin,member=profile){
    const actor={memberId:profile.id,pin};setMutationActor(actor);setActorSession(actor);writeCache('ls_actor_session',actor);await rememberIdentity(member,pin);
  }
  function handleLogout() {
    const logout=()=>{
      void notifications.detach();aiRequestRef.current?.abort();aiRequestRef.current=null;setAiLoad(false);setAiCount(0);setAiIn('');setAiMsgs([{r:'a',c:'Olá! Sou o Maestro. Como posso ajudar sua equipe hoje?'}]);
      localStorage.removeItem('ls_actor_session');setMutationActor(null);setActorSession(null);
      localStorage.removeItem('ls_profile');
      localStorage.removeItem('ls_last_activity');
      setProfile(null); setMoreOpen(false); setSelSong(null); setSelEvent(null); setHomeDate(null); setScheduleView({week:null,day:null,scope:'all',history:false}); setTab('home');onVisitor?.();
    };
    if(tab==='presencas')leaveAttendance(logout);else logout();
  }
  function leaveAttendance(action){
    if(attendanceBusy.current){setConfirmState({title:'Salvando chamada',msg:'Aguarde a confirmação do servidor antes de sair desta tela.',isAlert:true,onConfirm:()=>setConfirmState(null)});return;}
    if(!attendanceDirty.current){action();return;}
    setConfirmState({title:'Descartar alterações da chamada?',msg:'Há marcações que ainda não foram salvas. Ao sair, essas alterações serão descartadas.',onConfirm:()=>{attendanceDirty.current=false;setConfirmState(null);action();},onCancel:()=>setConfirmState(null)});
  }
  function navTo(t,attendanceId=null){
    if(!canSeeScreen(profile,t)){setChangeNotice('A liderança não liberou esta tela para seu perfil.');return;}
    const go=()=>{
      setMuralTarget(null);
      if(moreOpen){setMoreOpen(false);requestAnimationFrame(()=>mainScrollRef.current?.scrollTo({top:0}));}
      if(t==='presencas')setAttendanceEventId(attendanceId);
      vib();setTab(t);if(t!=='repertorio'){setSelSong(null);setSelEvent(null);}
    };
    if(tab==='presencas'&&(t!==tab||attendanceId!==attendanceEventId))leaveAttendance(go);else go();
  }
  function openAttendance(event){
    if(!canManageAttendance(allMembers.find(member=>member.id===profile?.id)||profile)||!canSeeScreen(profile,'presencas'))return;
    setEvSheet(null);navTo('presencas',event.id);
  }
  function openEvent(event){
    if(!canSeeScreen(profile,event.type==='ensaio'?'ensaio':'escala')){setChangeNotice('A liderança não liberou esta tela para seu perfil.');return;}
    if(event.type==='ensaio'){setEvSheet(null);navTo('ensaio');}
    else setEvSheet(event);
  }
  function openEventEditor(event){
    if(!profile?.is_admin)return;
    setEvSheet(null);setCreateEvDate(null);setEditEvState(event);setCreateEvOpen(true);
  }
  function selectSong(s,ev=null,activeKey=null){
    if(!canSeeScreen(profile,'repertorio')){setChangeNotice('A liderança não liberou a tela de músicas para seu perfil.');return;}
    if(!s) return alert('Ops! Esta música ainda não foi adicionada no Repertório.');
    console.log('🎵 selectSong called with:', {title: s.title, artist: s.artist, id: s.id});
    returnToEvent.current=!!ev&&!!evSheet;
    // Close any overlays that might block the cifra view (fixes white/blank screen)
    if (stageMode) setStageMode(false);
    if (addOpen) setAddOpen(false);
    if (createEvOpen) setCreateEvOpen(false);
    if (evSheet) setEvSheet(null);
    if (notifsOpen) setNotifsOpen(false);
    previousScroll.current=mainScrollRef.current?.scrollTop||0;
    vib();setSelSong(s);setSelEvent(ev);

    setTr(keyDistance(s.key,activeKey||(ev?performanceKey(s,ev):s.vocal_keys?.[profile?.id]||s.key)));
    setMode('chords');

    console.log('🎵 About to render Cifra component, inCifra will be:', true);
    metronome.stop();
  }

  function spawnConfetti(){
    const colors=['#4F46E5','#10B981','#F59E0B','#EC4899','#8B5CF6','#06B6D4'];
    setConfetti(Array.from({length:18},(_,i)=>({id:Date.now()+i,color:colors[i%colors.length],x:Math.random()*100,size:6+Math.random()*8,dl:Math.random()*.6,rot:Math.random()*360})));
    setTimeout(()=>setConfetti([]),1800);
  }

  async function handleConfirm(eventId,confirmed){
    if(!profile)return false;
    const previous=events.find(event=>event.id===eventId)?.confirmations?.[profile.id];
    setEvents(evs=>evs.map(ev=>ev.id===eventId?{...ev,confirmations:{...ev.confirmations,[profile.id]:confirmed}}:ev));
    if(!supabase)return true;
    try{await offlineAction('confirm',{eventId,memberId:profile.id,confirmed},()=>setPresence(eventId,profile.id,confirmed),{pendingOffline:true});await broadcastUpdate({type:'data_changed'});notifyChanges();return true;}
    catch(error){setEvents(evs=>evs.map(ev=>ev.id===eventId?{...ev,confirmations:{...ev.confirmations,[profile.id]:previous}}:ev));setSyncError(`Presença não salva: ${error.message}`);return false;}
  }

  const handleSetlistConfirmation=async(eventId,snapshot,confirmed)=>{
    if(!canManageMinistry(profile))return {ok:false,error:'Somente a liderança pode definir o setlist.'};
    if(!supabase)return {ok:false,error:'Servidor não configurado.'};
    if(setlistWriteRef.current)return {ok:false,error:'Aguarde a confirmação em andamento.'};
    setlistWriteRef.current=true;setSetlistSavingId(eventId);
    try{
      const preferences=await offlineAction('setlist',{eventId,snapshot,confirmed},()=>setSetlistConfirmation(eventId,snapshot,profile.id,confirmed),{_pendingSetlist:true,_pendingOffline:true});
      setEvents(previous=>previous.map(event=>event.id===eventId?{...event,...preferences}:event));
      await broadcastUpdate({type:'data_changed'});notifyChanges();
      return {ok:true};
    }catch(error){return {ok:false,error:error.message||'A confirmação não foi salva. Tente novamente.'};}
    finally{setlistWriteRef.current=false;setSetlistSavingId(null);}
  };

  const handleSetSinger=async(eventId,songId,singerMemberId)=>{
    if(!canManageMinistry(profile))return;
    const memberId=singerMemberId||null;
    try{
      await offlineAction('singer',{eventId,songId,memberId},()=>setSingerForSong(eventId,songId,memberId),{pendingOffline:true});
      setEvents(evs=>evs.map(e=>e.id===eventId?{...e,singerBySong:{...e.singerBySong,[songId]:memberId}}:e));
      await broadcastUpdate({type:'data_changed'});notifyChanges();
    }catch(error){setSyncError(`Vocal não salvo: ${error.message}`);throw error;}
  };
  const handleSetInstrument=async(eventId,instrumentId,memberId)=>{
    if(!canManageMinistry(profile))throw new Error('Somente a liderança pode definir os instrumentistas.');
    const event=events.find(item=>item.id===eventId);
    if(!event)throw new Error('Evento não encontrado. Atualize a escala.');
    const choice=chooseInstrument(event,allMembers,instrumentId,memberId);
    await offlineAction('instrument',choice,()=>setInstrumentForEvent(choice),{pendingOffline:true});
    setEvents(previous=>previous.map(item=>item.id===eventId?{...item,members:choice.roster,instrument_assignments:choice.assignments,confirmations:Object.fromEntries(choice.roster.map(id=>[id,item.confirmations?.[id]??null]))}:item));
    await broadcastUpdate({type:'data_changed'});notifyChanges();
  };
  const handleUpdateSongOptions=async(songId,newKey,updateOfficial,newBpm,newTs,singerId,eventId)=>{
    if(!canManageMinistry(profile))return;
    try{
      await offlineAction('song_options',{songId,eventId,key:newKey,bpm:newBpm,time_signature:newTs,singerId,updateOfficial},async()=>{if(supabase){
        await setSequenceForSong(eventId,songId,undefined,newKey);
        if(updateOfficial&&isIndividualVocal(singerId))await saveVocalKey(songId,singerId,newKey);
        const changes={};
        if(newBpm)changes.bpm=Number(newBpm);
        if(newTs)changes.time_signature=newTs;
        if(Object.keys(changes).length){const {error}=await supabase.from('songs').update(changes).eq('id',songId);if(error)throw error;}
      }
      },{pendingOffline:true});
      setEvents(evs=>evs.map(e=>e.id===eventId?{...e,keyBySong:{...e.keyBySong,[songId]:newKey}}:e));
      setSongs(list=>list.map(song=>song.id===songId?{...song,...(newBpm?{bpm:Number(newBpm)}:{}),...(newTs?{time_signature:newTs}:{}),...(updateOfficial&&isIndividualVocal(singerId)?{vocal_keys:{...song.vocal_keys,[singerId]:newKey}}:{})}:song));
      await broadcastUpdate({type:'data_changed'});notifyChanges();
    }catch(error){setSyncError(`Ajustes não salvos: ${error.message}`);throw error;}
  };

  const handleRequestDeleteEvent=useCallback(ev=>{
    if(!profile?.is_admin)return;
    setConfirmState({title:'Excluir Evento',msg:`Excluir permanentemente o evento "${ev.label}"?`,onConfirm:async()=>{
      try{await dbDelEvent(ev.id,activity.credentials);setEvents(previous=>previous.filter(item=>item.id!==ev.id));setEvSheet(null);setConfirmState(null);await broadcastUpdate({type:'data_changed'});notifyChanges();}
      catch(error){setSyncError(`Evento não excluído: ${error.message}`);setConfirmState(null);}
    },onCancel:()=>setConfirmState(null)});
  },[profile?.is_admin,activity.credentials,notifyChanges]);
  function handleDeleteSong(id){
    if(!profile?.is_admin)return;
    setConfirmState({title:'Excluir Música',msg:'Excluir permanentemente esta música?',onConfirm:async()=>{
      try{await dbDelSong(id,activity.credentials);setSongs(previous=>previous.filter(song=>song.id!==id));setSelSong(null);setConfirmState(null);await broadcastUpdate({type:'data_changed'});notifyChanges();}
      catch(error){setSyncError(`Música não excluída: ${error.message}`);setConfirmState(null);}
    },onCancel:()=>setConfirmState(null)});
  }

  async function handleSaveEvent(evs){
    if(!profile?.is_admin)return;
    const toAdd=(Array.isArray(evs)?evs:[evs]).map(withoutRehearsalSongs);
    try {
      const currentMembers=allMembers;
      const conflicts=toAdd.flatMap(event=>rosterConflicts(event,currentMembers||allMembers,events.find(previous=>previous.id===event.id)).map(conflict=>conflict.name+' · '+event.date+' · '+conflict.reason));
      if(conflicts.length)throw new Error('Há integrantes indisponíveis. Revise a equipe: '+conflicts.join('; '));
      for(const ev of toAdd){
        ev.items=ev.items?.length?ev.items:(ev.songs||[]).map(song_id=>({type:'song',song_id,singer_id:ev.singerBySong?.[song_id]||null,text:''}));
        ev.songs=ev.items.filter(item=>item.type==='song').map(item=>item.song_id);
        if(!isSetlistConfirmed(ev,songs))ev.setlist_confirmation=null;

      }
      await offlineAction('create_event',toAdd,async()=>{for(const ev of toAdd){if(supabase){await upsertEvent(eventPayload(ev));await setEventItems(ev.id,ev.items,ev.members||[],ev);}}},{pendingOffline:true},profile.id,{base:Object.fromEntries(toAdd.map(event=>[event.id,events.find(previous=>previous.id===event.id)||null]))});
      setEvents(prev=>{const next=[...prev];for(const ev of toAdd){const index=next.findIndex(row=>row.id===ev.id);if(index<0)next.push(ev);else next[index]=ev;}return next;});
      setCreateEvOpen(false);setEditEvState(null);spawnConfetti();
      await broadcastUpdate({type:'data_changed'});notifyChanges();
    }catch(error){setSyncError(`Evento não salvo: ${error.message}`);throw error;}
  }

  async function handleSetSequence(evId, songId, seqStr){
    if(!profile?.is_admin)return;
    try {
      await offlineAction('sequence',{eventId:evId,songId,text:seqStr},()=>setSequenceForSong(evId,songId,seqStr),{pendingOffline:true});
      setEvents(evs => evs.map(e => e.id === evId ? {...e, sequenceBySong: {...(e.sequenceBySong||{}), [songId]:seqStr}} : e));
      await broadcastUpdate({type:'data_changed'});notifyChanges();
    } catch(err) {
      setSyncError(`Sequência não salva: ${err.message}`);
    }
  }



  async function handleChangesSaved(){
    const [freshSongs,freshEvents]=await Promise.all([fetchSongs(),fetchEvents()]);
    const pending=jobsFor(profile.id);if(freshSongs)setSongs(overlayWorkspace(freshSongs,[],pending).songs);
    if(freshEvents)setEvents(overlayWorkspace([],freshEvents.map(normalizeEvent),pending).events);
    await broadcastUpdate({type:'data_changed'});notifyChanges();
  }
  async function handleSaveSong(song){
    if(!canManageMinistry(profile)){
      const existing=songRecords.some(record=>record.id===song.id);
      return new Promise((resolve,reject)=>setChangeDraft({kind:existing?'song_edit':'song_create',song:{...song,id:song.id||crypto.randomUUID()},proposal:songProposal(song,!existing),resolve,reject}));
    }
    const newSong={...song,id:song.id||crypto.randomUUID(),created_at:song.created_at||new Date().toISOString()};
    try{
      const saved=await offlineAction('save_song',newSong,()=>supabase?upsertSong({...newSong,created_by:profile?.id}):newSong,{...newSong,_pendingOffline:true},profile.id,{base:songRecords.find(record=>record.id===newSong.id)||null});
      if(!saved)throw new Error('Não foi possível salvar a música.');
      setSongs(prev=>prev.some(row=>row.id===newSong.id)?prev.map(row=>row.id===newSong.id?saved:row):[...prev,saved]);
      setAddOpen(false);spawnConfetti();await broadcastUpdate({type:'data_changed'});notifyChanges();
      return saved;
    }catch(error){setSyncError(`Música não salva: ${error.message}`);throw error;}
  }
  async function handleSaveVocalKey(songId,singerId,key){
    if(!canManageMinistry(profile)){
      if(singerId!==profile?.id||selEvent?.singerBySong?.[songId]!==profile.id||!selEvent.members?.includes(profile.id)){setSyncError('Solicite tons na escala em que você é o vocal principal.');return;}
      setChangeDraft({kind:'key',song:songs.find(song=>song.id===songId),event:selEvent,proposal:{key}});return;
    }
    try{
      const keys=await offlineAction('vocal_key',{songId,singerId,key},()=>saveVocalKey(songId,singerId,key),{...songs.find(song=>song.id===songId)?.vocal_keys,[singerId]:key});
      setSongs(prev=>prev.map(song=>song.id===songId?{...song,vocal_keys:keys||{...song.vocal_keys,[singerId]:key}}:song));
      await broadcastUpdate({type:'data_changed'});notifyChanges();
    }catch(error){setSyncError(`Tom vocal não salvo: ${error.message}`);}
  }

  async function sendAI(msg=''){
    const txt=(msg||aiIn).trim();if(!txt||aiRequestRef.current||aiCount>=10||!canSeeScreen(profile,'ia'))return;
    const controller=new AbortController();aiRequestRef.current=controller;setAiLoad(true);
    const clean=aiMsgs.filter(message=>!message.err&&!message.pending);
    const messages=clean.at(-1)?.r==='u'&&clean.at(-1)?.c===txt?clean:[...clean,{r:'u',c:txt}];
    setAiMsgs(messages);
    const catalog=songs.map(song=>`${song.title} (${song.artist||'Ministério'})`).join(', ').slice(0,12000);
    const system={role:'system',content:`Você é o Maestro, assistente do ministério de louvor. Use primeiro o repertório cadastrado: ${catalog}. Não afirme que uma música foi cadastrada ou um setlist confirmado; suas respostas são sugestões para revisão da liderança. Seja claro e acolhedor. Responda em português, com no máximo 220 palavras.`};
    try{
      const reply=await maestroRequest(activity.credentials,[system,...messages.slice(-8).map(message=>({role:message.r==='u'?'user':'assistant',content:message===messages.at(-1)?message.c:message.c.slice(-4000)}))],{signal:controller.signal,maxTokens:700});
      if(controller.signal.aborted)return;
      if(reply?.pendingOffline){setAiMsgs(previous=>[...previous,{r:'a',c:'Pedido salvo neste aparelho. O Maestro responderá quando a conexão voltar.',pending:true,requestId:reply.requestId}]);setAiIn('');return;}
      setAiMsgs(previous=>[...previous,{r:'a',c:reply}]);setAiCount(count=>count+1);setAiIn(value=>value.trim()===txt?'':value);
    }catch(error){if(!controller.signal.aborted){setAiMsgs(previous=>[...previous,{r:'a',c:error.message,err:true}]);setAiIn(value=>value||txt);}}
    finally{if(aiRequestRef.current===controller){aiRequestRef.current=null;setAiLoad(false);}}
  }

  /* ── Landscape lock ── */
  if(isChurchMember(profile))return <p role="status">Abrindo a comunidade da igreja…</p>;
  if(landscape){
    return(
      <div className="rotate-msg">
        <style>{CSS}</style>
        <div style={{fontSize:60,animation:'rotatePhone 2s ease-in-out infinite'}}>📱</div>
        <div style={{fontSize:20,fontWeight:900,letterSpacing:'-.02em'}}>Gire o dispositivo</div>
        <div style={{fontSize:13,opacity:.55,textAlign:'center',maxWidth:230}}>LouveSync funciona apenas no modo retrato</div>
      </div>
    );
  }

  /* ── If not logged in ── */
  if(!profile){
    return <LoginScreen members={allMembers} loading={authLoading} onLogin={handleLogin} dark={dark} setDark={setDark} onVisitor={onVisitor}/>;
  }

  const allTabs = [
    {id:'home',ico:<IcoHome s={22}/>,l:'Início'},
    {id:'repertorio',ico:<IcoMusic s={22}/>,l:'Músicas'},
    {id:'escala',ico:<IcoCal s={22}/>,l:'Escala'},
    {id:'solicitacoes',ico:<IcoEdit s={22}/>,l:'Solicitações'},
    {id:'presencas',ico:<IcoPeople s={22}/>,l:'Presenças'},
    {id:'mural',ico:<IcoMural s={22}/>,l:'Mural'},
    {id:'patrimonio',ico:<IcoBox s={22}/>,l:'Patrimônio'},
    {id:'ensaio',ico:<IcoMic s={22}/>,l:'Ensaio'},
    {id:'biblia',ico:<IcoBook s={22}/>,l:'Bíblia'},
    {id:'devocional',ico:<IcoHeart s={22}/>,l:'Devocional'},
    {id:'treinamento',ico:<IcoGuitar s={22}/>,l:'Treinar'},
    {id:'ia',ico:<IcoSpark s={22}/>,l:'Maestro'},
    {id:'membros',ico:<IcoPeople s={22}/>,l:'Membros'},
    {id:'admin',ico:<IcoPeople s={22}/>,l:'Admin'}
  ];
  const attendanceLeader=canManageAttendance(profile)&&canSeeScreen(profile,'presencas');
  const TABS=allTabs.filter(destination=>canSeeScreen(profile,destination.id));
  const tc=dark?'#F5F2FF':'#0F172A';

  return <ErrorBoundary>
  <div className={`ls${dark?' dark':''}${homeTheme?' home-theme':''}`}>
    <style>{CSS}</style>
    {/* Confetti */}
    {confetti.map(c=><div key={c.id} className="conf-p" style={{left:`${c.x}vw`,top:'-20px',width:c.size,height:c.size,background:c.color,borderRadius:c.size>10?'50%':'2px',animationDelay:`${c.dl}s`,transform:`rotate(${c.rot}deg)`}}/>)}
    {/* Background */}
    <div className={`bg ${dark?'bg-d':'bg-l'}`}>
      <div className="orb" style={{width:520,height:520,top:-180,left:-150,background:dark?'radial-gradient(circle, rgba(123,63,242,.4) 0%, transparent 70%)':'radial-gradient(circle, rgba(123,63,242,.22) 0%, transparent 70%)',animation:'oA 14s ease-in-out infinite'}}/>
      <div className="orb" style={{width:380,height:380,top:'30%',right:-100,background:dark?'radial-gradient(circle, rgba(255,107,53,.22) 0%, transparent 70%)':'radial-gradient(circle, rgba(255,107,53,.15) 0%, transparent 70%)',animation:'oB 17s ease-in-out infinite'}}/>
      <div className="orb" style={{width:420,height:420,bottom:-130,left:'5%',background:dark?'radial-gradient(circle, rgba(168,85,247,.3) 0%, transparent 70%)':'radial-gradient(circle, rgba(168,85,247,.2) 0%, transparent 70%)',animation:'oC 15s ease-in-out infinite'}}/>
      <div className="orb" style={{width:260,height:260,top:'55%',left:'35%',background:dark?'radial-gradient(circle, rgba(0,201,167,.12) 0%, transparent 70%)':'radial-gradient(circle, rgba(0,201,167,.18) 0%, transparent 70%)',animation:'oD 12s ease-in-out infinite'}}/>
    </div>
    {/* Shell */}
    <div className="app-shell">
      {stageMode&&inCifra&&<Stage metronome={metronome} song={selSong} tr={tr} mode={mode} setMode={setMode} stageFs={stageFs} setStageFs={setStageFs} dark={dark} onClose={()=>setStageMode(false)} chordColor={chordColor} setChordColor={setChordColor} fontFam={fontFam} setFontFam={setFontFam}/>}
      {!stageMode&&<>
        {/* OFFLINE BANNER */}

        {changeNotice&&<div role="status" className="change-success-notice">{changeNotice}<button type="button" aria-label="Fechar confirmação da solicitação" onClick={()=>setChangeNotice('')}>×</button></div>}
        <OfflineStatus state={{...offline,preparing:preparingOffline}}/>
        {syncError&&<div role="alert" style={{padding:10,background:'#FEF3C7',color:'#92400E',fontSize:12,flexShrink:0}}>{syncError}<button onClick={()=>{setSyncError('');offline.retry();}} style={{marginLeft:8}}>Tentar novamente</button></div>}
        {/* TOP BAR */}
        <div className="app-header" style={{padding:'11px 16px', paddingTop:'calc(var(--app-safe-top) + 11px)', display:'flex',alignItems:'center',justifyContent:'space-between',borderBottom:`1px solid ${dark?'rgba(168,85,247,.1)':'rgba(123,63,242,.06)'}`,position:'sticky',top:0,zIndex:30,flexShrink:0}}>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            {inCifra&&<button onClick={()=>{vib();backFromSong();}} style={{padding:'8px 16px',borderRadius:'var(--r-full)',border:'none',background:'rgba(123,63,242,.14)',color:'#7B3FF2',display:'flex',alignItems:'center',gap:6,fontWeight:800,fontSize:'var(--fs-sm)',cursor:'pointer',boxShadow:'0 2px 10px rgba(123,63,242,.15)'}}><IcoChevL s={16}/> Voltar</button>}
            {inCifra?<div style={{lineHeight:1.3,textAlign:'right'}}><div className="font-serif" style={{fontSize:16,fontWeight:900,color:tc}}>{String(selSong.title || 'Música Sem Título')}</div><div style={{fontSize:'var(--fs-xs)',color:dark?'#C9C3DD':'#475569'}}>{String(selSong.artist || 'Ministério')}</div></div>
            :<div style={{display:'flex',alignItems:'center',gap:10}}>
              <img src={dark?'/brand/v2/mark-white.png':'/brand/v2/mark-black.png'} alt="LouveSync" width="36" height="36" style={{objectFit:'contain',borderRadius:'22%'}} />
              <div>
                <div style={{fontSize:'var(--fs-lg)',fontWeight:900,color:tc,letterSpacing:'-.03em',lineHeight:1,backgroundImage:dark?'linear-gradient(135deg,#A855F7,#FF8C5A)':'linear-gradient(135deg,#7B3FF2,#FF6B35)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent',backgroundClip:'text'}}>Louve</div>
                <div style={{fontSize:8,color:dark?'#BDA3E3':'#76529B',fontWeight:700,letterSpacing:'.12em',textTransform:'uppercase',WebkitTextFillColor:'initial'}}>seu ministério em harmonia</div>
              </div>
            </div>}
          </div>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            {!inCifra&&<button aria-label="Notificações" onClick={()=>setNotifsOpen(true)} style={{position:'relative',width:36,height:36,borderRadius:'var(--r-sm)',border:'none',background:'rgba(123,63,242,.08)',color:'#7B3FF2',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
              <IcoBell s={18}/>{unread>0&&<div className="ndot-ring"/>}
            </button>}
            {!inCifra&&(installPrompt||(/iPad|iPhone|iPod/.test(navigator.userAgent)&&!window.matchMedia('(display-mode: standalone)').matches))&&<button className="bSec" onClick={async()=>{if(installPrompt){await installPrompt.prompt();setDeferredPrompt(null);}else alert('No Safari, toque em Compartilhar e depois em Adicionar à Tela de Início.');}}>Instalar</button>}
            {!inCifra&&<button title="Atualizar App" onClick={handleAppUpdate} style={{position:'relative',width:36,height:36,borderRadius:'var(--r-sm)',border:'none',background:'rgba(16,185,129,.12)',color:'#10B981',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
            </button>}
            {!inCifra&&<button title="Sair" onClick={handleLogout} style={{width:36,height:36,borderRadius:'var(--r-sm)',border:'none',background:'rgba(0,0,0,.05)',color:dark?'#C9C3DD':'#475569',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer'}}><IcoLogout s={15}/></button>}
            <button className={`tog${dark?' on':''}`} onClick={()=>setDark(p=>!p)} style={{background:dark?'#7B3FF2':'#CBD5E1'}} aria-label="Tema"/>
          </div>
        </div>

        {/* MAIN SCROLL */}
        <div className="app-content">
        <div ref={mainScrollRef} className="app-main" data-main-scroll data-song-open={inCifra} inert={moreOpen&&!inCifra} aria-hidden={moreOpen&&!inCifra ? true : undefined}>
          {dataLoading&&!inCifra&&(tab!=='repertorio'||!songs.length)?<Skeleton dark={dark} count={6}/>:<>
            {tab==='access-denied'&&<div className="ui-empty"><Icon name="lock"/><strong>Nenhuma tela liberada</strong><p>Peça à liderança para revisar seu acesso ao app.</p></div>}
            {tab==='home'&&!inCifra&&<Home profile={profile} dark={dark} selectedDate={homeDate} onDateChange={setHomeDate} songs={songs} events={events} members={allMembers} Avatar={Ava} onOpenEvent={openEvent} onNavTo={navTo} onSelectSong={selectSong} onSetAddOpen={setAddOpen} onConfirm={handleConfirm} spawnConfetti={spawnConfetti} onCreateEvent={date=>{if(profile?.is_admin){setCreateEvDate(typeof date==='string'?date:null);setCreateEvOpen(true);}}}/>}
            {tab==='repertorio'&&!inCifra&&<Repertorio dark={dark} songs={songs} categories={CAT} loading={dataLoading} catF={catF} setCatF={setCatF} search={search} setSearch={setSearch} keyF={keyF} setKeyF={setKeyF} favorites={favorites} onToggleFav={toggleFav} onSelectSong={selectSong} onSetAddOpen={setAddOpen}/>}
            {inCifra&&<ErrorBoundary key={selSong?.id}><Cifra dark={dark} song={selSong} event={selEvent} tr={tr} setTr={setTr} mode={mode} setMode={setMode} metronome={metronome} stageMode={stageMode} setStageMode={setStageMode} onSendAI={sendAI} onNavTo={navTo} onDeleteSong={handleDeleteSong} onSetSequence={handleSetSequence} onSaveVocalKey={handleSaveVocalKey} onSaveSong={handleSaveSong} profile={profile} members={allMembers} fontFam={fontFam}/></ErrorBoundary>}

            {tab==='solicitacoes'&&!inCifra&&<ChangeRequestsScreen dark={dark} profile={profile} credentials={activity.credentials} songs={songs} events={events} onChangeSaved={handleChangesSaved}/>}
            {tab==='mural'&&!inCifra&&<CommunityMural target={muralTarget} profile={profile} dark={dark} members={allMembers} activity={activity}/>}
            {tab==='ensaio'&&!inCifra&&<Ensaio connectionStatus={connectionStatus} dark={dark} events={events} songs={songs} members={allMembers} profile={profile}/>}
            {tab==='patrimonio'&&!inCifra&&<PatrimonioScreen members={allMembers} profile={profile} dark={dark}/>}
            {tab==='escala'&&!inCifra&&<ScheduleScreen onSetInstrument={handleSetInstrument} onSetSinger={handleSetSinger} onUpdateSongOptions={handleUpdateSongOptions} onRecordAttendance={openAttendance} setlistOnline={isOnline&&!!supabase} setlistSavingId={setlistSavingId} onSetlistConfirmation={handleSetlistConfirmation} view={scheduleView} onViewChange={setScheduleView} profile={profile} dark={dark} events={events} songs={songs} members={allMembers} Avatar={Ava} onConfirm={handleConfirm} onOpenEvent={openEvent} onEditEvent={openEventEditor} onDeleteEvent={handleRequestDeleteEvent} spawnConfetti={spawnConfetti} onCreateEvent={date=>{if(profile?.is_admin){setCreateEvDate(typeof date==='string'?date:null);setCreateEvOpen(true);}}}/>}
            {attendanceLeader&&tab==='presencas'&&!inCifra&&<AttendanceScreen key={attendanceEventId||'overview'} dark={dark} credentials={activity.credentials} events={events} online={isOnline} initialEventId={attendanceEventId} onDirtyChange={attendanceDirtyChanged} onLeave={leaveAttendance}/>}
            {tab==='membros'&&!inCifra&&<Membros profile={profile} dark={dark} members={allMembers} events={events} selRole={selRole} setSelRole={setSelRole}/>}
            {tab==='ia'&&!inCifra&&<MaestroScreen dark={dark} aiMsgs={aiMsgs} aiIn={aiIn} setAiIn={setAiIn} aiLoad={aiLoad} aiCount={aiCount} onSendAI={sendAI} profile={profile}/>}
            {tab==='devocional'&&!inCifra&&<Devocional dark={dark} profile={profile}/>}
            {tab==='treinamento'&&!inCifra&&<Treinamento dark={dark} profile={profile}/>}
            {tab==='biblia'&&!inCifra&&<Biblia dark={dark} profileId={profile?.id}/>}
            {profile?.is_admin&&tab==='admin'&&!inCifra&&<PainelAdmin onNavTo={navTo} onUpdateOwnPin={handleOwnPinChanged} dark={dark} profile={profile} events={events} members={allMembers} songs={songs} setSongs={setSongs} setConfirmState={setConfirmState} setMembers={setAllMembers} activity={activity}/>}
          </>}
        </div>
          {moreOpen&&!inCifra&&<div className="app-more-scroll"><MoreMenu tabs={TABS} currentTab={tab} onNavigate={navTo} onClose={closeMore} dark={dark}/></div>}
        </div>

        {/* BOTTOM NAV — hidden in Cifra */}
        {!inCifra&&<AppNavigation ref={navigationRef} tabs={TABS} currentTab={tab} onNavigate={navTo} dark={dark} homeTheme={homeTheme} moreOpen={moreOpen} onMoreOpen={setMoreOpen}/>}
      </>}

      {/* OVERLAYS */}
      {addOpen&&<AddSong credentials={activity.credentials} requestApproval={!canManageMinistry(profile)} dark={dark} initialData={typeof addOpen === 'object' ? addOpen : null} onSave={handleSaveSong} onClose={()=>setAddOpen(false)}/>}
      {profile?.is_admin&&createEvOpen&&!addOpen&&<CreateEvent dark={dark} members={allMembers} songs={songs} events={events} initialDate={createEvDate} editEvent={editEvState} onSave={handleSaveEvent} onClose={()=>{setCreateEvOpen(false);setCreateEvDate(null);setEditEvState(null);}}/>}
      {evSheet&&!inCifra&&!addOpen&&!createEvOpen&&<EventDetails onSetInstrument={handleSetInstrument} categories={CAT} onChangeSaved={handleChangesSaved} onRecordAttendance={openAttendance} setlistOnline={isOnline&&!!supabase} setlistSavingId={setlistSavingId} onSetlistConfirmation={handleSetlistConfirmation} key={evSheet.id} ev={evSheet} dark={dark} songs={songs} members={allMembers} profile={profile} activity={activity} onClose={()=>setEvSheet(null)} onSelectSong={(s, evParam, activeKey)=>{selectSong(s,evSheet,activeKey);setEvSheet(null);}} onConfirm={handleConfirm} onEditEv={openEventEditor} onSetSinger={handleSetSinger} onUpdateSongOptions={handleUpdateSongOptions} spawnConfetti={spawnConfetti} onReqDelEv={handleRequestDeleteEvent}/>}
      {notifsOpen&&!addOpen&&!createEvOpen&&<NotificationInbox dark={dark} controller={notifications} onClose={()=>setNotifsOpen(false)} onOpen={handleOpenNotification}/>}
      {changeDraft&&<ChangeRequestDialog dark={dark} draft={changeDraft} songs={songs} credentials={activity.credentials} onClose={()=>{changeDraft.reject?.(new Error('Solicitação cancelada.'));setChangeDraft(null);}} onSaved={async request=>{const draft=changeDraft;setChangeDraft(null);draft.resolve?.(draft.song);if(draft.resolve)setAddOpen(false);setChangeNotice('Solicitação enviada. A música vigente será mantida até a aprovação da liderança.');await handleChangesSaved();return request;}}/>}
      {confirmState&&<ConfirmDialog dark={dark} {...confirmState}/>}

      {/* Global Stage Toast Notification */}
      {stageToast && (
        <div style={{
          position: 'fixed',
          top: 'calc(env(safe-area-inset-top, 0px) + 65px)',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 'calc(100% - 32px)',
          maxWidth: 360,
          background: 'rgba(123, 63, 242, 0.94)',
          color: '#fff',
          padding: '12px 18px',
          borderRadius: 'var(--r-md)',
          boxShadow: '0 8px 30px rgba(123, 63, 242, 0.45)',
          zIndex: 99999,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          border: '1px solid rgba(255,255,255,0.15)',
          animation: 'slideUp 0.3s cubic-bezier(0.22, 1, 0.36, 1) both'
        }}>
          <span style={{fontSize: 24}}>📢</span>
          <div style={{flex: 1}}>
            <div style={{fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.75}}>Alerta de Palco: {stageToast.sender}</div>
            <div style={{fontSize: 'var(--fs-sm)', fontWeight: 800}}>{stageToast.message}</div>
          </div>
        </div>
      )}


    </div>
  </div>
  </ErrorBoundary>;
}

