import { useState, useEffect, useRef, useMemo, memo, useCallback } from 'react';
import { fetchMembers, fetchSongs, fetchEvents, upsertSong, deleteSong as dbDelSong, setPresence, setSequenceForSong, requestDeleteSong, rejectDeleteSong, supabase } from './lib/supabase';
import { findSongData, searchSongCandidates, fetchCifraClubContent, fetchCifrasComBrContent } from './lib/scraper';

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
@import url('https://fonts.cdnfonts.com/css/product-sans');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
html,body,#root{height:100%;-webkit-font-smoothing:antialiased;}
:root{
  --fs-xs:12px;--fs-sm:14px;--fs-base:16px;--fs-lg:18px;--fs-xl:22px;--fs-2xl:28px;
  --c-i:#4F46E5;--c-id:#818CF8;--c-g:#10B981;--c-a:#F59E0B;--c-p:#EC4899;--c-r:#EF4444;
  --r-sm:10px;--r-md:14px;--r-lg:18px;--r-xl:22px;--r-full:100px;
}
.ls{font-family:'Product Sans', 'DM Sans', sans-serif;height:100dvh;overflow:hidden;position:relative;}
.font-serif { font-family: 'Product Sans', 'DM Sans', sans-serif; letter-spacing: -.02em; }
.bg{position:fixed;inset:0;z-index:0;transition:background .7s;}
.bg-l{background:linear-gradient(160deg,#EEF2FF 0%,#E0F2FE 28%,#FDF4FF 58%,#ECFDF5 100%);}
.bg-d{background:linear-gradient(160deg,#05091A 0%,#0D0F2A 30%,#150A35 62%,#040D18 100%);}
.orb{position:absolute;border-radius:50%;pointer-events:none;filter:blur(100px);will-change:transform;}
@keyframes oA{0%,100%{transform:translate(0,0) scale(1)}40%{transform:translate(30px,-45px) scale(1.1)}70%{transform:translate(-15px,22px) scale(.93)}}
@keyframes oB{0%,100%{transform:translate(0,0) scale(1)}35%{transform:translate(-28px,32px) scale(.9)}70%{transform:translate(22px,-18px) scale(1.08)}}
@keyframes oC{0%,100%{transform:translate(0,0) scale(1)}55%{transform:translate(20px,28px) scale(1.06)}}
@keyframes oD{0%,100%{transform:translate(0,0) scale(1)}45%{transform:translate(-18px,-25px) scale(.95)}}
.gL0{background:rgba(255,255,255,.2);backdrop-filter:blur(30px) saturate(160%) brightness(1.1);-webkit-backdrop-filter:blur(30px) saturate(160%) brightness(1.1);border:1px solid rgba(255,255,255,.4);box-shadow:inset 0 1px 1px rgba(255,255,255,.6), inset 0 -1px 1px rgba(255,255,255,.1);}
.gL1{background:rgba(255,255,255,.25);backdrop-filter:blur(40px) saturate(180%) brightness(1.1);-webkit-backdrop-filter:blur(40px) saturate(180%) brightness(1.1);border:1px solid rgba(255,255,255,.3);box-shadow:inset 0 1px 1px rgba(255,255,255,.7), 0 8px 32px rgba(31,38,135,.07);}
.gL2{background:rgba(255,255,255,.45);backdrop-filter:blur(50px) saturate(180%) brightness(1.15);-webkit-backdrop-filter:blur(50px) saturate(180%) brightness(1.15);border-top:1px solid rgba(255,255,255,.6);box-shadow:inset 0 1px 1px rgba(255,255,255,.8), 0 -12px 56px rgba(31,38,135,.1);}
.gNav{background:rgba(255,255,255,.15);backdrop-filter:blur(12px) saturate(200%) brightness(1.2);-webkit-backdrop-filter:blur(12px) saturate(200%) brightness(1.2);border-top:1px solid rgba(255,255,255,.6);border-bottom:1px solid rgba(0,0,0,.05);border-left:1px solid rgba(255,255,255,.2);border-right:1px solid rgba(255,255,255,.2);box-shadow:inset 0 1px 1px rgba(255,255,255,.4), 0 8px 32px rgba(0,0,0,.15);}
.gIn{background:rgba(255,255,255,.15);backdrop-filter:blur(24px) saturate(150%) brightness(1.05);-webkit-backdrop-filter:blur(24px) saturate(150%) brightness(1.05);border:1px solid rgba(79,70,229,.15);border-radius:var(--r-lg);transition:border .2s,box-shadow .2s;box-shadow:inset 0 1px 2px rgba(0,0,0,.03);}
.gIn:focus-within{border-color:var(--c-i);box-shadow:inset 0 1px 2px rgba(0,0,0,.02), 0 0 0 3px rgba(79,70,229,.15);}
.dark .gL0{background:rgba(10,15,30,.25);border:1px solid rgba(255,255,255,.05);box-shadow:inset 0 1px 1px rgba(255,255,255,.1), inset 0 -1px 1px rgba(255,255,255,.02);}
.dark .gL1{background:rgba(14,18,44,.4);border:1px solid rgba(255,255,255,.05);box-shadow:inset 0 1px 1px rgba(255,255,255,.12), 0 4px 32px rgba(0,0,0,.4);}
.dark .gL2{background:rgba(6,10,24,.6);border-top:1px solid rgba(255,255,255,.08);box-shadow:inset 0 1px 1px rgba(255,255,255,.15), 0 -12px 56px rgba(0,0,0,.5);}
.dark .gNav{background:rgba(15,23,42,.3);border-top:1px solid rgba(255,255,255,.1);border-bottom:1px solid rgba(0,0,0,.5);border-left:1px solid rgba(255,255,255,.05);border-right:1px solid rgba(255,255,255,.05);box-shadow:inset 0 1px 1px rgba(255,255,255,.1), 0 8px 32px rgba(0,0,0,.5);}
.dark .gIn{background:rgba(255,255,255,.03);border-color:rgba(255,255,255,.08);box-shadow:inset 0 1px 2px rgba(0,0,0,.2);}
.dark .gIn:focus-within{border-color:var(--c-id);box-shadow:inset 0 1px 2px rgba(0,0,0,.2), 0 0 0 3px rgba(129,140,248,.15);}
.aC-jubilo{border-left:3.5px solid #10B981;}.aC-adoracao{border-left:3.5px solid #4F46E5;}
.aC-hinario{border-left:3.5px solid #F59E0B;}.aC-oferta{border-left:3.5px solid #EC4899;}
::-webkit-scrollbar{width:3px;height:3px;}::-webkit-scrollbar-thumb{background:rgba(79,70,229,.22);border-radius:2px;}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
@keyframes slideUp{from{opacity:0;transform:translateY(24px)}to{opacity:1;transform:translateY(0)}}
@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
@keyframes bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
@keyframes stageIn{from{opacity:0;transform:scale(.97)}to{opacity:1;transform:scale(1)}}
@keyframes confDrop{0%{transform:translateY(-10px) rotate(0deg);opacity:1}100%{transform:translateY(280px) rotate(560deg);opacity:0}}
@keyframes pinShake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-8px)}40%,80%{transform:translateX(8px)}}
@keyframes loginIn{from{opacity:0;transform:scale(.95) translateY(16px)}to{opacity:1;transform:scale(1) translateY(0)}}
@keyframes pulse{0%,100%{opacity:.5}50%{opacity:.2}}
.aUp{animation:slideUp .38s cubic-bezier(.22,1,.36,1) both;}
.touch-scale{transition:transform .2s cubic-bezier(.34,1.56,.64,1);cursor:pointer;}
.touch-scale:active{transform:scale(.97);}
.stage-wrap{position:fixed;inset:0;z-index:200;overflow:hidden;animation:stageIn .35s ease;}
.conf-p{position:fixed;pointer-events:none;z-index:9999;animation:confDrop 1.5s ease-out forwards;}
.bp{background:linear-gradient(135deg,#4F46E5,#6D28D9);color:#fff;border:none;border-radius:var(--r-md);padding:14px 20px;font-family:'Nunito',sans-serif;font-weight:800;font-size:var(--fs-base);cursor:pointer;width:100%;display:flex;align-items:center;justify-content:center;gap:8px;transition:all .2s;}
.bp:hover{opacity:.9;box-shadow:0 8px 28px rgba(79,70,229,.38);}.bp:active{transform:scale(.97);}.bp:disabled{opacity:.5;cursor:not-allowed;}
.bSec{border:1.5px solid rgba(79,70,229,.3);color:#4F46E5;background:rgba(79,70,229,.06);border-radius:var(--r-sm);padding:11px 16px;font-family:'Nunito',sans-serif;font-weight:700;font-size:var(--fs-sm);cursor:pointer;width:100%;transition:all .2s;display:flex;align-items:center;justify-content:center;gap:8px;}
.dark .bSec{color:#818CF8;border-color:rgba(129,140,248,.3);background:rgba(129,140,248,.06);}
.sc{border-radius:var(--r-xl);padding:16px;cursor:pointer;transition:transform .22s cubic-bezier(.34,1.56,.64,1),box-shadow .22s;margin-bottom:11px;}
.sc:hover{transform:translateY(-3px);box-shadow:0 16px 36px rgba(79,70,229,.14);}.sc:active{transform:scale(.97);}
.nb{display:flex;flex-direction:column;align-items:center;gap:4px;padding:10px 14px;border:none;background:transparent;cursor:pointer;position:relative;transition:transform .15s;}
.nb:active{transform:scale(.9);}.nb .ni{transition:transform .28s cubic-bezier(.34,1.56,.64,1);}.nb.on .ni{transform:scale(1.18);}
.nl{font-size:10px;font-weight:700;letter-spacing:.02em;font-family:'Nunito',sans-serif;transition:color .2s;}
.ndot{position:absolute;bottom:3px;left:50%;transform:translateX(-50%);height:3px;border-radius:100px;transition:width .32s cubic-bezier(.34,1.56,.64,1);}
.chord{font-family:'JetBrains Mono',monospace;color:#F59E0B;font-weight:800;font-size:12px;line-height:1.1;display:block;min-height:14px;}
.bdg{display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:100px;font-size:var(--fs-xs);font-weight:800;}
.bJ{background:rgba(16,185,129,.1);color:#059669;border:1px solid rgba(16,185,129,.22);}
.bA{background:rgba(79,70,229,.1);color:#4F46E5;border:1px solid rgba(79,70,229,.22);}
.bH{background:rgba(245,158,11,.1);color:#D97706;border:1px solid rgba(245,158,11,.22);}
.bO{background:rgba(236,72,153,.1);color:#DB2777;border:1px solid rgba(236,72,153,.22);}
.dark .bJ{background:rgba(16,185,129,.15);color:#34D399;}.dark .bA{background:rgba(99,102,241,.15);color:#818CF8;}
.dark .bH{background:rgba(245,158,11,.15);color:#FBBF24;}.dark .bO{background:rgba(236,72,153,.15);color:#F472B6;}
.tog{width:52px;height:28px;border-radius:100px;border:none;cursor:pointer;position:relative;flex-shrink:0;transition:background .35s;}
.tog::after{content:'';position:absolute;top:4px;left:4px;width:20px;height:20px;background:#fff;border-radius:50%;transition:transform .32s cubic-bezier(.34,1.56,.64,1);box-shadow:0 1px 5px rgba(0,0,0,.18);}
.tog.on::after{transform:translateX(24px);}
input, textarea, select, button { touch-action: manipulation; }
@keyframes shareBtn{0%{transform:scale(1)}50%{transform:scale(.9)}100%{transform:scale(1)}}
@keyframes rotatePhone{0%,100%{transform:rotate(0deg) scale(1)}45%,55%{transform:rotate(-90deg) scale(.85)}}
.rotate-msg{position:fixed;inset:0;z-index:9999;background:#05091A;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;color:#E2E8F0;}
.pbar{height:3px;border-radius:100px;background:rgba(79,70,229,.1);overflow:hidden;}
.pbar-fill{height:100%;border-radius:100px;background:linear-gradient(90deg,#4F46E5,#7C3AED);transition:width .5s ease;}
.fi{width:100%;padding:12px 14px;background:transparent;border:none;outline:none;font-family:'Nunito',sans-serif;font-size:var(--fs-base);font-weight:500;}
textarea.fi{resize:none;}.ndot-ring{position:absolute;top:-1px;right:-1px;width:9px;height:9px;background:#EF4444;border-radius:50%;border:2px solid rgba(255,255,255,.9);}
input,textarea,button{font-family:'Nunito',sans-serif;}
/* ─── DARK MODE GLOBAL ────────────────────────── */
.dark{color-scheme:dark;}
.dark .fi{color:#CBD5E1;}
.dark .fi::placeholder{color:rgba(148,163,184,.45);}
.dark .chord{color:#FBBF24;}
.dark .sc{background:linear-gradient(135deg,rgba(24,32,68,.92),rgba(18,24,52,.88));border:1px solid rgba(99,102,241,.18);box-shadow:0 2px 16px rgba(0,0,0,.35);}
.dark .sc:hover{box-shadow:0 8px 28px rgba(0,0,0,.5),0 0 0 1px rgba(99,102,241,.28);}
.dark .bp{box-shadow:0 4px 18px rgba(79,70,229,.35);}
.dark .nb{color:#94A3B8;}
.dark .nb.on .nl,.dark .nb.on .ni{color:#818CF8;}
.dark .ndot-ring{border-color:rgba(5,9,26,.9);}
.dark input[type=date],.dark input[type=time]{color-scheme:dark;color:#CBD5E1;background:transparent;}
.dark .bdg{opacity:.9;}
.dark hr,.dark [style*="height:1px"]{background:rgba(255,255,255,.07)!important;}
`;

/* ─── CONSTANTS ─────────────────────────────────────────────── */
const CAT = {
  jubilo:   { label:'Júbilo',   color:'#10B981', cls:'bJ', acc:'aC-jubilo' },
  adoracao: { label:'Adoração', color:'#4F46E5', cls:'bA', acc:'aC-adoracao' },
  hinario:  { label:'Hinário',  color:'#F59E0B', cls:'bH', acc:'aC-hinario' },
  oferta:   { label:'Oferta',   color:'#EC4899', cls:'bO', acc:'aC-oferta' },
};
const SH = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const FL = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
const TIME_SIGS = ['4/4','3/4','2/4','6/8','12/8'];
const KEYS     = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const GROQ_URL       = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL_FAST = 'llama-3.1-8b-instant';
const GROQ_MODEL_BEST = 'llama-3.3-70b-versatile';
const IcoHeart    = ({s=16,filled=false})=><svg width={s} height={s} viewBox="0 0 24 24" fill={filled?'currentColor':'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>;
const IcoScroll   = ({s=16})=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="7 11 12 16 17 11"/><polyline points="7 7 12 12 17 7"/><line x1="12" y1="20" x2="12" y2="16"/></svg>;
const IcoShare    = ({s=16})=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>;
const IcoTap      = ({s=14})=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z"/><path d="M12 6v6l4 2"/></svg>;
const IcoCalPlus  = ({s=18})=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="12" y1="14" x2="12" y2="18"/><line x1="10" y1="16" x2="14" y2="16"/></svg>;
const IcoWifi     = ({s=14,off=false})=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{off?<><line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/><path d="M10.71 5.05A16 16 0 0 1 22.56 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></>:<><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></>}</svg>;

const M = [
  { id:'aaaa0001-0001-0001-0001-000000000001', name:'Junior',       role:'Líder de Louvor', instrument:'Teclado / Vocal', avatar:'JR', color:'#4F46E5', status:'ativo', is_admin:true,  pin:'JR01', vocal_category:null },
  { id:'aaaa0002-0002-0002-0002-000000000002', name:'Ignacio',      role:'Músico',          instrument:'Baixo',          avatar:'IG', color:'#10B981', status:'ativo', is_admin:false, pin:'IG02', vocal_category:null },
  { id:'aaaa0003-0003-0003-0003-000000000003', name:'Cleide',       role:'Vocal',           instrument:'Vocal 1',        avatar:'CL', color:'#EC4899', status:'ativo', is_admin:false, pin:'CL03', vocal_category:'adoracao' },
  { id:'aaaa0004-0004-0004-0004-000000000004', name:'Sonia',        role:'Vocal',           instrument:'Vocal 2',        avatar:'SO', color:'#F59E0B', status:'ativo', is_admin:false, pin:'SO04', vocal_category:'jubilo' },
  { id:'aaaa0005-0005-0005-0005-000000000005', name:'Kassya',       role:'Vocal',           instrument:'Vocal 4',        avatar:'KA', color:'#8B5CF6', status:'ativo', is_admin:false, pin:'KA05', vocal_category:'adoracao' },
  { id:'aaaa0006-0006-0006-0006-000000000006', name:'Maria Helena', role:'Vocal',           instrument:'Back Vocal',     avatar:'MH', color:'#06B6D4', status:'ativo', is_admin:false, pin:'MH06', vocal_category:'hinario' },
  { id:'aaaa0007-0007-0007-0007-000000000007', name:'Lidia',        role:'Vocal',           instrument:'Vocal 5',        avatar:'LI', color:'#EF4444', status:'ativo', is_admin:false, pin:'LI07', vocal_category:'hinario' },
  { id:'aaaa0008-0008-0008-0008-000000000008', name:'Josi',         role:'Vocal',           instrument:'Vocal 3',        avatar:'JO', color:'#14B8A6', status:'ativo', is_admin:false, pin:'JO08', vocal_category:'jubilo' },
  { id:'aaaa0009-0009-0009-0009-000000000009', name:'Aragão',       role:'Músico',          instrument:'Violão',         avatar:'AR', color:'#F97316', status:'ativo', is_admin:false, pin:'AR09', vocal_category:null },
  { id:'aaaa0010-0010-0010-0010-000000000010', name:'Samuel',       role:'Músico',          instrument:'Bateria',        avatar:'SA', color:'#84CC16', status:'ativo', is_admin:false, pin:'SA10', vocal_category:null },
  { id:'aaaa0011-0011-0011-0011-000000000011', name:'Darci',        role:'Músico',          instrument:'Violão',         avatar:'DA', color:'#A855F7', status:'ativo', is_admin:false, pin:'DA11', vocal_category:null },
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

const MOCK_SONGS = [
  { id:'song_1', title:'Algo Novo', artist:'Kemuel', cat:'adoracao', key:'C', bpm:80, time_signature:'4/4', tags:[], ytUrl:'https://www.youtube.com/watch?v=wWU1Bn6wy9o', lyrics:'' },
  { id:'song_2', title:'Bondade de Deus', artist:'Isaias Saad', cat:'adoracao', key:'C', bpm:80, time_signature:'4/4', tags:[], ytUrl:'https://www.youtube.com/watch?v=BEkStuKw5Ow', lyrics:'' },
  { id:'song_3', title:'Consagração', artist:'Aline Barros', cat:'adoracao', key:'C', bpm:80, time_signature:'4/4', tags:[], ytUrl:'https://www.youtube.com/watch?v=YxgHK8rt52U', lyrics:'' },
  { id:'song_4', title:'Ele é Exaltado', artist:'Adhemar de Campos', cat:'adoracao', key:'C', bpm:80, time_signature:'4/4', tags:[], ytUrl:'https://www.youtube.com/watch?v=ExpGtxTmirU', lyrics:'' },
  { id:'song_5', title:'Grande é o Senhor', artist:'Adhemar de Campos', cat:'adoracao', key:'C', bpm:80, time_signature:'4/4', tags:[], ytUrl:'https://www.youtube.com/watch?v=4_rv9Jmgc78', lyrics:'' },
  { id:'song_6', title:'Um Novo Dia', artist:'Get Worship', cat:'adoracao', key:'C', bpm:80, time_signature:'4/4', tags:[], ytUrl:'https://www.youtube.com/shorts/G93VHUOJdNo', lyrics:'' },
  { id:'song_7', title:'Alfa e Ômega', artist:'Asaph Borba', cat:'adoracao', key:'C', bpm:80, time_signature:'4/4', tags:[], ytUrl:'https://www.youtube.com/watch?v=qaEZb7xI6s4', lyrics:'' },
  { id:'song_8', title:'Pra Sempre', artist:'Ministério Avivah', cat:'adoracao', key:'C', bpm:80, time_signature:'4/4', tags:[], ytUrl:'https://www.youtube.com/watch?v=ishM2o8LW94', lyrics:'' },
  { id:'song_9', title:'Aclame ao Senhor', artist:'Diante do Trono', cat:'adoracao', key:'C', bpm:80, time_signature:'4/4', tags:[], ytUrl:'https://www.youtube.com/watch?v=U4l40DvaeGw', lyrics:'' },
  { id:'song_10', title:'O Rei está voltando', artist:'Vários', cat:'hinario', key:'C', bpm:80, time_signature:'4/4', tags:[], ytUrl:'https://www.youtube.com/watch?v=ngJBfCg5vvo', lyrics:'' },
  { id:'song_11', title:'Em fervente oração', artist:'Vários', cat:'hinario', key:'C', bpm:80, time_signature:'4/4', tags:[], ytUrl:'https://www.youtube.com/watch?v=NDA420Kih1w', lyrics:'' },
  { id:'song_12', title:'A mensagem da Cruz', artist:'Vários', cat:'hinario', key:'C', bpm:80, time_signature:'4/4', tags:[], ytUrl:'https://www.youtube.com/watch?v=IsnyGI5c9Hw', lyrics:'' },
  { id:'song_13', title:'A Face Adorada', artist:'Vários', cat:'hinario', key:'C', bpm:80, time_signature:'4/4', tags:[], ytUrl:'https://www.youtube.com/watch?v=cngrsSMq8EY', lyrics:'' },
  { id:'song_14', title:'Porque Ele vive', artist:'Vários', cat:'hinario', key:'C', bpm:80, time_signature:'4/4', tags:[], ytUrl:'https://www.youtube.com/watch?v=3o1suXgQYfE', lyrics:'' },
  { id:'song_15', title:'Vencendo Vem Jesus', artist:'Vários', cat:'hinario', key:'C', bpm:80, time_signature:'4/4', tags:[], ytUrl:'https://www.youtube.com/watch?v=VA4r8ehaCcA', lyrics:'' },
  { id:'song_16', title:'Campeões da Luz', artist:'Vários', cat:'hinario', key:'C', bpm:80, time_signature:'4/4', tags:[], ytUrl:'https://www.youtube.com/watch?v=0O_x8LgKV8I', lyrics:'' },
  { id:'song_17', title:'Jesus o Bom Amigo', artist:'Vários', cat:'hinario', key:'C', bpm:80, time_signature:'4/4', tags:[], ytUrl:'https://www.youtube.com/watch?v=ddB3VVgPCow&list=RDddB3VVgPCow&start_radio=1', lyrics:'' },
  { id:'song_18', title:'Solta o cabo da nau', artist:'Vários', cat:'hinario', key:'C', bpm:80, time_signature:'4/4', tags:[], ytUrl:'https://www.youtube.com/watch?v=IYvAiV_p8Rw', lyrics:'' },
  { id:'song_19', title:'Celebre ao Rei', artist:'Unção de Deus', cat:'jubilo', key:'C', bpm:80, time_signature:'4/4', tags:[], ytUrl:'https://www.youtube.com/watch?v=QWDEb2OXcXw', lyrics:'' },
  { id:'song_20', title:'Celebrai com júbilo ao Senhor', artist:'Vários', cat:'jubilo', key:'C', bpm:80, time_signature:'4/4', tags:[], ytUrl:'https://www.youtube.com/watch?v=ZoAtsqdQG4I', lyrics:'' },
  { id:'song_21', title:'A tua glória', artist:'Fernanda Brum', cat:'jubilo', key:'C', bpm:80, time_signature:'4/4', tags:[], ytUrl:'https://www.youtube.com/watch?v=gqM9y5qcNaE', lyrics:'' },
  { id:'song_22', title:'Mil Graus', artist:'Renascer Praise', cat:'jubilo', key:'C', bpm:80, time_signature:'4/4', tags:[], ytUrl:'https://www.youtube.com/watch?v=b_qi6nUKchw', lyrics:'' },
  { id:'song_23', title:'Videira', artist:'Claudio Claro', cat:'jubilo', key:'C', bpm:80, time_signature:'4/4', tags:[], ytUrl:'https://www.youtube.com/watch?v=dSZcCgbfZuc', lyrics:'' },
  { id:'song_24', title:'Celebrarei', artist:'Frutos do Espirito II', cat:'jubilo', key:'C', bpm:80, time_signature:'4/4', tags:[], ytUrl:'https://www.youtube.com/watch?v=Yn3OGQ84LF0', lyrics:'' },
  { id:'song_25', title:'Autoridade de Poder', artist:'Marcos Góes', cat:'jubilo', key:'C', bpm:80, time_signature:'4/4', tags:[], ytUrl:'https://www.youtube.com/watch?v=9Fjy078dHz0', lyrics:'' },
  { id:'song_26', title:'Tempo de Festa', artist:'Adhemar de Campos', cat:'oferta', key:'C', bpm:80, time_signature:'4/4', tags:[], ytUrl:'https://www.youtube.com/watch?v=8HTPhvxTMFA', lyrics:'' },
  { id:'song_27', title:'Sete vezes mais', artist:'Trazendo a Arca', cat:'oferta', key:'C', bpm:80, time_signature:'4/4', tags:[], ytUrl:'https://www.youtube.com/watch?v=62h-SLHILOU', lyrics:'' },
  { id:'song_28', title:'Tua Fidelidade', artist:'Luzia Barbosa', cat:'oferta', key:'C', bpm:80, time_signature:'4/4', tags:[], ytUrl:'', lyrics:'' },
  { id:'song_29', title:'Toda sorte de Bençãos', artist:'Davi Sacer', cat:'oferta', key:'C', bpm:80, time_signature:'4/4', tags:[], ytUrl:'https://www.youtube.com/watch?v=zCcnYP3o1rg', lyrics:'' },
];

const MOCK_EVENTS = [
  { id:'cccc0001', date:'2026-05-23', type:'consagracao', label:'Consagração', time:'08:00', theme:'Busca Matinal', songs:['song_19','song_1'], members:[M[0].id,M[1].id,M[2].id], confirmations:{}, singerBySong:{}, sequenceBySong:{}, requested_songs:[], santa_ceia_song:null },
  { id:'cccc0002', date:'2026-05-23', type:'ensaio', label:'Ensaio Geral', time:'15:00', theme:null, songs:['song_19','song_10','song_1','song_26'], members:[M[0].id,M[1].id,M[6].id,M[8].id], confirmations:{}, singerBySong:{}, sequenceBySong:{}, requested_songs:[], santa_ceia_song:null },
  { id:'cccc0003', date:'2026-05-24', type:'ebd', label:'EBD', time:'09:00', theme:'Escola Bíblica Dominical', songs:['song_20','song_11'], members:[M[0].id,M[2].id,M[4].id], confirmations:{}, singerBySong:{}, sequenceBySong:{}, requested_songs:[], santa_ceia_song:null },
  { id:'cccc0004', date:'2026-05-24', type:'culto', label:'Culto Dominical', time:'18:00', theme:'Adoração Noturna', songs:['song_20','song_12','song_2','song_27'], members:[M[0].id,M[2].id,M[3].id,M[7].id], confirmations:{}, singerBySong:{}, sequenceBySong:{}, requested_songs:[], santa_ceia_song:'song_3' },
  { id:'cccc0005', date:'2026-05-28', type:'culto', label:'Culto de Quinta', time:'19:30', theme:'Ensinamento da Palavra', songs:['song_21','song_13','song_4','song_28'], members:[M[0].id,M[5].id,M[6].id,M[9].id], confirmations:{}, singerBySong:{}, sequenceBySong:{}, requested_songs:[], santa_ceia_song:null },
  { id:'cccc0006', date:'2026-05-30', type:'consagracao', label:'Consagração', time:'08:00', theme:'Busca Matinal', songs:['song_23','song_5'], members:[M[0].id,M[1].id,M[8].id], confirmations:{}, singerBySong:{}, sequenceBySong:{}, requested_songs:[], santa_ceia_song:null },
  { id:'cccc0007', date:'2026-05-30', type:'ensaio', label:'Ensaio', time:'15:00', theme:null, songs:['song_22','song_14','song_15','song_29'], members:M.map(m=>m.id), confirmations:{}, singerBySong:{}, sequenceBySong:{}, requested_songs:[], santa_ceia_song:null },
];

/* ─── HELPERS ───────────────────────────────────────────────── */
function tNote(n,st){let i=SH.indexOf(n);if(i===-1)i=FL.indexOf(n);if(i===-1)return n;return(n.includes('b')&&n!=='B')?FL[((i+st)%12+12)%12]:SH[((i+st)%12+12)%12];}
function tChord(ch,st){const m=ch.match(/^([A-G][#b]?)(.*?)(?:\/([A-G][#b]?)(.*))?$/);if(!m)return ch;const r=tNote(m[1],st),q=m[2]||'';if(m[3])return r+q+'/'+tNote(m[3],st)+(m[4]||'');return r+q;}
function tLyrics(txt,st){if(!st)return txt;return txt.replace(/\[([A-G][#b]?[^\]]*)\]/g,(_,c)=>'['+tChord(c,st)+']');}
function getKey(k,st){const i=SH.indexOf(k);if(i===-1)return k;return SH[((i+st)%12+12)%12];}
function fDate(ds){return new Date(ds+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'short'});}
function today(){return new Date().toISOString().slice(0,10);}
function isSundaySecond(dateStr){const d=new Date(dateStr+'T12:00:00');const dom=d.getDate();const dow=d.getDay();return dow===0&&dom>=8&&dom<=14;}
function parseLine(line){const segs=[];const parts=line.split(/(\[[^\]]+\])/);let i=0;while(i<parts.length){if(parts[i]?.startsWith('[')&&parts[i]?.endsWith(']')){const ch=parts[i].slice(1,-1);const nx=parts[i+1];const ly=(nx&&!nx.startsWith('['))?nx:'';segs.push({ch,ly});i+=(nx&&!nx.startsWith('['))?2:1;}else{if(parts[i])segs.push({ch:'',ly:parts[i]});i++;}}return segs;}
function normalizeEvent(ev){const sorted=[...(ev.event_songs||[])].sort((a,b)=>a.order_index-b.order_index);return{id:ev.id,date:ev.date,type:ev.type,label:ev.label,time:ev.time,theme:ev.theme,songs:sorted.filter(es=>es.item_type!=='note').map(es=>es.song_id),items:sorted.map(es=>({id:es.id,type:es.item_type||'song',song_id:es.song_id,text:es.note_text})),members:(ev.event_members||[]).map(em=>em.member_id),confirmations:Object.fromEntries((ev.event_members||[]).map(em=>[em.member_id,em.confirmed])),singerBySong:Object.fromEntries(sorted.filter(es=>es.item_type!=='note').map(es=>[es.song_id,es.singer_member_id])),requested_songs:ev.requested_songs||[],santa_ceia_song:ev.santa_ceia_song||null};}
function vib(){if(navigator.vibrate)navigator.vibrate(10);}

function useDraggableScroll(ref) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let isDown = false;
    let startX;
    let scrollLeft;
    
    const onMouseDown = (e) => {
      isDown = true;
      el.style.cursor = 'grabbing';
      startX = e.pageX - el.offsetLeft;
      scrollLeft = el.scrollLeft;
    };
    const onMouseLeave = () => {
      isDown = false;
      el.style.cursor = 'pointer';
    };
    const onMouseUp = () => {
      isDown = false;
      el.style.cursor = 'pointer';
    };
    const onMouseMove = (e) => {
      if (!isDown) return;
      e.preventDefault();
      const x = e.pageX - el.offsetLeft;
      const walk = (x - startX) * 2;
      el.scrollLeft = scrollLeft - walk;
    };

    el.addEventListener('mousedown', onMouseDown);
    el.addEventListener('mouseleave', onMouseLeave);
    el.addEventListener('mouseup', onMouseUp);
    el.addEventListener('mousemove', onMouseMove);

    return () => {
      el.removeEventListener('mousedown', onMouseDown);
      el.removeEventListener('mouseleave', onMouseLeave);
      el.removeEventListener('mouseup', onMouseUp);
      el.removeEventListener('mousemove', onMouseMove);
    };
  }, [ref]);
}

function generateDynamicSetlist(eventDate, eventType, allSongs, recentEvents=[], requestedSongs=[], santaCeiaSong=null){
  // Returns array of song IDs for dynamic setlist based on event type
  if(eventType!=='culto'||!allSongs.length)return [];
  const isQuinta=new Date(eventDate+'T12:00:00').getDay()===4;
  const isDomingo=new Date(eventDate+'T12:00:00').getDay()===0;
  const isSecondSunday=isDomingo&&isSundaySecond(eventDate);
  
  const recentSongs = new Set();
  const dObj = new Date(eventDate+'T12:00:00');
  const dMin = new Date(dObj);
  dMin.setDate(dMin.getDate() - 21);
  const dMinStr = dMin.toISOString().slice(0,10);
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
  
  // Fill remaining slots
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
  
  // Add Santa Ceia if applicable (2nd Sunday)
  if(isSecondSunday && santaCeiaSong && !selected.includes(santaCeiaSong)){
    selected.push(santaCeiaSong);
  }
  
  return selected.slice(0,8); // Max 8 songs
}

function getWeekRange(offset=0){const now=new Date();const day=now.getDay()||7;const mon=new Date(now);mon.setDate(now.getDate()-day+1+offset*7);mon.setHours(0,0,0,0);const sun=new Date(mon);sun.setDate(mon.getDate()+6);sun.setHours(23,59,59,999);return{mon,sun};}
function getWeekLabel(offset){if(offset===0)return'Esta semana';if(offset===-1)return'Semana passada';if(offset===1)return'Próxima semana';const{mon,sun}=getWeekRange(offset);return`${mon.toLocaleDateString('pt-BR',{day:'2-digit',month:'short'})} – ${sun.toLocaleDateString('pt-BR',{day:'2-digit',month:'short'})}`;}

/* ─── SVG ICONS ─────────────────────────────────────────────── */
const IcoHome    = ({s=22})=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>;
const IcoMusic   = ({s=22})=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>;
const IcoCal     = ({s=22})=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
const IcoPeople  = ({s=22})=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>;
const IcoSpark   = ({s=22})=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>;
const IcoBell    = ({s=20})=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>;
const IcoChevL   = ({s=18})=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>;
const IcoChevR   = ({s=18})=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>;
const IcoTrash   = ({s=16})=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>;
const IcoGuitar  = ({s=16})=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11.11 8.89L4 16l-1 3 3-1 7.11-7.11"/><path d="M14 7l3-3 1 1-3 3"/><circle cx="14.5" cy="9.5" r="2.5"/></svg>;
const IcoPlus    = ({s=16})=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
const IcoCheck   = ({s=14})=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>;
const IcoX       = ({s=14})=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>;
const IcoArrowUp = ({s=18})=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>;
const IcoBook    = ({s=14})=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>;
const IcoLogout  = ({s=16})=><svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>;

/* ─── ATOMS ─────────────────────────────────────────────────── */
const Ava = memo(({m,size=36,ring=false})=><div style={{width:size,height:size,borderRadius:'50%',background:m.color,color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:size*.32,fontWeight:900,flexShrink:0,border:ring?'2.5px solid rgba(255,255,255,.9)':`${size>30?2:1.5}px solid rgba(255,255,255,.8)`,boxShadow:`0 2px 10px ${m.color}50`}}>{m.avatar}</div>);
const Bdg = ({cat})=>{const c=CAT[cat];return <span className={`bdg ${c.cls}`}>{c.label}</span>;};
const KeyChip = ({k,size=11})=><span style={{background:'rgba(79,70,229,.1)',color:'#4F46E5',border:'1px solid rgba(79,70,229,.2)',borderRadius:100,padding:`${size<12?2:3}px ${size<12?8:12}px`,fontSize:size,fontWeight:800,fontFamily:"'JetBrains Mono',monospace",flexShrink:0}}>{k}</span>;
const BpmChip = ({bpm})=><span style={{background:'rgba(245,158,11,.1)',color:'#D97706',border:'1px solid rgba(245,158,11,.2)',borderRadius:100,padding:'2px 8px',fontSize:'var(--fs-xs)',fontWeight:700}}>♩{bpm}</span>;
const TimeSigChip = ({ts})=><span style={{background:'rgba(16,185,129,.08)',color:'#059669',border:'1px solid rgba(16,185,129,.2)',borderRadius:100,padding:'2px 8px',fontSize:'var(--fs-xs)',fontWeight:700,fontFamily:"'JetBrains Mono',monospace"}}>{ts}</span>;
const Loader = ()=><div style={{width:20,height:20,borderRadius:'50%',border:'2.5px solid rgba(79,70,229,.2)',borderTopColor:'#4F46E5',animation:'spin .7s linear infinite'}}/>;
const Skeleton = ({dark, h=60, count=3}) => <div style={{display:'flex', flexDirection:'column', gap:10, padding:16}}>{Array.from({length:count}).map((_,i) => <div key={i} style={{height:h, borderRadius:'var(--r-md)', background:dark?'rgba(255,255,255,.05)':'rgba(0,0,0,.04)', animation:'pulse 1.5s infinite ease-in-out', animationDelay:`${i*0.15}s`}}/>)}</div>;
const Sec = ({t})=><div style={{fontSize:'var(--fs-xs)',fontWeight:900,color:'#F59E0B',letterSpacing:'.14em',textTransform:'uppercase',margin:'18px 0 6px',display:'flex',alignItems:'center',gap:6}}><div style={{width:16,height:1.5,background:'#F59E0B',opacity:.5}}/>{t}<div style={{flex:1,height:1.5,background:'#F59E0B',opacity:.5}}/></div>;
const EmptyState = ({icon,title,sub,cta,onCta})=><div style={{textAlign:'center',padding:'48px 20px',display:'flex',flexDirection:'column',alignItems:'center',gap:12}}><div style={{fontSize:40,opacity:.35}}>{icon}</div><div style={{fontWeight:800,fontSize:'var(--fs-lg)',opacity:.5}}>{title}</div>{sub&&<div style={{fontSize:'var(--fs-sm)',opacity:.35,maxWidth:220}}>{sub}</div>}{cta&&<button onClick={onCta} style={{marginTop:4,padding:'10px 22px',borderRadius:'var(--r-full)',border:'none',background:'#4F46E5',color:'#fff',fontWeight:700,fontSize:'var(--fs-sm)',cursor:'pointer'}}>{cta}</button>}</div>;
const ConfirmDialog = ({dark, title, msg, onConfirm, onCancel, isAlert}) => (
  <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,.6)', zIndex:999, display:'flex', alignItems:'center', justifyContent:'center', padding:20, backdropFilter:'blur(8px)'}}>
    <div className={`aUp ${dark?'gL2':'gL0'}`} style={{width:'100%', maxWidth:340, padding:24, borderRadius:'var(--r-xl)', background:dark?'rgba(15,23,42,.95)':'rgba(255,255,255,.95)'}}>
       <div className="font-serif" style={{fontSize:22, fontWeight:900, marginBottom:8, color:dark?'#F1F5F9':'#0F172A'}}>{title}</div>
       <div style={{fontSize:'var(--fs-sm)', color:dark?'#94A3B8':'#475569', marginBottom:24, lineHeight:1.5}}>{msg}</div>
       <div style={{display:'flex', gap:10}}>
         {!isAlert&&<button onClick={()=>{vib();if(onCancel)onCancel();}} style={{flex:1, padding:'10px', borderRadius:'var(--r-full)', border:'none', background:dark?'rgba(255,255,255,.1)':'rgba(0,0,0,.05)', color:dark?'#E2E8F0':'#0F172A', fontWeight:700, cursor:'pointer'}}>Cancelar</button>}
         <button onClick={()=>{vib();onConfirm();}} style={{flex:1, padding:'10px', borderRadius:'var(--r-full)', border:'none', background:'#4F46E5', color:'#fff', fontWeight:800, cursor:'pointer'}}>OK</button>
       </div>
    </div>
  </div>
);

/* ─── LYRIC VIEW ────────────────────────────────────────────── */
const LyricView = memo(({text,st=0,mode='chords',dark,fs=17})=>{
  const tc=dark?'#E2E8F0':'#1E293B';
  const lines=tLyrics(text,st).split('\n');
  return <div style={{fontFamily:"'Montserrat',sans-serif"}}>{lines.map((line,li)=>{
    if(!line.trim())return <div key={li} style={{height:8}}/>;
    let secMatch = line.trim().match(/^\[?(Verso|Coro|Refrão|Pré-Refrão|Pré-Coro|Ponte|Intro|Final|Outro|Bridge|Primeira Parte|Segunda Parte|Terceira Parte|Quarta Parte)[\s:]?(\d*)\]?$/i);
    if(secMatch)return <Sec key={li} t={(secMatch[1] + (secMatch[2]?` ${secMatch[2]}`:'')).toUpperCase()}/>;
    if(mode==='lyrics'||!line.includes('['))return <div key={li} style={{fontSize:fs,lineHeight:1.8,color:tc,marginBottom:1,whiteSpace:'pre-wrap'}}>{line.replace(/\[[^\]]+\]/g,'')}</div>;
    
    // Check if line is ONLY chords and spaces (common in CifraClub imports)
    const isOnlyChords = /^(\s*\[[^\]]+\]\s*)+$/.test(line);
    if(isOnlyChords) {
       // Render the line as a single pre-formatted text with chords highlighted
       return <div key={li} style={{fontSize:fs,lineHeight:1.7,color:'#F59E0B',fontWeight:800,whiteSpace:'pre',fontFamily:"'JetBrains Mono',monospace",marginBottom:-6}}>{line.replace(/\[|\]/g,'')}</div>;
    }
    
    return <div key={li} style={{display:'flex',flexWrap:'wrap',marginBottom:5,alignItems:'flex-end'}}>{parseLine(line).map((seg,si)=><span key={si} style={{display:'inline-flex',flexDirection:'column',alignItems:'flex-start'}}><span className="chord">{seg.ch||' '}</span><span style={{fontSize:fs,lineHeight:1.7,color:tc,whiteSpace:'pre'}}>{seg.ly||(seg.ch?' ':'')}</span></span>)}</div>;
  })}</div>;
});

/* ─── BIBLIA ────────────────────────────────────────────────── */
const Biblia = memo(({dark})=>{
  const tc=dark?'#E2E8F0':'#0F172A', t2=dark?'#94A3B8':'#475569';
  const gc='gL1', CS={borderRadius:'var(--r-xl)',padding:20,marginBottom:16};

  const [books] = useState(BIBLE_BOOKS);
  const [selBook, setSelBook] = useState('');
  const [selChapter, setSelChapter] = useState(null);
  const [verses, setVerses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSelectBook = (bId) => {
    setSelBook(bId); setSelChapter(null); setVerses([]); setError(null);
  };

  const chapters = useMemo(() => {
    const b = books.find(x => x.a === selBook);
    return b ? b.c : 0;
  }, [selBook, books]);

  const handleSelectChapter = (ch) => {
    setSelChapter(ch); setVerses([]); setError(null); setLoading(true);
    fetch(`https://bible-api.com/${selBook}+${ch}?translation=almeida`)
      .then(res=>res.json())
      .then(data=>{
         if (data.verses) {
           setVerses(data.verses.map(v => ({ number: v.verse, text: v.text.trim() })));
         } else {
           setError('Capítulo não encontrado.');
         }
      })
      .catch(()=>{
         setError('Falha na conexão com a Bíblia.');
      })
      .finally(() => setLoading(false));
  };

  return <div style={{padding:16, paddingBottom:'calc(96px + env(safe-area-inset-bottom))', paddingTop:'env(safe-area-inset-top)'}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}} className="aUp">
      <div style={{fontSize:'var(--fs-xl)',fontWeight:900,color:tc,letterSpacing:'-.02em',display:'flex',alignItems:'center',gap:8}}><IcoBook s={20}/>Bíblia Sagrada</div>
    </div>
    
    <div className={`${gc} aUp`} style={{...CS, display:'flex', flexDirection:'column', gap:10}}>
      <div style={{fontSize:'var(--fs-xs)',fontWeight:800,color:t2,textTransform:'uppercase',letterSpacing:'.1em'}}>Selecione o Livro</div>
      <div className="gIn"><select className="fi" value={selBook} onChange={e=>handleSelectBook(e.target.value)} style={{color:tc,padding:'10px'}}>
         <option value="">Escolha um livro...</option>
         {books.map(b=><option key={b.a} value={b.a}>{b.n}</option>)}
      </select></div>

      {chapters > 0 && <>
        <div style={{fontSize:'var(--fs-xs)',fontWeight:800,color:t2,textTransform:'uppercase',letterSpacing:'.1em',marginTop:10}}>Capítulo</div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap',maxHeight:140,overflowY:'auto',paddingRight:5}}>
           {Array.from({length:chapters}, (_,i)=>i+1).map(c=>(
              <button key={c} onClick={()=>handleSelectChapter(c)} style={{width:40,height:40,borderRadius:'var(--r-sm)',border:'none',background:selChapter===c?'#4F46E5':'rgba(79,70,229,.1)',color:selChapter===c?'#fff':'#4F46E5',fontWeight:800,fontSize:'var(--fs-sm)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',transition:'all .15s'}}>{c}</button>
           ))}
        </div>
      </>}
    </div>

    {loading && <div style={{textAlign:'center',padding:30}}><Loader/></div>}
    {error && <div style={{textAlign:'center',color:'#EF4444',fontWeight:700,fontSize:'var(--fs-sm)'}}>{error}</div>}

    {verses.length > 0 && !loading && <div className={`${gc} aUp`} style={{...CS}}>
       <div style={{fontSize:24,fontWeight:900,color:tc,marginBottom:16,textAlign:'center'}}>{books.find(b=>b.a===selBook)?.n} {selChapter}</div>
       <div style={{display:'flex',flexDirection:'column',gap:12}}>
          {verses.map((v)=>(
             <div key={v.number} style={{display:'flex',gap:10,lineHeight:1.7}}>
                <span style={{fontSize:'var(--fs-xs)',fontWeight:800,color:'#4F46E5',minWidth:20,textAlign:'right',paddingTop:3}}>{v.number}</span>
                <span style={{fontSize:'var(--fs-sm)',color:tc}}>{v.text}</span>
             </div>
          ))}
       </div>
    </div>}
  </div>;
});

/* ─── DEVOCIONAL ────────────────────────────────────────────── */
const Devocional = memo(({dark})=>{
  const tc=dark?'#E2E8F0':'#0F172A', t2=dark?'#94A3B8':'#475569';
  const gc='gL1', CS={borderRadius:'var(--r-xl)',padding:20,marginBottom:16};
  
  const content = [
    { type: 'podcast', title: 'O coração do Ministro', theme: 'Liderança', desc: 'Podcast JesusCopy - Refletindo sobre a verdadeira adoração e os perigos de buscar os holofotes.', spotifyId: '5bU5h2C3N4957pE5FjUa7P', embedType: 'show' },
    { type: 'text', title: 'Comunidade: Onde a Graça Opera', theme: 'Comunhão', author: 'Baseado em John Wesley', text: 'A fé cristã é essencialmente social. Quando nos reunimos para ensaiar, estamos praticando a disciplina do amor mútuo. As discordâncias no tom da música ou no volume da bateria são oportunidades para exercer a paciência e suportar uns aos outros em amor. A adoração perfeita não vem de notas executadas sem erro, mas de corações unidos em uma única voz.'},
    { type: 'video', title: 'A Essência da Adoração', theme: 'Devocional', desc: 'Ministração Nívea Soares', ytId: 'WNnFmy-cqzg' },
    { type: 'text', title: 'O Altar Não É Palco', theme: 'Postura', author: 'C.S. Lewis', text: 'O louvor não existe para nos entreter, mas para completar a nossa alegria em Deus. Quando estamos no altar, devemos ser como janelas: as pessoas não devem olhar PARA nós, mas sim ATRAVÉS de nós, para verem a Cristo.'},
    { type: 'video', title: 'Como fluir no louvor', theme: 'Devocional', desc: 'Dicas práticas de adoração', ytId: 'BEkStuKw5Ow' }
  ];

  return <div style={{padding:16, paddingBottom:96}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}} className="aUp">
      <div style={{fontSize:'var(--fs-xl)',fontWeight:900,color:tc,letterSpacing:'-.02em',display:'flex',alignItems:'center',gap:8}}><IcoBook s={20}/>Devocional</div>
    </div>
    
    <div className={`${gc} aUp`} style={{...CS, background:'linear-gradient(135deg,rgba(79,70,229,.1),rgba(236,72,153,.05))',border:'1px solid rgba(79,70,229,.15)'}}>
      <div style={{fontSize:'var(--fs-sm)',fontWeight:800,color:'#4F46E5',textTransform:'uppercase',letterSpacing:'.1em',marginBottom:6}}>Cuidado Pastoral</div>
      <div style={{fontSize:'var(--fs-base)',fontWeight:600,color:tc,lineHeight:1.6}}>Recursos selecionados para a sua edificação espiritual antes de ministrar aos outros.</div>
    </div>

    {content.map((c,i)=><div key={i} className={`${gc} aUp`} style={{...CS,animationDelay:`${i*.1}s`, padding: c.type==='video'?12:20}}>
      <span style={{display:'inline-block',fontSize:'var(--fs-xs)',fontWeight:800,padding:'3px 10px',borderRadius:100,marginBottom:10,background:'rgba(245,158,11,.1)',color:'#D97706',border:'1px solid rgba(245,158,11,.2)'}}>{c.theme}</span>
      <div className="font-serif" style={{fontSize:18,fontWeight:900,color:tc,lineHeight:1.2,marginBottom:4}}>{c.title}</div>
      
      {c.type === 'text' && <>
        <div style={{fontSize:'var(--fs-xs)',color:t2,marginBottom:12,fontStyle:'italic'}}>Reflexão - {c.author}</div>
        <div style={{fontSize:'var(--fs-sm)',lineHeight:1.7,color:tc}}>{c.text}</div>
      </>}
      
      {c.type === 'podcast' && <>
        <div style={{fontSize:'var(--fs-xs)',color:t2,marginBottom:12}}>{c.desc}</div>
        <iframe style={{borderRadius: '12px'}} src={`https://open.spotify.com/embed/${c.embedType||'episode'}/${c.spotifyId}?utm_source=generator`} width="100%" height="152" frameBorder="0" allowFullScreen="" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>
      </>}

      {c.type === 'video' && <>
        <div style={{fontSize:'var(--fs-xs)',color:t2,marginBottom:12}}>{c.desc}</div>
        <div style={{borderRadius:'var(--r-lg)',overflow:'hidden',aspectRatio:'16/9'}}>
          <iframe width="100%" height="100%" src={`https://www.youtube.com/embed/${c.ytId}`} title={c.title} frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen></iframe>
        </div>
      </>}
    </div>)}
  </div>;
});

/* ─── TREINAMENTO ───────────────────────────────────────────── */
const Treinamento = memo(({dark, profile})=>{
  const tc=dark?'#E2E8F0':'#0F172A', t2=dark?'#94A3B8':'#475569';
  const gc='gL1', CS={borderRadius:'var(--r-xl)',padding:20,marginBottom:16};

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

  return <div style={{padding:16, paddingBottom:96}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}} className="aUp">
      <div style={{fontSize:'var(--fs-xl)',fontWeight:900,color:tc,letterSpacing:'-.02em',display:'flex',alignItems:'center',gap:8}}><IcoGuitar s={20}/>Treinamento</div>
    </div>
    
    <div className={`${gc} aUp`} style={{...CS, background:'linear-gradient(135deg,rgba(16,185,129,.1),transparent)',border:'1px solid rgba(16,185,129,.15)'}}>
      <div style={{fontSize:'var(--fs-sm)',fontWeight:800,color:'#059669',textTransform:'uppercase',letterSpacing:'.1em',marginBottom:6}}>Trilha: {isVocal ? 'Vocais' : 'Instrumentistas'}</div>
      <div style={{fontSize:'var(--fs-base)',fontWeight:600,color:tc,lineHeight:1.6}}>Conteúdos multimídia focados na sua evolução como {profile?.instrument || 'ministro'}!</div>
    </div>

    {content.map((c,i)=><div key={i} className={`${gc} aUp`} style={{...CS, animationDelay:`${i*.1}s`, padding: c.type==='video'||c.type==='podcast'?12:20}}>
      <span style={{display:'inline-block',fontSize:'var(--fs-xs)',fontWeight:800,color:'#4F46E5',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:8}}>{c.cat}</span>
      <div style={{fontSize:16,fontWeight:800,color:tc,marginBottom:8}}>{c.title}</div>
      
      {c.type === 'text' && <div style={{fontSize:'var(--fs-sm)',lineHeight:1.6,color:t2}}>{c.text}</div>}
      
      {c.type === 'podcast' && <iframe style={{borderRadius: '12px'}} src={`https://open.spotify.com/embed/${c.embedType||'episode'}/${c.id}?utm_source=generator`} width="100%" height="152" frameBorder="0" allowFullScreen="" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>}
      
      {c.type === 'video' && <div style={{borderRadius:'var(--r-lg)',overflow:'hidden',aspectRatio:'16/9'}}>
        <iframe width="100%" height="100%" src={`https://www.youtube.com/embed/${c.id}`} title={c.title} frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen></iframe>
      </div>}
    </div>)}
  </div>;
});

/* ─── PAINEL ADMIN ──────────────────────────────────────────── */
const PainelAdmin = memo(({dark, events, members, profile, songs, setSongs, setConfirmState})=>{
  const tc=dark?'#E2E8F0':'#0F172A', t2=dark?'#94A3B8':'#475569';
  const gc='gL1', CS={borderRadius:'var(--r-xl)',padding:20,marginBottom:16};
  
  const pendingDeletes = songs?.filter(s => s.delete_requested_by) || [];

  const handleApproveDelete = async (songId) => {
    setConfirmState({
      title: 'Aprovar Exclusão',
      msg: 'Aprovar e EXCLUIR definitivamente esta música?',
      onConfirm: () => {
        setSongs(s=>s.filter(x=>x.id!==songId));
        dbDelSong(songId).catch(console.error);
        setConfirmState(null);
      },
      onCancel: () => setConfirmState(null)
    });
  };

  const handleRejectDelete = async (songId) => {
    setSongs(s=>s.map(x=>x.id===songId?{...x, delete_requested_by:null}:x));
    rejectDeleteSong(songId).catch(console.error);
  };
  
  if(!profile?.is_admin) return <div style={{padding:40,textAlign:'center',color:t2}}>Acesso Restrito</div>;

  // KPIs
  const pastEvents = events.filter(e => e.date < new Date().toISOString().slice(0,10));
  const avgAttendance = pastEvents.length ? Math.round(pastEvents.reduce((acc, ev) => {
     const confirmed = Object.values(ev.confirmations).filter(v => v === true).length;
     const total = ev.members.length || 1;
     return acc + (confirmed / total * 100);
  }, 0) / pastEvents.length) : 0;

  return <div style={{padding:16, paddingBottom:96}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}} className="aUp">
      <div style={{fontSize:'var(--fs-xl)',fontWeight:900,color:tc,letterSpacing:'-.02em',display:'flex',alignItems:'center',gap:8}}><IcoPeople s={20}/>Painel Admin</div>
    </div>

    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:16}} className="aUp">
      <div className={gc} style={{padding:16,borderRadius:'var(--r-lg)',textAlign:'center'}}>
         <div style={{fontSize:28,fontWeight:900,color:'#10B981'}}>{avgAttendance}%</div>
         <div style={{fontSize:'var(--fs-xs)',color:t2,fontWeight:700,textTransform:'uppercase'}}>Engajamento Médio</div>
      </div>
      <div className={gc} style={{padding:16,borderRadius:'var(--r-lg)',textAlign:'center'}}>
         <div style={{fontSize:28,fontWeight:900,color:'#4F46E5'}}>{pastEvents.length}</div>
         <div style={{fontSize:'var(--fs-xs)',color:t2,fontWeight:700,textTransform:'uppercase'}}>Ministrações</div>
      </div>
    </div>

    {pendingDeletes.length > 0 && <div className={`${gc} aUp`} style={{...CS, border:'1px solid rgba(239,68,68,.2)'}}>
       <div style={{fontSize:'var(--fs-sm)',fontWeight:800,color:'#EF4444',marginBottom:10,textTransform:'uppercase'}}>Solicitações de Exclusão</div>
       <div style={{display:'flex',flexDirection:'column',gap:10}}>
         {pendingDeletes.map(s => {
            const reqBy = members.find(m => m.id === s.delete_requested_by)?.name || 'Usuário';
            return <div key={s.id} style={{padding:12, background:'rgba(239,68,68,.05)', borderRadius:'var(--r-md)', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
               <div>
                  <div style={{fontWeight:800,color:tc}}>{s.title}</div>
                  <div style={{fontSize:'var(--fs-xs)',color:t2}}>Pedida por: {reqBy}</div>
               </div>
               <div style={{display:'flex',gap:6}}>
                  <button onClick={()=>handleRejectDelete(s.id)} style={{padding:'6px 12px',borderRadius:100,border:'1px solid rgba(239,68,68,.3)',background:'transparent',color:'#EF4444',fontWeight:700,fontSize:'var(--fs-xs)',cursor:'pointer'}}>Recusar</button>
                  <button onClick={()=>handleApproveDelete(s.id)} style={{padding:'6px 12px',borderRadius:100,border:'none',background:'#EF4444',color:'#fff',fontWeight:700,fontSize:'var(--fs-xs)',cursor:'pointer'}}>Aprovar (Excluir)</button>
               </div>
            </div>
         })}
       </div>
    </div>}
    
    <div className={`${gc} aUp`} style={CS}>
       <div style={{fontSize:'var(--fs-sm)',fontWeight:800,color:tc,marginBottom:12}}>Comprometimento (Últimos Eventos)</div>
       {members.filter(m=>m.status==='ativo').slice(0,5).map(m=>{
          const myEvs = pastEvents.filter(e => e.members.includes(m.id));
          const presences = myEvs.filter(e => e.confirmations[m.id] === true).length;
          const rate = myEvs.length ? Math.round(presences/myEvs.length*100) : 0;
          return <div key={m.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10,padding:'6px 0',borderBottom:`1px solid ${dark?'rgba(255,255,255,.05)':'rgba(0,0,0,.05)'}`}}>
             <div style={{display:'flex',alignItems:'center',gap:10}}>
               <Ava m={m} size={28}/>
               <span style={{fontSize:'var(--fs-sm)',fontWeight:700,color:tc}}>{m.name.split(' ')[0]}</span>
             </div>
             <div style={{fontSize:'var(--fs-sm)',fontWeight:800,color:rate>70?'#10B981':rate>40?'#F59E0B':'#EF4444'}}>{rate}%</div>
          </div>
       })}
    </div>
  </div>;
});
const MetroDots = ({beatIdx,timeSignature,active,dark})=>{
  const beats=parseInt(timeSignature?.split('/')[0])||4;
  if(!active)return null;
  return <div style={{display:'flex',gap:5,justifyContent:'center',marginTop:10}}>
    {Array.from({length:beats}).map((_,i)=><div key={i} style={{width:i===0?11:8,height:i===0?11:8,borderRadius:'50%',background:beatIdx===i?(i===0?'#10B981':'#4F46E5'):(dark?'rgba(255,255,255,.15)':'rgba(0,0,0,.12)'),transition:'background .06s, transform .06s',transform:beatIdx===i?'scale(1.35)':'scale(1)',boxShadow:beatIdx===i&&i===0?'0 0 8px rgba(16,185,129,.6)':beatIdx===i?'0 0 6px rgba(79,70,229,.5)':''}}/>)}
  </div>;
};

/* ─── LOGIN SCREEN ──────────────────────────────────────────── */
const LoginScreen = memo(({members,loading,onLogin,dark,setDark})=>{
  const [step,setStep]=useState('select');
  const [sel,setSel]=useState(null);
  const [pin,setPin]=useState('');
  const [err,setErr]=useState('');
  const [shake,setShake]=useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const tc=dark?'#E2E8F0':'#0F172A';
  const t2=dark?'#94A3B8':'#64748B';

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

  function tryLogin(){
    if(!sel||!pin)return;
    const ok=onLogin(sel,pin);
    if(!ok){setErr('PIN incorreto. Tente novamente.');setPin('');setShake(true);setTimeout(()=>setShake(false),500);}
  }

  return <div className={`ls${dark?' dark':''}`} style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:24,gap:0}}>
    <style>{CSS}</style>
    <div className={`bg ${dark?'bg-d':'bg-l'}`}>
      <div className="orb" style={{width:400,height:400,top:-120,left:-100,background:dark?'rgba(79,70,229,.14)':'rgba(79,70,229,.22)',animation:'oA 14s ease-in-out infinite'}}/>
      <div className="orb" style={{width:300,height:300,bottom:-80,right:-60,background:dark?'rgba(16,185,129,.1)':'rgba(16,185,129,.16)',animation:'oB 17s ease-in-out infinite'}}/>
    </div>
    <div style={{position:'relative',zIndex:1,width:'100%',maxWidth:420,animation:'loginIn .5s cubic-bezier(.22,1,.36,1)'}}>
      {/* Header */}
      <div style={{textAlign:'center',marginBottom:32}}>
        <img src="/louve.png" alt="LouveSync" style={{height: 100, objectFit: 'contain', margin: '0 auto 14px', display: 'block', filter: 'drop-shadow(0 8px 16px rgba(0,0,0,0.1))'}} />
        {(deferredPrompt || (isIOS && !isStandalone)) && (
          <button onClick={handleInstallClick} style={{marginTop:16,padding:'8px 16px',borderRadius:'var(--r-full)',border:'none',background:'rgba(79,70,229,.1)',color:'#4F46E5',fontSize:'var(--fs-xs)',fontWeight:800,cursor:'pointer',display:'inline-flex',alignItems:'center',gap:6}}><IcoSpark s={14}/> Instalar App</button>
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
            {m.is_admin&&<span style={{fontSize:8,background:'rgba(79,70,229,.12)',color:'#4F46E5',padding:'1px 6px',borderRadius:100,fontWeight:800}}>ADMIN</span>}
          </button>)}
        </div>
      </> : <>
        <button onClick={()=>setStep('select')} style={{display:'flex',alignItems:'center',gap:6,background:'transparent',border:'none',color:t2,fontSize:'var(--fs-sm)',cursor:'pointer',marginBottom:20,fontWeight:600}}><IcoChevL s={16}/>Voltar</button>
        <div className="gL1" style={{borderRadius:'var(--r-xl)',padding:24,textAlign:'center'}}>
          <Ava m={sel} size={56} ring/>
          <div style={{fontSize:'var(--fs-lg)',fontWeight:900,color:tc,marginTop:10}}>{sel.name}</div>
          <div style={{fontSize:'var(--fs-xs)',color:t2,marginBottom:20}}>{sel.instrument}</div>
          <div style={{marginBottom:12,textAlign:'left'}}>
            <div style={{fontSize:'var(--fs-xs)',color:t2,fontWeight:700,marginBottom:8,textTransform:'uppercase',letterSpacing:'.08em'}}>Senha</div>
            <div className="gIn" style={{animation:shake?'pinShake .4s ease':''}}>
              <input className="fi" type="password" value={pin} onChange={e=>{setPin(e.target.value);setErr('');}} onKeyDown={e=>e.key==='Enter'&&tryLogin()} placeholder="Digite sua senha..." style={{color:tc,letterSpacing:'.2em',fontSize:'var(--fs-xl)'}} autoFocus/>
            </div>
            {err&&<div style={{marginTop:8,fontSize:'var(--fs-xs)',color:'#EF4444',fontWeight:700}}>{err}</div>}
          </div>
          <button className="bp" onClick={tryLogin} disabled={!pin.trim()}>Entrar</button>
        </div>
      </>}

      <div style={{display:'flex',justifyContent:'center',marginTop:24}}>
        <button className={`tog${dark?' on':''}`} onClick={()=>setDark(p=>!p)} style={{background:dark?'#4F46E5':'#CBD5E1'}} aria-label="Modo escuro"/>
      </div>
    </div>
  </div>;
});

/* ─── HOME ──────────────────────────────────────────────────── */
const Home = memo(({profile,dark,songs,events,members,onNavTo,onSelectSong,onSetAddOpen,onConfirm,spawnConfetti,onCreateEvent})=>{
  const tc=dark?'#E2E8F0':'#0F172A', t2=dark?'#94A3B8':'#475569';
  const gc='gL1', CS={borderRadius:'var(--r-xl)',padding:17,marginBottom:12};
  const todayStr=today();
  
  const upcoming=events.filter(e=>e.date>=todayStr).sort((a,b)=>a.date.localeCompare(b.date));
  const [selDay, setSelDay] = useState(todayStr);
  const selectedEvent = events.find(e => e.date === selDay);
  const nextGlobal = upcoming[0];
  const nxt = selectedEvent || nextGlobal;
  
  const nS=nxt?.songs.map(id=>songs.find(s=>s.id===id)).filter(Boolean)||[];
  const nM=nxt?.members.map(id=>members.find(m=>m.id===id)).filter(Boolean)||[];
  
  // Month carousel logic
  const monthDays = useMemo(() => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const fDayNum = firstDay.getDay() || 7;
    const startCal = new Date(firstDay);
    startCal.setDate(firstDay.getDate() - fDayNum + 1);

    const days = [];
    let cur = new Date(startCal);
    while (cur <= lastDay || (cur.getDay() || 7) !== 1) {
      days.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
      if (cur > lastDay && (cur.getDay() || 7) === 1) break;
    }
    return days;
  }, []);

  // Sync scroll to today
  const homeScrollRef = useRef(null);
  useDraggableScroll(homeScrollRef);
  useEffect(() => {
    if (homeScrollRef.current) {
       const todayEl = homeScrollRef.current.querySelector('[data-istoday="true"]');
       if (todayEl) {
           const containerCenter = homeScrollRef.current.clientWidth / 2;
           const elCenter = todayEl.offsetLeft + todayEl.clientWidth / 2;
           homeScrollRef.current.scrollTo({left: elCenter - containerCenter, behavior: 'smooth'});
       }
    }
  }, []);
  
  // Pending Confirmations Block
  const d3 = new Date();
  d3.setDate(d3.getDate() + 3);
  const d3Str = d3.toISOString().slice(0,10);
  const pendingEvents = upcoming.filter(e => e.date <= d3Str && e.members.includes(profile?.id) && e.confirmations[profile?.id] === undefined);
  const nxtPending = pendingEvents[0];

  return <div style={{padding:'16px 16px 0'}}>
    {/* Greeting */}
    <div className="aUp" style={{marginBottom:16,display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
      <div>
        <div style={{fontSize:'var(--fs-xs)',color:'#4F46E5',fontWeight:800,marginBottom:4,letterSpacing:'.08em'}}>✦ BEM-VINDO DE VOLTA</div>
        <div className="font-serif" style={{fontSize:'var(--fs-2xl)',fontWeight:900,color:tc,letterSpacing:'-.03em',lineHeight:1.1}}>{profile?.name?.split(' ')[0]||'Usuário'}<br/><span style={{opacity:.55, fontWeight:400, fontSize:'var(--fs-lg)'}}>{profile?.role||'Membro'}</span></div>
      </div>
      <div style={{textAlign:'right',paddingTop:4}}>
        <div style={{fontSize:'var(--fs-xs)',color:t2,fontWeight:700,letterSpacing:'.06em',textTransform:'uppercase',marginBottom:2}}>Hoje</div>
        <div style={{fontSize:'var(--fs-sm)',fontWeight:800,color:tc}}>{new Date().toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'short'})}</div>
      </div>
    </div>

    {/* Stats */}
    <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8,marginBottom:12}}>
      {[{v:songs.length,l:'Músicas',c:'#4F46E5'},{v:members.filter(m=>m.status==='ativo').length,l:'Membros',c:'#10B981'},{v:upcoming.filter(e=>e.type==='culto').length,l:'Cultos',c:'#F59E0B'},{v:events.reduce((acc,e)=>{const c=e.confirmations[profile?.id];return acc+(c===true?1:0);},0),l:'Confirm.',c:'#EC4899'}].map((s,i)=>
        <div key={s.l} className={`${gc} aUp`} style={{borderRadius:'var(--r-lg)',padding:'12px 6px',textAlign:'center',animationDelay:`${i*.05}s`}}>
          <div style={{fontSize:18,fontWeight:900,color:s.c,lineHeight:1}}>{s.v}</div>
          <div style={{fontSize:8,color:t2,fontWeight:700,marginTop:2}}>{s.l}</div>
        </div>)}
    </div>

    {/* Confirmações Pendentes */}
    <div className={`${gc} aUp`} style={{...CS,animationDelay:'.08s',border:'1px solid rgba(245,158,11,.2)',background:dark?'rgba(245,158,11,.04)':'rgba(245,158,11,.03)'}}>
        <div style={{fontSize:'var(--fs-xs)',fontWeight:800,color:'#F59E0B',letterSpacing:'.1em',textTransform:'uppercase',marginBottom:10,display:'flex',alignItems:'center',gap:6}}><IcoBell s={12}/> Confirmações Pendentes (Próx. 3 dias)</div>
        {nxtPending ? (
            <div>
              <div style={{fontSize:16,fontWeight:900,color:tc,lineHeight:1.2,marginBottom:4}}>{nxtPending.label}</div>
              <div style={{fontSize:'var(--fs-xs)',color:t2,marginBottom:10}}>{fDate(nxtPending.date)} · {nxtPending.time}</div>
              <div style={{display:'flex',gap:8}}>
                <button onClick={()=>{onConfirm(nxtPending.id,true);spawnConfetti();}} style={{flex:1,padding:'8px',borderRadius:'var(--r-full)',border:'none',cursor:'pointer',fontSize:'var(--fs-sm)',fontWeight:800,background:'#10B981',color:'#fff',transition:'all .2s',display:'flex',alignItems:'center',justifyContent:'center',gap:5}}><IcoCheck s={12}/>Confirmar</button>
                <button onClick={()=>onConfirm(nxtPending.id,false)} style={{flex:1,padding:'8px',borderRadius:'var(--r-full)',border:'none',cursor:'pointer',fontSize:'var(--fs-sm)',fontWeight:800,background:'#EF4444',color:'#fff',transition:'all .2s',display:'flex',alignItems:'center',justifyContent:'center',gap:5}}><IcoX s={12}/>Recusar</button>
              </div>
            </div>
        ) : (
            <div style={{fontSize:'var(--fs-sm)',color:t2,fontWeight:600,fontStyle:'italic'}}>Você já está ciente de todos os próximos eventos por enquanto...</div>
        )}
    </div>

    {/* Month carousel */}
    <div className={`${gc} aUp`} style={{...CS,animationDelay:'.06s',position:'relative'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
        <div style={{fontSize:'var(--fs-xs)',fontWeight:800,color:t2,letterSpacing:'.1em',textTransform:'uppercase',display:'flex',alignItems:'center',gap:6}}><IcoCal s={12}/>Agenda do Mês</div>
      </div>
      <div ref={homeScrollRef} style={{display:'flex',gap:6,overflowX:'auto',paddingBottom:2,scrollbarWidth:'none'}} className="hide-scroll">
        {monthDays.map(dt=>{
          const ds=dt.toISOString().slice(0,10);
          const ev=events.find(e=>e.date===ds);
          const isT=ds===todayStr;
          const isSel=ds===selDay;
          return(
          <div key={ds} data-istoday={isT} onClick={()=>{
              if(isSel && !ev) onCreateEvent(ds);
              else setSelDay(ds);
          }} style={{flexShrink:0,width:50,borderRadius:'var(--r-md)',padding:'9px 0',textAlign:'center',cursor:'pointer',background:isSel?'#4F46E5':ev?'rgba(79,70,229,.08)':'transparent',border:`1px solid ${ev&&!isSel?'rgba(79,70,229,.2)':'transparent'}`,transition:'all .2s',opacity:ev||isSel?1:.45}}>
            <div style={{fontSize:8,fontWeight:700,color:isSel?'rgba(255,255,255,.75)':t2,marginBottom:3}}>{dt.toLocaleDateString('pt-BR',{weekday:'short'}).slice(0,3).toUpperCase()}</div>
            <div style={{fontSize:18,fontWeight:900,color:isSel?'#fff':ev?'#4F46E5':tc,lineHeight:1}}>{dt.getDate()}</div>
            {ev&&<div style={{width:5,height:5,borderRadius:'50%',margin:'5px auto 0',background:isSel?'rgba(255,255,255,.8)':ev.type==='culto'?'#4F46E5':'#10B981'}}/>}
          </div>);
        })}
      </div>
    </div>

    {/* Next event */}
    {nxt&&<div className={`${gc} aUp`} style={{...CS,animationDelay:'.11s',position:'relative',overflow:'hidden'}}>
      <div style={{position:'absolute',top:0,right:0,width:100,height:100,background:'linear-gradient(135deg,rgba(79,70,229,.07),transparent)',borderRadius:'0 var(--r-xl) 0 100%'}}/>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:12}}>
        <div>
          <span style={{display:'inline-block',fontSize:'var(--fs-xs)',fontWeight:800,padding:'3px 10px',borderRadius:100,marginBottom:6,background:nxt.type==='culto'?'rgba(79,70,229,.1)':'rgba(16,185,129,.1)',color:nxt.type==='culto'?'#4F46E5':'#059669',border:`1px solid ${nxt.type==='culto'?'rgba(79,70,229,.2)':'rgba(16,185,129,.2)'}`}}>{nxt.type==='culto'?'PRÓXIMO CULTO':'PRÓXIMO ENSAIO'}</span>
          <div style={{fontSize:17,fontWeight:900,color:tc,lineHeight:1.2}}>{nxt.label}</div>
        </div>
        <div style={{textAlign:'right',flexShrink:0}}><div style={{fontSize:19,fontWeight:900,color:tc,lineHeight:1}}>{nxt.time}</div><div style={{fontSize:'var(--fs-xs)',color:t2,marginTop:2}}>{fDate(nxt.date)}</div></div>
      </div>
      {nxt.theme&&<div style={{background:'rgba(79,70,229,.06)',borderRadius:'var(--r-sm)',padding:'8px 12px',marginBottom:12,fontSize:'var(--fs-sm)',color:'#4F46E5',fontWeight:700,border:'1px solid rgba(79,70,229,.14)',display:'flex',alignItems:'center',gap:6}}><IcoBook s={12}/>  {nxt.theme}</div>}
      <div style={{marginBottom:12}}>
        <div style={{fontSize:'var(--fs-xs)',color:t2,fontWeight:800,textTransform:'uppercase',letterSpacing:'.1em',marginBottom:7}}>Setlist</div>
        {nS.map((s,i)=><div key={s.id} onClick={()=>onSelectSong(s,nxt)} className="touch-scale" style={{display:'flex',alignItems:'center',gap:9,padding:'8px 0',borderBottom:i<nS.length-1?`1px solid ${dark?'rgba(255,255,255,.05)':'rgba(0,0,0,.05)'}`:''}}> 
          <span style={{width:22,height:22,borderRadius:7,background:'rgba(79,70,229,.1)',color:'#4F46E5',fontSize:'var(--fs-xs)',fontWeight:900,display:'flex',alignItems:'center',justifyContent:'center'}}>{i+1}</span>
          <div style={{flex:1}}><div className="font-serif" style={{fontSize:16,fontWeight:800,color:tc,lineHeight:1.2}}>{s.title}</div><div style={{fontSize:'var(--fs-xs)',color:t2}}>{s.artist}</div></div>
          <KeyChip k={s.key} size={10}/>
        </div>)}
      </div>
      <div style={{display:'flex',alignItems:'center',gap:4}}>
        {nM.slice(0,7).map((m,i)=><div key={m.id} style={{marginLeft:i?-8:0,zIndex:10-i}}><Ava m={m} size={26} ring/></div>)}
        {nM.length>7&&<span style={{fontSize:'var(--fs-xs)',color:t2,marginLeft:5,fontWeight:600}}>+{nM.length-7}</span>}
        <span style={{fontSize:'var(--fs-xs)',color:t2,fontWeight:600,marginLeft:6}}>{nM.length} escalado{nM.length!==1?'s':''}</span>
      </div>
    </div>}
    {!nxt&&<EmptyState icon={<IcoCal s={32}/>} title="Nenhum evento próximo" sub="Quando houver um culto ou ensaio agendado, ele aparece aqui." cta={"Criar evento"}/>}

    {/* Quick actions */}
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12}} className="aUp">
      {[{ico:<IcoSpark s={22}/>,l:'Maestro',s:'IA de adoração',g:'linear-gradient(135deg,#4F46E5,#7C3AED)',a:()=>onNavTo('ia')},{ico:<IcoPlus s={22}/>,l:'Adicionar',s:'Nova música',g:'linear-gradient(135deg,#10B981,#059669)',a:()=>onSetAddOpen(true)}].map(a=>
        <button key={a.l} onClick={a.a} className="touch-scale" style={{padding:'16px 14px',borderRadius:'var(--r-xl)',border:'none',background:a.g,display:'flex',flexDirection:'column',alignItems:'flex-start',gap:5,boxShadow:'0 6px 20px rgba(0,0,0,.14)'}}>
          <span style={{color:'rgba(255,255,255,.85)'}}>{a.ico}</span>
          <span style={{fontSize:'var(--fs-base)',fontWeight:800,color:'#fff'}}>{a.l}</span>
          <span style={{fontSize:'var(--fs-xs)',color:'rgba(255,255,255,.7)',fontWeight:600}}>{a.s}</span>
        </button>)}
    </div>

    {/* Team strip */}
    <div className={`${gc} aUp`} style={{...CS,animationDelay:'.17s',marginBottom:20}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
        <div style={{fontSize:'var(--fs-xs)',fontWeight:800,color:t2,letterSpacing:'.1em',textTransform:'uppercase',display:'flex',alignItems:'center',gap:6}}><IcoPeople s={12}/>Equipe Ativa</div>
        <button onClick={()=>onNavTo('membros')} style={{fontSize:'var(--fs-xs)',color:'#4F46E5',fontWeight:700,border:'none',background:'transparent',cursor:'pointer'}}>Ver todos →</button>
      </div>
      <div style={{display:'flex',gap:14,overflowX:'auto',paddingBottom:2}}>
        {members.filter(m=>m.status==='ativo').slice(0,6).map(m=><div key={m.id} style={{flexShrink:0,textAlign:'center'}}>
          <Ava m={m} size={44} ring/>
          <div style={{fontSize:'var(--fs-xs)',fontWeight:700,color:tc,marginTop:5,width:46,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{m.name.split(' ')[0]}</div>
          <div style={{fontSize:8,color:t2}}>{m.instrument}</div>
        </div>)}
      </div>
    </div>
  </div>;
});

/* ─── REPERTÓRIO ────────────────────────────────────────────── */
const Repertorio = memo(({dark,songs,catF,setCatF,search,setSearch,keyF,setKeyF,favorites,onToggleFav,onSelectSong,onSetAddOpen})=>{
  const tc=dark?'#E2E8F0':'#0F172A', t2=dark?'#94A3B8':'#475569';
  const gc='gL1';
  const allKeys=useMemo(()=>[...new Set(songs.map(s=>s.key))].filter(Boolean).sort(),[songs]);
  const filtered=useMemo(()=>{let s=catF==='fav'?songs.filter(x=>favorites?.includes(x.id)):catF==='all'?songs:songs.filter(x=>x.cat===catF);if(keyF)s=s.filter(x=>x.key===keyF);if(search.trim())s=s.filter(x=>x.title.toLowerCase().includes(search.toLowerCase())||x.artist?.toLowerCase().includes(search.toLowerCase()));return s;},[songs,catF,keyF,search,favorites]);

  return <div style={{padding:16}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}} className="aUp">
      <div style={{fontSize:'var(--fs-xl)',fontWeight:900,color:tc,letterSpacing:'-.02em',display:'flex',alignItems:'center',gap:8}}><IcoMusic s={20}/>Repertório</div>
      <button onClick={()=>onSetAddOpen(true)} style={{display:'flex',alignItems:'center',gap:6,padding:'9px 16px',borderRadius:100,border:'none',background:'#4F46E5',color:'#fff',fontSize:'var(--fs-sm)',fontWeight:700,cursor:'pointer',boxShadow:'0 4px 14px rgba(79,70,229,.35)'}}><IcoPlus s={14}/>Adicionar</button>
    </div>
    <div className="gIn aUp" style={{display:'flex',alignItems:'center',gap:10,padding:'10px 16px',marginBottom:14,animationDelay:'.04s'}}>
      <span style={{opacity:.35,flexShrink:0}}><IcoMusic s={15}/></span>
      <input className="fi" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar música ou artista..." style={{color:tc,flex:1,padding:0}}/>
      {search&&<button onClick={()=>setSearch('')} style={{border:'none',background:'transparent',color:t2,cursor:'pointer',display:'flex'}}><IcoX s={14}/></button>}
    </div>
    {/* Key filter */}
    <div style={{display:'flex',gap:8,overflowX:'auto',marginBottom:8,paddingBottom:2}} className="aUp">
      <button onClick={()=>setKeyF('')} style={{flexShrink:0,padding:'5px 12px',borderRadius:100,border:'none',cursor:'pointer',background:!keyF?'rgba(245,158,11,.18)':'rgba(0,0,0,.05)',color:!keyF?'#D97706':'#475569',fontSize:'var(--fs-xs)',fontWeight:800,fontFamily:"'JetBrains Mono',monospace"}}>Todos os tons</button>
      {allKeys.map(k=><button key={k} onClick={()=>setKeyF(k===keyF?'':k)} style={{flexShrink:0,padding:'5px 10px',borderRadius:100,border:'none',cursor:'pointer',background:keyF===k?'#F59E0B':'rgba(245,158,11,.06)',color:keyF===k?'#fff':'#D97706',fontSize:'var(--fs-xs)',fontWeight:800,fontFamily:"'JetBrains Mono',monospace",transition:'all .18s'}}>{k}</button>)}
    </div>
    <div style={{display:'flex',gap:8,overflowX:'auto',marginBottom:18,paddingBottom:2}} className="aUp">
      {[{id:'fav',label:'⭐ Fav',cnt:songs.filter(s=>favorites?.includes(s.id)).length},{id:'all',label:'Todos',cnt:songs.length},...Object.entries(CAT).map(([id,c])=>({id,label:c.label,cnt:songs.filter(s=>s.cat===id).length}))].map(c=>
        <button key={c.id} onClick={()=>setCatF(c.id)} style={{flexShrink:0,padding:'7px 14px',borderRadius:100,border:'none',cursor:'pointer',background:catF===c.id?'#4F46E5':dark?'rgba(255,255,255,.08)':'rgba(79,70,229,.07)',color:catF===c.id?'#fff':tc,fontSize:'var(--fs-sm)',fontWeight:700,transition:'all .2s',boxShadow:catF===c.id?'0 4px 12px rgba(79,70,229,.3)':''}}>
          {c.label} <span style={{opacity:.55,fontSize:'var(--fs-xs)'}}>({c.cnt})</span>
        </button>)}
    </div>
    {filtered.length===0&&<EmptyState icon={<IcoMusic s={32}/>} title="Nenhuma música encontrada" sub="Tente outro termo de busca ou categoria."/>}
    {Object.entries(CAT).map(([catId,catC])=>{
      if(catF!=='all'&&catF!==catId)return null;
      const cs=filtered.filter(s=>s.cat===catId);if(!cs.length)return null;
      return <div key={catId} style={{marginBottom:22}}>
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
          <div style={{width:4,height:18,borderRadius:2,background:catC.color}}/>
          <span style={{fontSize:'var(--fs-xs)',fontWeight:900,color:catC.color,letterSpacing:'.08em',textTransform:'uppercase'}}>{catC.label}</span>
          <span style={{fontSize:'var(--fs-xs)',color:t2}}>({cs.length})</span>
        </div>
        {cs.map((s,i)=><div key={s.id} className={`${gc} sc ${catC.acc} aUp`} style={{animationDelay:`${i*.05}s`}} onClick={()=>onSelectSong(s)}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontWeight:800,fontSize:'var(--fs-base)',color:tc,marginBottom:2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.title}</div>
              <div style={{fontSize:'var(--fs-sm)',color:t2,marginBottom:8}}>{s.artist}</div>
              <div style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
                <Bdg cat={s.cat}/>
                {s.time_signature&&s.time_signature!=='4/4'&&<TimeSigChip ts={s.time_signature}/>}
                {s.tags?.slice(0,2).map(tg=><span key={tg} style={{fontSize:'var(--fs-xs)',color:t2,background:dark?'rgba(255,255,255,.07)':'rgba(0,0,0,.05)',padding:'2px 8px',borderRadius:100,fontWeight:600}}>{tg}</span>)}
              </div>
            </div>
            <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:5,marginLeft:10,flexShrink:0}}>
              <button onClick={e=>{e.stopPropagation();onToggleFav?.(s.id);}} style={{background:'transparent',border:'none',cursor:'pointer',padding:'2px 4px',fontSize:16,color:favorites?.includes(s.id)?'#F59E0B':'rgba(127,127,127,.3)',transition:'color .15s'}}>{favorites?.includes(s.id)?'★':'☆'}</button>
              <KeyChip k={s.key}/><BpmChip bpm={s.bpm}/>
            </div>
          </div>
        </div>)}
      </div>;
    })}
    <div style={{height:8}}/>
  </div>;
});

/* ─── CIFRA ─────────────────────────────────────────────────── */
const Cifra = memo(({dark,song,event,tr,setTr,mode,setMode,metro,setMetro,beatIdx,stageMode,setStageMode,onSendAI,onNavTo,onDeleteSong,onSetSequence,profile})=>{
  if(!song)return null;
  const tc=dark?'#E2E8F0':'#0F172A', t2=dark?'#94A3B8':'#475569';
  const gc='gL1', CS={borderRadius:'var(--r-xl)',padding:17,marginBottom:12};
  const curKey=getKey(song.key,tr);
  const beats=parseInt(song.time_signature?.split('/')[0])||4;
  
  const getEmbedUrl = (url) => {
    if(!url) return null;
    if(url.includes('youtube.com/watch?v=')) {
        const v = new URLSearchParams(new URL(url).search).get('v');
        return `https://www.youtube.com/embed/${v}`;
    }
    if(url.includes('youtu.be/')) {
        const v = url.split('youtu.be/')[1].split('?')[0];
        return `https://www.youtube.com/embed/${v}`;
    }
    if(url.includes('spotify.com/track/')) return url.replace('spotify.com/track/', 'open.spotify.com/embed/track/');
    return null;
  };
  const embedUrl = getEmbedUrl(song.media_url);
  
  const [seqStr, setSeqStr] = useState(event?.sequenceBySong?.[song.id] || '');
  useEffect(() => {
     if(event) setSeqStr(event.sequenceBySong?.[song.id] || '');
  }, [event, song.id]);

  return <div style={{padding:16}}>
    {/* Key info card */}
    <div className={`${gc} aUp`} style={CS}>
      <Bdg cat={song.cat}/>
      <div className="font-serif" style={{fontSize:26,fontWeight:900,color:tc,marginTop:8,letterSpacing:'-.02em',lineHeight:1.15}}>{song.title}</div>
      <div style={{fontSize:'var(--fs-sm)',color:t2,marginTop:3,marginBottom:14}}>{song.artist}</div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
        <div style={{background:'rgba(79,70,229,.07)',borderRadius:'var(--r-md)',padding:13,border:'1px solid rgba(79,70,229,.14)',textAlign:'center'}}>
          <div style={{fontSize:'var(--fs-xs)',fontWeight:800,color:t2,letterSpacing:'.1em',textTransform:'uppercase',marginBottom:4}}>Tom Atual</div>
          <div style={{fontSize:30,fontWeight:900,color:'#4F46E5',fontFamily:"'JetBrains Mono',monospace",lineHeight:1}}>{curKey}</div>
          {tr!==0&&<div style={{fontSize:'var(--fs-xs)',color:t2,marginTop:3}}>{tr>0?'+':''}{tr} st</div>}
        </div>
        <div onClick={()=>setMetro(m=>!m)} style={{background:metro?'rgba(16,185,129,.09)':'rgba(245,158,11,.07)',borderRadius:'var(--r-md)',padding:13,border:`1px solid ${metro?'rgba(16,185,129,.22)':'rgba(245,158,11,.14)'}`,textAlign:'center',cursor:'pointer',transition:'all .2s'}}>
          <div style={{fontSize:'var(--fs-xs)',fontWeight:800,color:t2,letterSpacing:'.1em',textTransform:'uppercase',marginBottom:4}}>BPM · {song.time_signature||'4/4'}</div>
          <div style={{fontSize:30,fontWeight:900,color:metro?'#10B981':'#F59E0B',fontFamily:"'JetBrains Mono',monospace",lineHeight:1,transition:'color .15s'}}>{song.bpm}</div>
          <div style={{fontSize:'var(--fs-xs)',color:metro?'#059669':t2,marginTop:3,fontWeight:700}}>{metro?'● Tocando':'● Ativar'}</div>
          <MetroDots beatIdx={beatIdx} timeSignature={song.time_signature} active={metro} dark={dark}/>
        </div>
      </div>
    </div>

    {/* Media Player */}
    {embedUrl && <div className={`${gc} aUp`} style={{...CS, padding:0, overflow:'hidden', marginBottom:12, height: song.media_url.includes('spotify') ? 80 : 200}}>
       <iframe src={embedUrl} width="100%" height="100%" frameBorder="0" allow="encrypted-media; picture-in-picture" allowFullScreen></iframe>
    </div>}

    {/* Transposer */}
    <div className={`${gc} aUp`} style={{...CS,animationDelay:'.07s'}}>
      <div style={{fontSize:'var(--fs-xs)',fontWeight:800,color:t2,textTransform:'uppercase',letterSpacing:'.1em',marginBottom:10,display:'flex',alignItems:'center',gap:6}}><IcoGuitar s={12}/>Transpositor de Tom</div>
      <div style={{display:'grid', gridTemplateColumns:'repeat(6, 1fr)', gap:6, marginBottom:8}}>
        {['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'].map(k=>{
          const isAct = curKey === k;
          return <button key={k} onClick={()=>{
             vib();
             const origIdx = SH.indexOf(song.key);
             const tgtIdx = SH.indexOf(k);
             if(origIdx!==-1 && tgtIdx!==-1) {
                let d = tgtIdx - origIdx;
                if(d > 6) d -= 12;
                if(d < -5) d += 12;
                setTr(d);
             }
          }} style={{padding:'8px 0',borderRadius:8,border:'none',cursor:'pointer',fontSize:'var(--fs-sm)',fontWeight:800,background:isAct?'#4F46E5':dark?'rgba(255,255,255,.05)':'rgba(79,70,229,.07)',color:isAct?'#fff':dark?'#E2E8F0':'#4F46E5',boxShadow:isAct?'0 4px 12px rgba(79,70,229,.32)':'',transition:'all .15s'}}>{k}</button>
        })}
      </div>
      {tr!==0&&<button onClick={()=>{vib();setTr(0);}} style={{width:'100%',padding:8,borderRadius:'var(--r-sm)',border:'none',cursor:'pointer',background:'rgba(245,158,11,.08)',color:'#D97706',fontSize:'var(--fs-sm)',fontWeight:700}}>↩ Voltar ao tom original ({song.key})</button>}
    </div>

    {/* Mode controls */}
    <div className={`${gc} aUp`} style={{...CS,animationDelay:'.1s'}}>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8}}>
        {[{l:mode==='chords'?'Cifras':'Letra',a:()=>setMode(m=>m==='chords'?'lyrics':'chords'),act:mode==='chords',c:'#4F46E5'},{l:metro?'Metro ●':'Metrônomo',a:()=>setMetro(m=>!m),act:metro,c:'#10B981'},{l:'Palco',a:()=>setStageMode(true),act:false,c:'#F59E0B'}].map((b,i)=>
          <button key={i} onClick={b.a} style={{padding:'10px 6px',borderRadius:'var(--r-md)',border:'none',cursor:'pointer',fontSize:'var(--fs-sm)',fontWeight:700,background:b.act?`${b.c}18`:'rgba(0,0,0,.04)',color:b.act?b.c:t2}}>{b.l}</button>)}
      </div>
    </div>

    {/* Sequence field if event is present */}
    {event && <div className={`${gc} aUp`} style={{...CS,animationDelay:'.12s'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
        <div style={{fontSize:'var(--fs-xs)',fontWeight:800,color:t2,textTransform:'uppercase',letterSpacing:'.1em'}}>Sequência p/ Evento</div>
        {seqStr !== (event.sequenceBySong?.[song.id] || '') && <button onClick={()=>onSetSequence(event.id, song.id, seqStr)} style={{fontSize:'var(--fs-xs)',fontWeight:800,color:'#4F46E5',background:'rgba(79,70,229,.15)',padding:'5px 12px',borderRadius:100,border:'none',cursor:'pointer'}}>Salvar</button>}
      </div>
      <div className="gIn"><input className="fi" value={seqStr} onChange={e=>setSeqStr(e.target.value)} placeholder="Ex: Intro, V1, Coro (2x), Ponte..." style={{color:tc,fontSize:'var(--fs-sm)',fontWeight:600}}/></div>
    </div>}

    {/* Lyrics */}
    <div className={`${gc} aUp`} style={{...CS,animationDelay:'.14s'}}><LyricView text={song.lyrics||''} st={tr} mode={mode} dark={dark}/></div>

    {/* AI button */}
    <button className="bp aUp" style={{marginBottom:8,animationDelay:'.18s'}} onClick={()=>{onSendAI(`Analise "${song.title}" (tom ${curKey}, ${CAT[song.cat].label}, ${song.bpm}bpm, compasso ${song.time_signature||'4/4'}) e sugira 3 músicas complementares para setlist com justificativa de fluxo.`);onNavTo('ia');}}>
      <IcoSpark s={16}/>Analisar com Maestro
    </button>
    {profile?.is_admin&&<button onClick={()=>onDeleteSong(song.id)} style={{width:'100%',marginBottom:16,padding:'11px',borderRadius:'var(--r-md)',border:'1px solid rgba(239,68,68,.22)',background:'rgba(239,68,68,.05)',color:'#DC2626',fontWeight:700,fontSize:'var(--fs-sm)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:6}}><IcoTrash s={14}/>Excluir música</button>}
    <div style={{height:16}}/>
  </div>;
});

/* ─── STAGE ─────────────────────────────────────────────────── */
const Stage = memo(({song,tr,mode,setMode,stageFs,setStageFs,dark,onClose,beatIdx})=>{
  if(!song)return null;
  const curK=getKey(song.key,tr);
  const [autoScroll,setAutoScroll]=useState(false);
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
  return <div className="stage-wrap" style={{background:dark?'#05091A':'#0A0F1E',color:'#E2E8F0',display:'flex',flexDirection:'column'}}>
    <div style={{background:dark?'rgba(5,9,26,.95)':'rgba(10,15,30,.95)',padding:'12px 16px',display:'flex',alignItems:'center',justifyContent:'space-between',flexShrink:0,borderBottom:'1px solid rgba(255,255,255,.07)'}}>
      <button onClick={onClose} style={{display:'flex',alignItems:'center',gap:6,padding:'7px 12px',borderRadius:'var(--r-sm)',border:'1px solid rgba(255,255,255,.14)',background:'rgba(255,255,255,.05)',color:'rgba(255,255,255,.7)',fontSize:'var(--fs-sm)',fontWeight:700,cursor:'pointer'}}><IcoChevL s={14}/>Sair</button>
      <div style={{textAlign:'center'}}><div className="font-serif" style={{fontSize:22,fontWeight:800,color:'#E2E8F0'}}>{song.title}</div><div style={{fontSize:'var(--fs-xs)',color:'rgba(255,255,255,.4)'}}>{song.artist}</div></div>
      <div style={{display:'flex',gap:8,alignItems:'center'}}>
        <button onClick={()=>setAutoScroll(a=>!a)} title="Auto-scroll" style={{display:'flex',alignItems:'center',gap:4,padding:'6px 10px',borderRadius:'var(--r-sm)',border:`1px solid ${autoScroll?'rgba(16,185,129,.5)':'rgba(255,255,255,.14)'}`,background:autoScroll?'rgba(16,185,129,.18)':'rgba(255,255,255,.05)',color:autoScroll?'#10B981':'rgba(255,255,255,.7)',fontSize:'var(--fs-xs)',fontWeight:700,cursor:'pointer'}}><IcoScroll s={12}/>{autoScroll?'⏹':'▶'}</button>
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
    <div ref={lyricsRef} style={{flex:1,overflowY:'auto',padding:'16px 18px 48px',scrollBehavior:'smooth'}}><LyricView text={song.lyrics||''} st={tr} mode={mode} dark={true} fs={stageFs}/></div>
  </div>;
});

/* ─── ESCALA ────────────────────────────────────────────────── */
const Escala = memo(({profile,dark,events,songs,members,onConfirm,onEvSheet,spawnConfetti,onCreateEvent})=>{
  const tc=dark?'#E2E8F0':'#0F172A', t2=dark?'#94A3B8':'#475569';
  const gc='gL1', CS={borderRadius:'var(--r-xl)',padding:17,marginBottom:12};
  const todayStr=today();

  const monthWeeks = useMemo(() => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const fDayNum = firstDay.getDay() || 7;
    const startCal = new Date(firstDay);
    startCal.setDate(firstDay.getDate() - fDayNum + 1);

    const weeks = [];
    let cur = new Date(startCal);
    while (cur <= lastDay || (cur.getDay() || 7) !== 1) {
      const w = [];
      for (let i = 0; i < 7; i++) {
        w.push(new Date(cur));
        cur.setDate(cur.getDate() + 1);
      }
      weeks.push(w);
      if (cur > lastDay) break;
    }
    return weeks;
  }, []);

  const [selWeekIdx, setSelWeekIdx] = useState(() => {
    const idx = monthWeeks.findIndex(w => w.some(d => d.toISOString().slice(0, 10) === todayStr));
    return Math.max(0, idx);
  });

  const weekEvents = useMemo(()=>{
    const w = monthWeeks[selWeekIdx];
    if(!w) return [];
    const d1 = w[0].toISOString().slice(0,10);
    const d2 = w[6].toISOString().slice(0,10);
    return events.filter(e => e.date >= d1 && e.date <= d2).sort((a,b)=>a.date.localeCompare(b.date));
  },[events, monthWeeks, selWeekIdx]);

  const confirmed=events.reduce((a,e)=>a+(e.confirmations[profile?.id]===true?1:0),0);

  // Sync scroll with index
  const scrollRef = useRef(null);
  useDraggableScroll(scrollRef);
  useEffect(()=>{
    if(scrollRef.current) {
      scrollRef.current.scrollTo({left: selWeekIdx * scrollRef.current.clientWidth, behavior:'smooth'});
    }
  }, [selWeekIdx]);

  return <div style={{padding:16}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}} className="aUp">
      <div style={{fontSize:'var(--fs-xl)',fontWeight:900,color:tc,letterSpacing:'-.02em',display:'flex',alignItems:'center',gap:8}}><IcoCal s={20}/>Escala</div>
      <button onClick={onCreateEvent} style={{display:'flex',alignItems:'center',gap:6,padding:'9px 14px',borderRadius:100,border:'none',background:'#4F46E5',color:'#fff',fontSize:'var(--fs-sm)',fontWeight:700,cursor:'pointer',boxShadow:'0 4px 14px rgba(79,70,229,.35)'}}><IcoCalPlus s={14}/>Novo</button>
    </div>

    {/* My summary */}
    <div className={`${gc} aUp`} style={{...CS,animationDelay:'.04s'}}>
      <div style={{fontSize:'var(--fs-xs)',fontWeight:800,color:t2,textTransform:'uppercase',letterSpacing:'.1em',marginBottom:10}}>Minha Confirmação</div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:10}}>
        {[{l:'Confirmados',v:confirmed,c:'#10B981'},{l:'Recusados',v:events.reduce((a,e)=>a+(e.confirmations[profile?.id]===false?1:0),0),c:'#EF4444'},{l:'Eventos',v:events.filter(e=>e.members.includes(profile?.id)).length,c:'#4F46E5'}].map(s=>
          <div key={s.l} style={{textAlign:'center',padding:'10px 6px',borderRadius:'var(--r-sm)',background:dark?'rgba(255,255,255,.04)':'rgba(0,0,0,.03)'}}>
            <div style={{fontSize:19,fontWeight:900,color:s.c,lineHeight:1}}>{s.v}</div>
            <div style={{fontSize:8,color:t2,marginTop:3,fontWeight:700}}>{s.l}</div>
          </div>)}
      </div>
      <div className="pbar"><div className="pbar-fill" style={{width:`${(confirmed/Math.max(events.filter(e=>e.members.includes(profile?.id)).length,1))*100}%`}}/></div>
    </div>

    {/* Monthly Carousel */}
    <div className="aUp" style={{marginBottom:16, animationDelay:'.07s'}}>
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10}}>
         <div style={{fontSize:'var(--fs-sm)', fontWeight:800, color:tc, textTransform:'uppercase', letterSpacing:'.1em'}}>Agenda do Mês</div>
         {selWeekIdx !== Math.max(0, monthWeeks.findIndex(w=>w.some(d=>d.toISOString().slice(0,10)===todayStr))) && 
           <button onClick={()=>setSelWeekIdx(Math.max(0, monthWeeks.findIndex(w=>w.some(d=>d.toISOString().slice(0,10)===todayStr))))} style={{fontSize:'var(--fs-xs)',color:'#4F46E5',border:'none',background:'transparent',cursor:'pointer',fontWeight:700}}>Ir para Hoje</button>}
      </div>
      <div ref={scrollRef} style={{display:'flex', overflowX:'auto', scrollSnapType:'x mandatory', scrollBehavior:'smooth', paddingBottom:5, scrollbarWidth:'none'}} className="hide-scroll"
           onScroll={e=>{
             if(e.currentTarget.style.cursor === 'grabbing') return; // Do not update selWeekIdx while dragging
             const el = e.currentTarget;
             const childWidth = el.firstChild?.clientWidth || el.clientWidth;
             const idx = Math.round(el.scrollLeft / childWidth);
             if(idx !== selWeekIdx && !isNaN(idx)) setSelWeekIdx(idx);
           }}>
        {monthWeeks.map((week, wi) => (
          <div key={wi} style={{minWidth:'100%', flexShrink:0, scrollSnapAlign:'start', display:'flex', justifyContent:'space-between', padding:'12px 14px', background:dark?'rgba(255,255,255,.04)':'rgba(255,255,255,.65)', backdropFilter:'blur(24px)', border:'1px solid rgba(79,70,229,.12)', borderRadius:'var(--r-xl)', boxSizing:'border-box'}}>
            {week.map(day => {
              const ds = day.toISOString().slice(0,10);
              const isToday = ds === todayStr;
              const hasEv = events.some(e=>e.date === ds);
              const isOtherMonth = day.getMonth() !== new Date().getMonth();
              
              return <div key={ds} onClick={()=>setSelWeekIdx(wi)} style={{display:'flex', flexDirection:'column', alignItems:'center', gap:6, opacity: isOtherMonth?0.4:1, cursor:'pointer'}}>
                <div style={{fontSize:10, fontWeight:700, color:t2, textTransform:'uppercase'}}>{day.toLocaleDateString('pt-BR',{weekday:'short'}).slice(0,3)}</div>
                <div style={{width:32, height:32, borderRadius:'50%', background:isToday?'linear-gradient(135deg,#4F46E5,#6D28D9)':hasEv?'rgba(79,70,229,.12)':'transparent', color:isToday?'#fff':tc, display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, fontWeight:800, boxShadow:isToday?'0 4px 12px rgba(79,70,229,.3)':''}}>
                  {day.getDate()}
                </div>
                <div style={{width:5, height:5, borderRadius:'50%', background:hasEv&&!isToday?'#4F46E5':'transparent'}}/>
              </div>
            })}
          </div>
        ))}
      </div>
    </div>

    {/* Events */}
    {weekEvents.length===0&&<EmptyState icon={<IcoCal s={32}/>} title="Nenhum evento esta semana" sub="Use as setas para navegar para outra semana."/>}
    {weekEvents.map((ev,ei)=>{
      const evM=ev.members.map(id=>members.find(m=>m.id===id)).filter(Boolean);
      const evS=ev.songs.map(id=>songs.find(s=>s.id===id)).filter(Boolean);
      const isMyEvent=ev.members.includes(profile?.id);
      const myConf=ev.confirmations[profile?.id];
      return <div key={ev.id} className={`${gc} aUp touch-scale`} style={{...CS,animationDelay:`${ei*.06}s`,borderLeft:`3px solid ${ev.type==='culto'?'#4F46E5':'#10B981'}`,opacity:!isMyEvent&&!profile?.is_admin?.7:1}} onClick={(e)=>{ if(e.target.tagName!=='BUTTON') onEvSheet(ev); }}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:10}}>
          <div>
            <span style={{display:'inline-block',fontSize:'var(--fs-xs)',fontWeight:800,padding:'3px 10px',borderRadius:100,marginBottom:5,background:ev.type==='culto'?'rgba(79,70,229,.1)':'rgba(16,185,129,.1)',color:ev.type==='culto'?'#4F46E5':'#059669',border:`1px solid ${ev.type==='culto'?'rgba(79,70,229,.2)':'rgba(16,185,129,.2)'}`}}>{ev.type==='culto'?'CULTO':'ENSAIO'}</span>
            <div style={{fontSize:15,fontWeight:900,color:tc}}>{ev.label}</div>
            <div style={{fontSize:'var(--fs-sm)',color:t2,marginTop:1}}>{fDate(ev.date)} · {ev.time}</div>
          </div>
          {isMyEvent&&<div style={{display:'flex',flexDirection:'column',gap:5,alignItems:'flex-end',flexShrink:0}}>
            <button onClick={()=>{onConfirm(ev.id,true);if(myConf!==true)spawnConfetti();}} style={{padding:'6px 14px',borderRadius:100,border:'none',cursor:'pointer',fontSize:'var(--fs-sm)',fontWeight:800,background:myConf===true?'#10B981':'rgba(16,185,129,.1)',color:myConf===true?'#fff':'#059669',transition:'all .2s',display:'flex',alignItems:'center',gap:5}}><IcoCheck s={12}/>Confirmar</button>
            <button onClick={()=>onConfirm(ev.id,false)} style={{padding:'6px 14px',borderRadius:100,border:'none',cursor:'pointer',fontSize:'var(--fs-sm)',fontWeight:800,background:myConf===false?'#EF4444':'rgba(239,68,68,.08)',color:myConf===false?'#fff':'#DC2626',transition:'all .2s',display:'flex',alignItems:'center',gap:5}}><IcoX s={12}/>Recusar</button>
          </div>}
        </div>
        {ev.theme&&<div style={{background:'rgba(79,70,229,.06)',borderRadius:'var(--r-sm)',padding:'7px 12px',marginBottom:10,fontSize:'var(--fs-sm)',color:'#4F46E5',fontWeight:700,border:'1px solid rgba(79,70,229,.14)',display:'flex',alignItems:'center',gap:6}}><IcoBook s={12}/>{ev.theme}</div>}
        <div style={{marginBottom:10}}>
          <div style={{fontSize:'var(--fs-xs)',color:t2,fontWeight:800,textTransform:'uppercase',letterSpacing:'.1em',marginBottom:6}}>Músicas</div>
          {evS.length===0?<div style={{fontSize:'var(--fs-xs)',color:t2,opacity:.6}}>Nenhuma música definida</div>:
          <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
            {evS.map(s=><span key={s.id} style={{padding:'4px 11px',borderRadius:100,fontSize:'var(--fs-xs)',fontWeight:700,cursor:'pointer',background:`${CAT[s.cat].color}14`,color:CAT[s.cat].color,border:`1px solid ${CAT[s.cat].color}28`}}>{s.title}</span>)}
          </div>}
        </div>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div style={{display:'flex',alignItems:'center',gap:3}}>
            {evM.length > 0 ? (
              <>
                {evM.slice(0,6).map((m,i)=><div key={m.id} style={{marginLeft:i?-7:0,zIndex:10-i}}><Ava m={m} size={24} ring/></div>)}
                {evM.length>6&&<span style={{fontSize:'var(--fs-xs)',color:t2,marginLeft:5,fontWeight:600}}>+{evM.length-6}</span>}
              </>
            ) : (
               <span style={{fontSize:'var(--fs-xs)',color:t2,fontStyle:'italic'}}>Nenhum escalado</span>
            )}
          </div>
          <button onClick={()=>onEvSheet(ev)} style={{fontSize:'var(--fs-xs)',color:'#4F46E5',border:'none',background:'transparent',cursor:'pointer',fontWeight:700}}>Ver detalhes →</button>
        </div>
      </div>;
    })}
  </div>;
});

/* ─── MEMBROS ───────────────────────────────────────────────── */
const Membros = memo(({profile,dark,members,events,selRole,setSelRole})=>{
  const tc=dark?'#E2E8F0':'#0F172A', t2=dark?'#94A3B8':'#475569';
  const gc='gL1', CS={borderRadius:'var(--r-xl)',padding:17,marginBottom:12};
  const roles=[...new Set(members.map(m=>m.instrument))].filter(Boolean);
  const filtered=selRole==='Todos'?members:members.filter(m=>m.instrument===selRole);

  return <div style={{padding:16}}>
    <div style={{fontSize:'var(--fs-xl)',fontWeight:900,color:tc,marginBottom:14,letterSpacing:'-.02em',display:'flex',alignItems:'center',gap:8}} className="aUp"><IcoPeople s={20}/>Membros</div>
    <div style={{display:'flex',gap:8,overflowX:'auto',marginBottom:14,paddingBottom:2}} className="aUp">
      {['Todos',...roles].map(r=><button key={r} onClick={()=>setSelRole(r)} style={{flexShrink:0,padding:'7px 14px',borderRadius:100,border:'none',cursor:'pointer',background:selRole===r?'#4F46E5':dark?'rgba(255,255,255,.08)':'rgba(79,70,229,.07)',color:selRole===r?'#fff':tc,fontSize:'var(--fs-sm)',fontWeight:700,transition:'all .2s'}}>{r}</button>)}
    </div>
    {filtered.length===0&&<EmptyState icon={<IcoPeople s={32}/>} title="Nenhum membro nesse filtro"/>}

    {/* Member list — 1 column */}
    <div style={{display:'flex',flexDirection:'column',gap:10,marginBottom:18}}>
      {filtered.map((m,i)=>{
        const cCount=events.filter(e=>e.members.includes(m.id)&&e.type==='culto').length;
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
              {m.is_admin&&<span style={{fontSize:8,background:'rgba(79,70,229,.12)',color:'#4F46E5',padding:'1px 6px',borderRadius:100,fontWeight:800,alignSelf:'flex-start'}}>ADMIN</span>}
              {m.status==='licença'&&<span style={{fontSize:'var(--fs-xs)',color:'#94A3B8',background:'rgba(148,163,184,.1)',padding:'1px 8px',borderRadius:100,fontWeight:700,alignSelf:'flex-start'}}>Em licença</span>}
            </div>
          </div>
          {profile?.is_admin&&<div style={{display:'flex',gap:8,flexShrink:0}}>
            <div style={{textAlign:'center'}}>
              <div style={{fontSize:'var(--fs-lg)',fontWeight:900,color:'#4F46E5',lineHeight:1}}>{m.confirmRate||cCount*10||'—'}{m.confirmRate?'%':''}</div>
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
            <div style={{fontSize:19,fontWeight:900,color:s.c,lineHeight:1}}>{s.v}</div>
            <div style={{fontSize:8,color:t2,marginTop:3,fontWeight:700}}>{s.l}</div>
          </div>)}
      </div>
    </div>}
  </div>;
});

/* ─── MAESTRO (IA) ──────────────────────────────────────────── */
const Maestro = memo(({dark,aiMsgs,aiIn,setAiIn,aiLoad,aiCount,onSendAI,profile})=>{
  const tc=dark?'#E2E8F0':'#0F172A', t2=dark?'#94A3B8':'#475569';
  const gc='gL1';
  const aiEnd=useRef(null);
  const MAX_MSGS=10;
  useEffect(()=>{aiEnd.current?.scrollIntoView({behavior:'smooth'});},[aiMsgs]);

  const qp=[
    {l:'Setlist Domingo',p:'Monte um setlist de 5 músicas para culto dominical com tema de gratidão, fluxo progressivo de Júbilo até Adoração. Indique categoria, tom e BPM.'},
    {l:'Músicas de Abertura',p:'Sugira 3 músicas animadas de Júbilo para abrir o culto com celebração.'},
    {l:'Adoração Profunda',p:'Quais músicas de adoração você recomenda para o momento mais íntimo do culto?'},
    {l:'Reflexão Bíblica',p:'Escreva uma reflexão sobre adoração verdadeira baseada em João 4:23-24 para compartilhar com a equipe.'},
    {l:'Transições',p:'Como fazer transições fluidas entre Júbilo e Adoração? Dicas práticas para o líder de louvor.'},
    {l:'Estrutura de Ensaio',p:'Estruture um ensaio eficiente de 2 horas para ministério de louvor, com divisão de tempo.'},
  ];

  return <div style={{display:'flex',flexDirection:'column',height:'100%',padding:'16px 16px 120px'}}>
    <div style={{marginBottom:12}} className="aUp">
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:2}}>
        <div style={{fontSize:'var(--fs-xl)',fontWeight:900,color:tc,letterSpacing:'-.02em',display:'flex',alignItems:'center',gap:8}}><IcoSpark s={20}/>Maestro</div>
        <div style={{fontSize:'var(--fs-xs)',color:aiCount>=MAX_MSGS?'#EF4444':t2,fontWeight:700}}>{aiCount}/{MAX_MSGS} mensagens</div>
      </div>
      <div style={{fontSize:'var(--fs-sm)',color:t2}}>Assistente IA do ministério IMWAL</div>
    </div>
    <div style={{display:'flex',gap:7,overflowX:'auto',marginBottom:12,paddingBottom:2,flexShrink:0}} className="aUp">
      {qp.map(q=><button key={q.l} onClick={()=>onSendAI(q.p)} disabled={aiCount>=MAX_MSGS} style={{flexShrink:0,padding:'7px 12px',borderRadius:100,border:'1px solid rgba(79,70,229,.2)',background:'rgba(79,70,229,.07)',color:'#4F46E5',fontSize:'var(--fs-xs)',fontWeight:700,cursor:aiCount>=MAX_MSGS?'not-allowed':'pointer',whiteSpace:'nowrap',opacity:aiCount>=MAX_MSGS?.5:1}}>{q.l}</button>)}
    </div>
    {aiCount>=MAX_MSGS&&<div style={{marginBottom:10,padding:'10px 14px',borderRadius:'var(--r-md)',background:'rgba(239,68,68,.08)',border:'1px solid rgba(239,68,68,.2)',fontSize:'var(--fs-sm)',color:'#DC2626',fontWeight:700}}>Limite de {MAX_MSGS} mensagens por sessão atingido. Recarregue a página para uma nova sessão.</div>}
    <div style={{flex:1,overflowY:'auto',display:'flex',flexDirection:'column',gap:11,paddingBottom:8,minHeight:0}}>
      {aiMsgs.map((msg,i)=><div key={i} style={{display:'flex',justifyContent:msg.r==='u'?'flex-end':'flex-start',animation:'slideUp .3s ease both',animationDelay:`${Math.min(i,.2)*.04}s`}}>
        {msg.r==='a'&&<div style={{width:32,height:32,borderRadius:'50%',background:'linear-gradient(135deg,#4F46E5,#7C3AED)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,marginRight:8,alignSelf:'flex-end',boxShadow:'0 4px 12px rgba(79,70,229,.32)'}}><IcoSpark s={14}/></div>}
        <div style={{maxWidth:'80%',padding:'12px 15px',borderRadius:msg.r==='u'?'20px 20px 5px 20px':'5px 20px 20px 20px',background:msg.r==='u'?'linear-gradient(135deg,#4F46E5,#6D28D9)':msg.err?(dark?'rgba(239,68,68,.15)':'rgba(239,68,68,.08)'):dark?'rgba(20,28,52,.9)':'rgba(255,255,255,.9)',backdropFilter:'blur(20px)',WebkitBackdropFilter:'blur(20px)',border:msg.r==='u'?'none':`1px solid ${msg.err?'rgba(239,68,68,.25)':dark?'rgba(255,255,255,.09)':'rgba(0,0,0,.07)'}`,color:msg.r==='u'?'#fff':msg.err?'#DC2626':tc,fontSize:'var(--fs-sm)',lineHeight:1.7,whiteSpace:'pre-wrap',wordBreak:'break-word',boxShadow:msg.r==='u'?'0 4px 16px rgba(79,70,229,.3)':'0 2px 10px rgba(0,0,0,.06)'}}>
          {msg.c}
          {msg.err&&<button onClick={()=>onSendAI(aiMsgs[aiMsgs.length-2]?.c||'')} style={{display:'block',marginTop:8,fontSize:'var(--fs-xs)',color:'#DC2626',border:'1px solid rgba(239,68,68,.3)',background:'transparent',borderRadius:100,padding:'4px 12px',cursor:'pointer',fontWeight:700}}>Tentar novamente</button>}
        </div>
      </div>)}
      {aiLoad&&<div style={{display:'flex',gap:8,alignItems:'flex-end'}}>
        <div style={{width:32,height:32,borderRadius:'50%',background:'linear-gradient(135deg,#4F46E5,#7C3AED)',display:'flex',alignItems:'center',justifyContent:'center'}}><IcoSpark s={14}/></div>
        <div className={gc} style={{borderRadius:'5px 20px 20px 20px',padding:'13px 17px'}}>
          <div style={{display:'flex',gap:4,alignItems:'center'}}>{[0,1,2].map(i=><div key={i} style={{width:6,height:6,borderRadius:'50%',background:'#4F46E5',animation:`bounce .9s ease-in-out ${i*.18}s infinite`}}/>)}</div>
        </div>
      </div>}
      <div ref={aiEnd}/>
    </div>
    <div className="gIn" style={{display:'flex',gap:8,alignItems:'flex-end',marginTop:8,flexShrink:0,marginBottom:8,padding:'10px 10px 10px 16px'}}>
      <textarea value={aiIn} onChange={e=>setAiIn(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();onSendAI();}}} placeholder="Pergunte sobre setlists, adoração, ministério..." rows={1} disabled={aiCount>=MAX_MSGS} style={{flex:1,background:'transparent',border:'none',resize:'none',fontSize:'var(--fs-sm)',color:tc,lineHeight:1.6,maxHeight:100,padding:0}}/>
      <button onClick={()=>onSendAI()} disabled={aiLoad||!aiIn.trim()||aiCount>=MAX_MSGS} style={{width:38,height:38,borderRadius:'var(--r-sm)',border:'none',flexShrink:0,cursor:aiIn.trim()&&aiCount<MAX_MSGS?'pointer':'not-allowed',background:aiIn.trim()&&aiCount<MAX_MSGS?'linear-gradient(135deg,#4F46E5,#6D28D9)':'rgba(79,70,229,.1)',color:aiIn.trim()&&aiCount<MAX_MSGS?'#fff':'#4F46E5',fontSize:17,transition:'all .2s',display:'flex',alignItems:'center',justifyContent:'center'}}>
        {aiLoad?<Loader/>:<IcoArrowUp s={16}/>}
      </button>
    </div>
  </div>;
});

/* ─── ADD SONG OVERLAY ──────────────────────────────────────── */
const AddSong = memo(({dark,onSave,onClose})=>{
  const tc=dark?'#E2E8F0':'#0F172A', t2=dark?'#94A3B8':'#475569';
  const gc='gL1';
  const [step,setStep]=useState(1);
  const [form,setForm]=useState({title:'',artist:'',cat:'adoracao',key:'C',bpm:'80',timeSignature:'4/4',lyrics:'',tags:'',rawLyrics:'',sequence:'',media_url:''});
  const [candidates,setCandidates]=useState([]);
  const [searchLoading,setSearchLoading]=useState(false);
  const [selLoading,setSelLoading]=useState(false);
  const [genLoad,setGenLoad]=useState(false);
  const [showPaste,setShowPaste]=useState(false);
  const tapTimes=useRef([]);
  const GROQ_KEY=import.meta.env.VITE_GROQ_API_KEY;

  function tapTempo(){
    try{const AC=window.AudioContext||window.webkitAudioContext;if(AC){const c=new AC();const o=c.createOscillator();const g=c.createGain();o.connect(g);g.connect(c.destination);o.frequency.value=1100;g.gain.setValueAtTime(0.22,c.currentTime);g.gain.exponentialRampToValueAtTime(0.001,c.currentTime+0.055);o.start(c.currentTime);o.stop(c.currentTime+0.055);setTimeout(()=>c.close(),250);}}catch{}
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
    if(step===3&&form.lyrics.trim()){
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
  async function usePasted(){
    await runAIFormat(null);
  }

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
      const res=await fetch(GROQ_URL,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${GROQ_KEY}`},body:JSON.stringify({model:GROQ_MODEL_BEST,max_tokens:1300,messages:[{role:'system',content:'Especialista em cifras gospel brasileiras. REGRA CRÍTICA: Se a música solicitada NÃO for gospel/religiosa/cristã, você deve RECUSAR e retornar EXATAMENTE: "ERRO: O LouveSync aceita apenas músicas de cunho religioso/gospel." Caso seja gospel, retorne APENAS a cifra limpa em plain text (sem markdown), fundindo os acordes na mesma linha da letra, delimitados por colchetes (exemplo: [D9], [F#m7]). Mantenha a harmonia EXATAMENTE igual a original caso fornecida.'},{role:'user',content:userPrompt}]})});
      const data=await res.json();
      const lyric=data.choices?.[0]?.message?.content||'';
      
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

  function save(){
    if(!form.title||!form.lyrics)return;
    onSave({id:'local_'+Date.now(),title:form.title,artist:form.artist||'Ministério',cat:form.cat,key:form.key,bpm:parseInt(form.bpm)||80,time_signature:form.timeSignature,lyrics:form.lyrics,tags:form.tags.split(',').map(t=>t.trim()).filter(Boolean),media_url:form.media_url});
  }

  const busy=selLoading||genLoad;
  const cBtn={width:'100%',background:dark?'rgba(24,32,68,.92)':'rgba(255,255,255,.88)',border:`1.5px solid ${dark?'rgba(99,102,241,.22)':'rgba(79,70,229,.12)'}`,borderRadius:'var(--r-lg)',padding:'13px 14px',cursor:'pointer',textAlign:'left',transition:'all .18s ease',display:'flex',gap:12,alignItems:'center'};

  return <>
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.55)',zIndex:99,backdropFilter:'blur(8px)',WebkitBackdropFilter:'blur(8px)',animation:'fadeIn .2s'}} onClick={tryClose}/>
    <div className="gL2" style={{position:'fixed',bottom:0,left:0,right:0,maxHeight:'93dvh',overflowY:'auto',borderRadius:'28px 28px 0 0',zIndex:100,animation:'slideUp .42s cubic-bezier(.22,1,.36,1)'}}>
      <div style={{display:'flex',justifyContent:'center',padding:'14px 0 0'}}><div style={{width:44,height:4,borderRadius:100,background:'rgba(127,127,127,.22)'}}/></div>
      <div style={{padding:'16px 20px 52px'}}>

        {/* Header */}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
          <div>
            <div style={{fontSize:18,fontWeight:900,color:tc}}>{step===1?'Nova Música':step===2?'Escolher Versão':'Revisar Cifra'}</div>
            <div style={{display:'flex',gap:5,marginTop:7}}>{[1,2,3].map(s=><div key={s} style={{width:s===step?24:8,height:4,borderRadius:100,transition:'all .3s',background:s<=step?'#4F46E5':'rgba(79,70,229,.15)'}}/>)}</div>
          </div>
          <button onClick={tryClose} style={{width:34,height:34,borderRadius:'var(--r-sm)',border:'none',background:'rgba(0,0,0,.07)',color:t2,fontSize:16,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}><IcoX s={14}/></button>
        </div>

        {/* ── STEP 1: Info da música ── */}
        {step===1&&<div style={{display:'flex',flexDirection:'column',gap:11}}>
          <div className="gIn"><input className="fi" value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} placeholder="Título da música *" style={{color:tc}}/></div>
          <div className="gIn"><input className="fi" value={form.artist} onChange={e=>setForm(f=>({...f,artist:e.target.value}))} placeholder="Artista / Ministério" style={{color:tc}}/></div>
          <div>
            <div style={{fontSize:'var(--fs-xs)',fontWeight:800,color:t2,textTransform:'uppercase',letterSpacing:'.1em',marginBottom:8}}>Categoria</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
              {Object.entries(CAT).map(([id,c])=><button key={id} onClick={()=>setForm(f=>({...f,cat:id}))} style={{padding:12,borderRadius:'var(--r-md)',border:`2px solid ${form.cat===id?c.color:'transparent'}`,background:form.cat===id?`${c.color}12`:'rgba(0,0,0,.04)',cursor:'pointer',display:'flex',alignItems:'center',gap:8,transition:'all .18s'}}>
                <div style={{width:10,height:10,borderRadius:'50%',background:c.color,flexShrink:0}}/>
                <span style={{fontSize:'var(--fs-sm)',fontWeight:800,color:form.cat===id?c.color:t2}}>{c.label}</span>
              </button>)}
            </div>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
            <div>
              <div style={{fontSize:'var(--fs-xs)',fontWeight:800,color:t2,textTransform:'uppercase',letterSpacing:'.1em',marginBottom:6}}>Compasso</div>
              <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>{TIME_SIGS.map(ts=><button key={ts} onClick={()=>setForm(f=>({...f,timeSignature:ts}))} style={{padding:'5px 8px',borderRadius:8,border:'none',cursor:'pointer',fontSize:'var(--fs-xs)',fontWeight:800,fontFamily:"'JetBrains Mono',monospace",background:form.timeSignature===ts?'#10B981':'rgba(16,185,129,.08)',color:form.timeSignature===ts?'#fff':'#059669',transition:'all .15s'}}>{ts}</button>)}</div>
              <div style={{marginTop:8}}>
                <div style={{fontSize:'var(--fs-xs)',fontWeight:800,color:t2,marginBottom:4}}>BPM</div>
                <div className="gIn" style={{display:'flex',alignItems:'center'}}>
                  <input className="fi" type="number" value={form.bpm} onChange={e=>setForm(f=>({...f,bpm:e.target.value}))} style={{color:tc,flex:1}} placeholder="80"/>
                  <button onClick={tapTempo} title="Tap Tempo" style={{flexShrink:0,margin:'4px',padding:'6px 10px',borderRadius:'var(--r-sm)',border:'none',cursor:'pointer',background:'rgba(245,158,11,.14)',color:'#D97706',fontSize:'var(--fs-xs)',fontWeight:800,display:'flex',alignItems:'center',gap:4}}><IcoTap s={12}/>TAP</button>
                </div>
                <div style={{fontSize:8,color:t2,marginTop:3,textAlign:'right'}}>Toque o ritmo para calcular</div>
              </div>
            </div>
          </div>
          <div className="gIn"><input className="fi" value={form.tags} onChange={e=>setForm(f=>({...f,tags:e.target.value}))} placeholder="Tags (separadas por vírgula)" style={{color:tc}}/></div>
          <div className="gIn"><input className="fi" value={form.sequence} onChange={e=>setForm(f=>({...f,sequence:e.target.value}))} placeholder="Seq. Musical (ex: Intro, Verso, Coro...)" style={{color:tc}}/></div>
          <button className="bp" onClick={goToSearch} disabled={!form.title}><IcoMusic s={15}/>Buscar Música</button>
        </div>}

        {/* ── STEP 2: Resultados de busca ── */}
        {step===2&&<div style={{display:'flex',flexDirection:'column',gap:11}}>

          {/* Buscando... */}
          {searchLoading&&<div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:12,padding:'32px 0'}}>
            <Loader/>
            <div style={{fontWeight:800,color:tc,fontSize:'var(--fs-base)'}}>{form.title}{form.artist?` — ${form.artist}`:''}</div>
            <div style={{display:'flex',gap:10,fontSize:'var(--fs-xs)',color:t2}}>
              <span>🎸 CifraClub</span><span>🎵 Vagalume</span><span>📝 Letras</span>
            </div>
          </div>}

          {/* Resultados */}
          {!searchLoading&&candidates.length>0&&<>
            <div style={{fontSize:'var(--fs-xs)',fontWeight:800,color:t2,textTransform:'uppercase',letterSpacing:'.12em'}}>
              {candidates.length} resultado{candidates.length!==1?'s':''} — selecione a versão correta
            </div>
            {candidates.map(c=>
              <button key={c.id} onClick={()=>!busy&&selectCandidate(c)} disabled={busy}
                style={{...cBtn,opacity:busy?.6:1,':hover':{transform:'translateY(-2px)'}}}>
                <div style={{fontSize:22,flexShrink:0,lineHeight:1}}>{c.icon}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:800,color:tc,fontSize:'var(--fs-base)',marginBottom:1,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{c.title}</div>
                  <div style={{fontSize:'var(--fs-xs)',color:t2,marginBottom:5,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{c.artist}</div>
                  <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
                    <span style={{background:c.hasCifra?'rgba(16,185,129,.12)':'rgba(99,102,241,.1)',color:c.hasCifra?'#10B981':'#818CF8',border:`1px solid ${c.hasCifra?'rgba(16,185,129,.3)':'rgba(99,102,241,.22)'}`,padding:'2px 8px',borderRadius:100,fontSize:'var(--fs-xs)',fontWeight:700}}>{c.source}</span>
                    {c.hasCifra&&<span style={{background:'rgba(16,185,129,.1)',color:'#10B981',border:'1px solid rgba(16,185,129,.25)',padding:'2px 8px',borderRadius:100,fontSize:'var(--fs-xs)',fontWeight:700}}>✓ com acordes</span>}
                    {!c.hasCifra&&<span style={{background:'rgba(99,102,241,.08)',color:'#818CF8',border:'1px solid rgba(99,102,241,.18)',padding:'2px 8px',borderRadius:100,fontSize:'var(--fs-xs)',fontWeight:700}}>letra</span>}
                  </div>
                </div>
                {busy?<Loader/>:<IcoChevR s={16}/>}
              </button>
            )}
          </>}

          {/* Nenhum resultado */}
          {!searchLoading&&candidates.length===0&&
            <div style={{textAlign:'center',padding:'28px 0',display:'flex',flexDirection:'column',alignItems:'center',gap:8}}>
              <div style={{fontSize:36}}>🔍</div>
              <div style={{fontWeight:800,color:tc}}>Não encontrado online</div>
              <div style={{fontSize:'var(--fs-xs)',color:t2,maxWidth:230}}>Tente ajustar o nome ou artista, ou cole a letra abaixo</div>
              <button onClick={goToSearch} className="bSec" style={{marginTop:6}}>Buscar novamente</button>
            </div>
          }

          {/* Loading overlay */}
          {busy&&<div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8,padding:12,background:dark?'rgba(79,70,229,.12)':'rgba(79,70,229,.07)',borderRadius:'var(--r-md)'}}>
            <Loader/><span style={{fontSize:'var(--fs-sm)',fontWeight:700,color:'#818CF8'}}>{selLoading?'Carregando cifra...':'Maestro formatando...'}</span>
          </div>}

          {/* Manual paste option */}
          {!searchLoading&&!busy&&<>
            <div style={{display:'flex',alignItems:'center',gap:10}}><div style={{flex:1,height:1,background:'rgba(0,0,0,.08)'}}/><span style={{fontSize:'var(--fs-xs)',color:t2,fontWeight:600}}>ou</span><div style={{flex:1,height:1,background:'rgba(0,0,0,.08)'}}/></div>
            <button className="bSec" onClick={()=>setShowPaste(p=>!p)}>{showPaste?'▲ Fechar':'✏️ Colar letra manualmente'}</button>
            {showPaste&&<>
              <div className="gIn">
                <textarea className="fi" value={form.rawLyrics} onChange={e=>setForm(f=>({...f,rawLyrics:e.target.value}))} placeholder="Cole aqui a letra ou cifra copiada do site... A IA vai adicionar os acordes corretos." style={{color:tc,minHeight:100,fontSize:'var(--fs-xs)',lineHeight:1.6}}/>
              </div>
              {form.rawLyrics.trim().length>20&&<button className="bp" onClick={usePasted}><IcoSpark s={14}/>Formatar com IA</button>}
            </>}
            <button className="bSec" style={{opacity:.7}} onClick={()=>setStep(3)}>⌨️ Digitar diretamente</button>
            <button onClick={()=>setStep(1)} style={{border:'none',background:'transparent',color:t2,fontSize:'var(--fs-sm)',cursor:'pointer'}}>← Voltar</button>
          </>}
        </div>}

        {/* ── STEP 3: Revisar/editar cifra ── */}
        {step===3&&<div style={{display:'flex',flexDirection:'column',gap:12}}>
          <div style={{fontSize:'var(--fs-sm)',color:t2,fontWeight:700}}>Use [G], [Em], [C7] para acordes</div>
          <div className="gIn" style={{borderRadius:'var(--r-lg)'}}>
            <textarea className="fi" value={form.lyrics} onChange={e=>setForm(f=>({...f,lyrics:e.target.value}))} placeholder={'Verso:\n[G]Letra com [D]acordes\n\nCoro:\n[C]Continue a[G]qui...'} style={{color:tc,minHeight:200,fontFamily:"'JetBrains Mono',monospace",fontSize:'var(--fs-sm)',lineHeight:1.8}}/>
          </div>
          <div style={{fontSize:'var(--fs-sm)',color:t2,fontWeight:700,marginTop:10}}>Áudio de Referência (Opcional)</div>
          <div className="gIn" style={{borderRadius:'var(--r-lg)',display:'flex',alignItems:'center',padding:'0 12px'}}>
             <div style={{color:t2}}>🔗</div>
             <input className="fi" value={form.media_url} onChange={e=>setForm(f=>({...f,media_url:e.target.value}))} placeholder="Link do YouTube ou Spotify" style={{color:tc}}/>
          </div>
          {form.lyrics&&<div className={gc} style={{borderRadius:'var(--r-md)',padding:14}}>
            <div style={{fontSize:'var(--fs-xs)',color:t2,fontWeight:800,textTransform:'uppercase',letterSpacing:'.1em',marginBottom:8}}>Preview</div>
            <LyricView text={form.lyrics} st={0} mode='chords' dark={dark}/>
          </div>}
          <button className="bp" onClick={save} disabled={!form.lyrics}>Salvar Música</button>
          <button onClick={()=>setStep(2)} style={{border:'none',background:'transparent',color:t2,fontSize:'var(--fs-sm)',cursor:'pointer'}}>← Voltar</button>
        </div>}

      </div>
    </div>
  </>;
});
/* ─── CREATE EVENT OVERLAY (Qualquer Usuário) ─────────────────────────── */
const CreateEvent = memo(({dark,members,songs,events,initialDate,onSave,onClose})=>{
  const tc=dark?'#E2E8F0':'#0F172A', t2=dark?'#94A3B8':'#475569';
  const gc='gL1';
  const [form,setForm]=useState({date:initialDate||'',time:'19:00',type:'culto',label:'',theme:'',selMembers:[],selSongs:[],requestedSongs:[],santaCeiaSong:null});
  const [memberSearch,setMemberSearch]=useState('');
  const [songSearch,setSongSearch]=useState('');
  const [isRecurring,setIsRecurring]=useState(false);
  const [occurrences,setOccurrences]=useState(4);

  const PRESETS = [
    { label: 'Culto de Quinta', time: '19:30', type: 'culto', members: [] },
    { label: 'Culto de Domingo', time: '18:00', type: 'culto', members: [] },
    { label: 'Consagração', time: '08:00', type: 'consagracao', members: members.filter(m=>m.status==='ativo').map(m=>m.id) },
    { label: 'Escola Bíblica (EBD)', time: '09:00', type: 'ebd', members: members.filter(m=>m.status==='ativo').map(m=>m.id) },
    { label: 'Ensaio Geral', time: '15:00', type: 'ensaio', members: members.filter(m=>m.status==='ativo').map(m=>m.id) }
  ];

  function toggleMember(id){setForm(f=>({...f,selMembers:f.selMembers.includes(id)?f.selMembers.filter(x=>x!==id):[...f.selMembers,id]}));}
  function toggleSong(id){setForm(f=>({...f,selSongs:f.selSongs.includes(id)?f.selSongs.filter(x=>x!==id):[...f.selSongs,id]}));}
  function toggleRequestedSong(id){setForm(f=>({...f,requestedSongs:f.requestedSongs.includes(id)?f.requestedSongs.filter(x=>x!==id):[...f.requestedSongs,id]}));}
  
  function autoGenerate(){
    if(!form.date) return alert("Selecione a data primeiro para auto-gerar!");
    const generated = generateDynamicSetlist(form.date, form.type, songs, events, form.requestedSongs, form.santaCeiaSong);
    setForm(f=>({...f, selSongs: generated}));
  }

  function save(){
    if(!form.date||!form.label)return;
    const evs = [];
    const baseDate = new Date(form.date+'T12:00:00');
    for(let i=0; i<(isRecurring?occurrences:1); i++){
       const d = new Date(baseDate);
       d.setDate(d.getDate() + i * 7);
       const dStr = d.toISOString().slice(0,10);
       
       let songsToUse = form.selSongs;
       if (form.type === 'culto' && (d.getDay()===0 || d.getDay()===4) && songsToUse.length === 0) {
           songsToUse = generateDynamicSetlist(dStr, 'culto', songs, events, form.requestedSongs, form.santaCeiaSong);
       }
       
       evs.push({id:'local_ev_'+Date.now()+'_'+i,date:dStr,time:form.time,type:form.type,label:form.label,theme:form.theme||null,songs:songsToUse,members:form.selMembers,confirmations:{},singerBySong:{},sequenceBySong:{},requested_songs:form.requestedSongs,santa_ceia_song:form.santaCeiaSong});
       
       // Criar ensaio de sábado automaticamente se for domingo
       if (form.type === 'culto' && d.getDay() === 0) {
           const dSat = new Date(d);
           dSat.setDate(dSat.getDate() - 1);
           evs.push({id:'local_ev_'+Date.now()+'_sat_'+i,date:dSat.toISOString().slice(0,10),time:'15:00',type:'ensaio',label:'Ensaio (Sáb)',theme:form.theme||null,songs:songsToUse,members:form.selMembers,confirmations:{},singerBySong:{},sequenceBySong:{},requested_songs:form.requestedSongs,santa_ceia_song:form.santaCeiaSong});
       }
    }
    onSave(evs);
  }
  const filtM=members.filter(m=>m.name.toLowerCase().includes(memberSearch.toLowerCase()));
  const filtS=songs.filter(s=>s.title.toLowerCase().includes(songSearch.toLowerCase()));

  return <>
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.5)',zIndex:99,backdropFilter:'blur(8px)',WebkitBackdropFilter:'blur(8px)',animation:'fadeIn .2s'}} onClick={onClose}/>
    <div className="gL2" style={{position:'fixed',bottom:0,left:0,right:0,maxHeight:'94dvh',overflowY:'auto',borderRadius:'28px 28px 0 0',zIndex:100,animation:'slideUp .42s cubic-bezier(.22,1,.36,1)'}}>
      <div style={{display:'flex',justifyContent:'center',padding:'14px 0 0'}}><div style={{width:44,height:4,borderRadius:100,background:'rgba(127,127,127,.22)'}}/></div>
      <div style={{padding:'16px 20px 52px'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
          <div style={{fontSize:18,fontWeight:900,color:tc,display:'flex',alignItems:'center',gap:8}}><IcoCalPlus s={18}/>Novo Compromisso</div>
          <button onClick={onClose} style={{width:34,height:34,borderRadius:'var(--r-sm)',border:'none',background:'rgba(0,0,0,.07)',color:t2,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}><IcoX s={14}/></button>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          
          <div style={{display:'flex',gap:8,overflowX:'auto',paddingBottom:4}}>
            {PRESETS.map(p=><button key={p.label} onClick={()=>setForm(f=>({...f,label:p.label,time:p.time,type:p.type,selMembers:p.members.length?p.members:f.selMembers}))} style={{flexShrink:0,padding:'7px 12px',borderRadius:100,border:'none',background:dark?'rgba(255,255,255,.05)':'rgba(79,70,229,.05)',color:tc,fontSize:'var(--fs-xs)',fontWeight:700,cursor:'pointer'}}>{p.label}</button>)}
          </div>

          {/* Type */}
          <div style={{display:'flex',gap:8,overflowX:'auto',paddingBottom:4}}>
            {['culto','ensaio','ebd','consagracao','outro'].map(tp=><button key={tp} onClick={()=>setForm(f=>({...f,type:tp}))} style={{flexShrink:0,padding:'10px 14px',borderRadius:'var(--r-md)',border:'none',cursor:'pointer',fontSize:'var(--fs-sm)',fontWeight:800,background:form.type===tp?'#4F46E5':'rgba(79,70,229,.07)',color:form.type===tp?'#fff':'#4F46E5',transition:'all .18s',textTransform:'capitalize'}}>{tp}</button>)}
          </div>
          {/* Label */}
          <div className="gIn"><input className="fi" value={form.label} onChange={e=>setForm(f=>({...f,label:e.target.value}))} placeholder="Nome do compromisso *" style={{color:tc}}/></div>
          {/* Date + Time */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
            <div>
              <div style={{fontSize:'var(--fs-xs)',fontWeight:800,color:t2,marginBottom:6,textTransform:'uppercase',letterSpacing:'.1em'}}>Data Inicial</div>
              <div className="gIn"><input className="fi" type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))} style={{color:tc}}/></div>
            </div>
            <div>
              <div style={{fontSize:'var(--fs-xs)',fontWeight:800,color:t2,marginBottom:6,textTransform:'uppercase',letterSpacing:'.1em'}}>Horário</div>
              <div className="gIn"><input className="fi" type="time" value={form.time} onChange={e=>setForm(f=>({...f,time:e.target.value}))} style={{color:tc}}/></div>
            </div>
          </div>
          {/* Recurrence */}
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',background:dark?'rgba(255,255,255,.04)':'rgba(0,0,0,.03)',padding:'12px',borderRadius:'var(--r-md)'}}>
            <div>
              <div style={{fontSize:'var(--fs-sm)',fontWeight:700,color:tc}}>Repetir semanalmente</div>
              <div style={{fontSize:'var(--fs-xs)',color:t2}}>Criar eventos automaticamente</div>
            </div>
            <button className={`tog${isRecurring?' on':''}`} onClick={()=>setIsRecurring(p=>!p)} style={{background:isRecurring?'#10B981':'#CBD5E1'}}/>
          </div>
          {isRecurring&&<div className="gIn" style={{display:'flex',alignItems:'center',gap:10,padding:'0 14px'}}>
             <span style={{fontSize:'var(--fs-sm)',color:t2,fontWeight:600}}>Ocorrências:</span>
             <input type="number" min="2" max="12" value={occurrences} onChange={e=>setOccurrences(Number(e.target.value))} className="fi" style={{flex:1,color:tc,textAlign:'right'}}/>
          </div>}
          
          {/* Theme */}
          <div className="gIn"><input className="fi" value={form.theme} onChange={e=>setForm(f=>({...f,theme:e.target.value}))} placeholder="Tema / título (opcional)" style={{color:tc}}/></div>
          {/* Members */}
          <div>
            <div style={{fontSize:'var(--fs-xs)',fontWeight:800,color:t2,textTransform:'uppercase',letterSpacing:'.1em',marginBottom:8}}>Escalar membros ({form.selMembers.length})</div>
            <div className="gIn" style={{marginBottom:8}}><input className="fi" value={memberSearch} onChange={e=>setMemberSearch(e.target.value)} placeholder="Buscar membro..." style={{color:tc,padding:'8px 14px'}}/></div>
            <div style={{display:'flex',flexDirection:'column',gap:6,maxHeight:160,overflowY:'auto'}}>
              {filtM.map(m=><button key={m.id} onClick={()=>toggleMember(m.id)} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 10px',borderRadius:'var(--r-md)',border:`1.5px solid ${form.selMembers.includes(m.id)?m.color:'transparent'}`,background:form.selMembers.includes(m.id)?`${m.color}14`:'rgba(0,0,0,.03)',cursor:'pointer',transition:'all .15s'}}>
                <Ava m={m} size={28} ring/>
                <span style={{flex:1,fontSize:'var(--fs-sm)',fontWeight:700,color:tc,textAlign:'left'}}>{m.name}</span>
                <span style={{fontSize:'var(--fs-xs)',color:t2}}>{m.instrument}</span>
                {form.selMembers.includes(m.id)&&<IcoCheck s={14}/>}
              </button>)}
            </div>
          </div>
          
          {/* Requested Songs & Santa Ceia */}
          {form.type === 'culto' && <div style={{background:dark?'rgba(255,255,255,.03)':'rgba(0,0,0,.02)',padding:12,borderRadius:'var(--r-md)'}}>
            <div style={{marginBottom:10}}>
              <div style={{fontSize:'var(--fs-xs)',fontWeight:800,color:t2,marginBottom:6,textTransform:'uppercase',letterSpacing:'.1em'}}>Música Santa Ceia (se houver)</div>
              <div className="gIn"><select className="fi" value={form.santaCeiaSong||''} onChange={e=>setForm(f=>({...f,santaCeiaSong:e.target.value}))} style={{color:tc,padding:'8px 10px'}}><option value="">Nenhuma</option>{songs.filter(s=>s.cat==='oferta'||s.cat==='adoracao').map(s=><option key={s.id} value={s.id}>{s.title} ({s.artist})</option>)}</select></div>
            </div>
            <div>
              <div style={{fontSize:'var(--fs-xs)',fontWeight:800,color:t2,textTransform:'uppercase',letterSpacing:'.1em',marginBottom:8}}>Músicas Pedidas ({form.requestedSongs.length})</div>
              <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
                {form.requestedSongs.map(id=>{const s=songs.find(x=>x.id===id);return s?<span key={id} onClick={()=>toggleRequestedSong(id)} style={{padding:'4px 10px',borderRadius:100,background:`${CAT[s.cat].color}15`,color:CAT[s.cat].color,fontSize:'var(--fs-xs)',fontWeight:700,cursor:'pointer'}}>{s.title} ✕</span>:null;})}
              </div>
              <div className="gIn" style={{marginTop:8}}><select className="fi" value="" onChange={e=>toggleRequestedSong(e.target.value)} style={{color:tc,padding:'8px 10px'}}><option value="">+ Adicionar música pedida...</option>{songs.filter(s=>!form.requestedSongs.includes(s.id)).map(s=><option key={s.id} value={s.id}>{s.title} ({s.artist})</option>)}</select></div>
            </div>
          </div>}

          {/* Songs */}
          {form.type !== 'ebd' && form.type !== 'consagracao' && <div>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
              <div style={{fontSize:'var(--fs-xs)',fontWeight:800,color:t2,textTransform:'uppercase',letterSpacing:'.1em'}}>Setlist ({form.selSongs.length} músicas)</div>
              {form.type === 'culto' && <button onClick={autoGenerate} style={{fontSize:'var(--fs-xs)',color:'#4F46E5',background:'rgba(79,70,229,.1)',padding:'4px 10px',borderRadius:100,border:'none',cursor:'pointer',fontWeight:700}}><IcoSpark s={12}/> Auto-gerar</button>}
            </div>
            <div className="gIn" style={{marginBottom:8}}><input className="fi" value={songSearch} onChange={e=>setSongSearch(e.target.value)} placeholder="Buscar música..." style={{color:tc,padding:'8px 14px'}}/></div>
            <div style={{display:'flex',flexDirection:'column',gap:5,maxHeight:130,overflowY:'auto'}}>
              {filtS.map(s=><button key={s.id} onClick={()=>toggleSong(s.id)} style={{display:'flex',alignItems:'center',gap:8,padding:'7px 10px',borderRadius:'var(--r-sm)',border:`1.5px solid ${form.selSongs.includes(s.id)?CAT[s.cat].color:'transparent'}`,background:form.selSongs.includes(s.id)?`${CAT[s.cat].color}10`:'rgba(0,0,0,.03)',cursor:'pointer',transition:'all .15s'}}>
                <div style={{width:8,height:8,borderRadius:'50%',background:CAT[s.cat].color,flexShrink:0}}/>
                <span style={{flex:1,fontSize:'var(--fs-sm)',fontWeight:700,color:tc,textAlign:'left'}}>{s.title}</span>
                <KeyChip k={s.key} size={9}/>
                {form.selSongs.includes(s.id)&&<IcoCheck s={12}/>}
              </button>)}
            </div>
          </div>}
          <button className="bp" onClick={save} disabled={!form.date||!form.label}>Criar Compromisso</button>
        </div>
      </div>
    </div>
  </>;
});

/* ─── EVENT SHEET ───────────────────────────────────────────── */
const EvSheet = memo(({ev,dark,songs,members,profile,onClose,onSelectSong,onConfirm,spawnConfetti})=>{
  if(!ev)return null;
  const tc=dark?'#E2E8F0':'#0F172A', t2=dark?'#94A3B8':'#475569';
  const evItems=(ev.items||[]).map(it=>it.type==='song'?{...it,song:songs.find(s=>s.id===it.song_id)}:it).filter(it=>it.type==='note'||it.song);
  const evS=ev.songs.map(id=>songs.find(s=>s.id===id)).filter(Boolean);
  const evM=ev.members.map(id=>members.find(m=>m.id===id)).filter(Boolean);
  const myConf=ev.confirmations[profile?.id];
  const isMyEvent=ev.members.includes(profile?.id);

  return <>
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.45)',zIndex:99,backdropFilter:'blur(7px)',WebkitBackdropFilter:'blur(7px)',animation:'fadeIn .2s'}} onClick={onClose}/>
    <div className="gL2" style={{position:'fixed',bottom:0,left:0,right:0,maxHeight:'90dvh',overflowY:'auto',borderRadius:'28px 28px 0 0',zIndex:100,animation:'slideUp .4s cubic-bezier(.22,1,.36,1)'}}>
      <div style={{display:'flex',justifyContent:'center',padding:'14px 0 0'}}><div style={{width:44,height:4,borderRadius:100,background:'rgba(127,127,127,.22)'}}/></div>
      <div style={{padding:'16px 20px 52px'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:14}}>
          <div><div className="font-serif" style={{fontSize:24,fontWeight:900,color:tc}}>{ev.label}</div><div style={{fontSize:'var(--fs-sm)',color:t2,marginTop:3}}>{fDate(ev.date)} · {ev.time}</div></div>
          <button onClick={onClose} style={{width:34,height:34,borderRadius:'var(--r-sm)',border:'none',background:'rgba(0,0,0,.07)',color:t2,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}><IcoX s={14}/></button>
        </div>
        {ev.theme&&<div style={{background:'rgba(79,70,229,.07)',borderRadius:'var(--r-sm)',padding:'9px 14px',marginBottom:14,fontSize:'var(--fs-sm)',color:'#4F46E5',fontWeight:700,border:'1px solid rgba(79,70,229,.15)',display:'flex',alignItems:'center',gap:6}}><IcoBook s={12}/>{ev.theme}</div>}
        {/* Share setlist */}
        {evS.length>0&&<button onClick={()=>{
          const txt=`🎵 *${ev.label}* — ${fDate(ev.date)} · ${ev.time}\n${ev.theme?`📖 ${ev.theme}\n`:''}\n*Setlist:*\n${evS.map((s,i)=>`${i+1}. ${s.title} (${s.artist}) — ${s.key}`).join('\n')}\n\n_Via LouveSync · IMWAL_`;
          navigator.clipboard.writeText(txt).then(()=>{const btn=document.getElementById('shareBtn');if(btn){btn.style.animation='shareBtn .3s ease';setTimeout(()=>btn.style.animation='',400);}}).catch(()=>alert(txt));
        }} id="shareBtn" style={{width:'100%',marginBottom:10,padding:'10px',borderRadius:'var(--r-md)',border:'1px solid rgba(79,70,229,.2)',background:'rgba(79,70,229,.06)',color:'#4F46E5',fontWeight:700,fontSize:'var(--fs-sm)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:6}}><IcoShare s={14}/>Copiar setlist para WhatsApp</button>}
        {isMyEvent&&<div style={{display:'flex',gap:8,marginBottom:16}}>
          <button onClick={()=>{onConfirm(ev.id,true);if(myConf!==true)spawnConfetti();}} style={{flex:1,padding:'10px',borderRadius:'var(--r-full)',border:'none',cursor:'pointer',fontSize:'var(--fs-sm)',fontWeight:800,background:myConf===true?'#10B981':'rgba(16,185,129,.1)',color:myConf===true?'#fff':'#059669',display:'flex',alignItems:'center',justifyContent:'center',gap:6}}><IcoCheck/>Confirmar Presença</button>
          <button onClick={()=>onConfirm(ev.id,false)} style={{flex:1,padding:'10px',borderRadius:'var(--r-full)',border:'none',cursor:'pointer',fontSize:'var(--fs-sm)',fontWeight:800,background:myConf===false?'#EF4444':'rgba(239,68,68,.08)',color:myConf===false?'#fff':'#DC2626',display:'flex',alignItems:'center',justifyContent:'center',gap:6}}><IcoX/>Recusar</button>
        </div>}
        <div style={{fontSize:'var(--fs-xs)',color:t2,fontWeight:800,textTransform:'uppercase',letterSpacing:'.1em',marginBottom:10}}>Setlist</div>
        {evItems.length===0?<EmptyState icon={<IcoMusic s={24}/>} title="Sem músicas definidas"/>:evItems.map((it,i)=>{
          if(it.type==='note') return <div key={it.id} style={{padding:'8px 12px', background:'rgba(245,158,11,.08)', color:'#D97706', borderRadius:'var(--r-md)', marginBottom:7, fontSize:'var(--fs-sm)', fontWeight:700, fontStyle:'italic', borderLeft:'3px solid #F59E0B'}}>📝 {it.text}</div>;
          const s = it.song;
          return <div key={it.id} onClick={()=>onSelectSong(s)} style={{display:'flex',alignItems:'center',gap:11,padding:11,borderRadius:'var(--r-md)',marginBottom:7,background:dark?'rgba(255,255,255,.04)':'rgba(0,0,0,.03)',cursor:'pointer'}}>
            <span style={{width:26,height:26,borderRadius:8,background:'rgba(79,70,229,.1)',color:'#4F46E5',fontSize:'var(--fs-xs)',fontWeight:900,display:'flex',alignItems:'center',justifyContent:'center'}}>{i+1}</span>
            <div style={{flex:1}}><div className="font-serif" style={{fontSize:16,fontWeight:800,color:tc}}>{s.title}</div><div style={{fontSize:'var(--fs-xs)',color:t2}}>{s.artist}</div></div>
            <KeyChip k={s.key} size={10}/>
          </div>
        })}
        <div style={{fontSize:'var(--fs-xs)',color:t2,fontWeight:800,textTransform:'uppercase',letterSpacing:'.1em',margin:'16px 0 10px'}}>Equipe ({evM.length})</div>
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {evM.map(m=>{const conf=ev.confirmations[m.id];return <div key={m.id} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',borderRadius:'var(--r-md)',background:dark?'rgba(255,255,255,.04)':'rgba(0,0,0,.03)'}}>
            <Ava m={m} size={32} ring/>
            <div style={{flex:1}}><div style={{fontSize:'var(--fs-sm)',fontWeight:700,color:tc}}>{m.name}</div><div style={{fontSize:'var(--fs-xs)',color:t2}}>{m.instrument}</div></div>
            <span style={{fontSize:'var(--fs-xs)',fontWeight:800,padding:'3px 9px',borderRadius:100,background:conf===true?'rgba(16,185,129,.12)':conf===false?'rgba(239,68,68,.1)':'rgba(0,0,0,.05)',color:conf===true?'#059669':conf===false?'#DC2626':t2}}>{conf===true?'Confirmado':conf===false?'Recusou':'Pendente'}</span>
          </div>;})}
        </div>
      </div>
    </div>
  </>;
});

/* ─── NOTIFS SHEET ──────────────────────────────────────────── */
const NotifsSheet = memo(({dark,notifs,onClose,onMarkRead,onMarkAllRead,onAction})=>{
  const tc=dark?'#E2E8F0':'#0F172A', t2=dark?'#94A3B8':'#475569';
  return <>
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.4)',zIndex:99,animation:'fadeIn .2s'}} onClick={onClose}/>
    <div className="gL2" style={{position:'fixed',bottom:0,left:0,right:0,maxHeight:'78dvh',overflowY:'auto',borderRadius:'28px 28px 0 0',zIndex:100,animation:'slideUp .4s cubic-bezier(.22,1,.36,1)'}}>
      <div style={{display:'flex',justifyContent:'center',padding:'14px 0 0'}}><div style={{width:44,height:4,borderRadius:100,background:'rgba(127,127,127,.22)'}}/></div>
      <div style={{padding:'16px 20px 52px'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
          <div style={{fontSize:18,fontWeight:900,color:tc,display:'flex',alignItems:'center',gap:8}}><IcoBell s={18}/>Notificações</div>
          <div style={{display:'flex',gap:8}}>
            <button onClick={onMarkAllRead} style={{fontSize:'var(--fs-xs)',fontWeight:700,color:'#4F46E5',border:'none',background:'transparent',cursor:'pointer'}}>Marcar todas lidas</button>
            <button onClick={onClose} style={{width:30,height:30,borderRadius:8,border:'none',background:'rgba(0,0,0,.07)',color:t2,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}><IcoX s={12}/></button>
          </div>
        </div>
        {notifs.length===0&&<EmptyState icon={<IcoBell s={28}/>} title="Nenhuma notificação"/>}
        {notifs.map(n=><div key={n.id} onClick={()=>onMarkRead(n.id)} style={{display:'flex',gap:11,padding:13,borderRadius:'var(--r-md)',marginBottom:7,cursor:'pointer',background:n.read?(dark?'rgba(255,255,255,.02)':'rgba(0,0,0,.02)'):(dark?'rgba(79,70,229,.1)':'rgba(79,70,229,.06)'),border:n.read?'none':'1px solid rgba(79,70,229,.15)',transition:'all .2s'}}>
          <div style={{width:38,height:38,borderRadius:'var(--r-sm)',background:'rgba(79,70,229,.1)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}><IcoBell s={16}/></div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:'var(--fs-sm)',fontWeight:n.read?600:800,color:tc,lineHeight:1.4}}>{n.text}</div>
            <div style={{fontSize:'var(--fs-xs)',color:t2,marginTop:3}}>{n.time}</div>
            {n.cta&&<button onClick={e=>{e.stopPropagation();onAction(n);}} style={{marginTop:6,fontSize:'var(--fs-xs)',color:'#4F46E5',border:'1px solid rgba(79,70,229,.25)',background:'rgba(79,70,229,.06)',borderRadius:100,padding:'3px 12px',cursor:'pointer',fontWeight:700}}>{n.cta}</button>}
          </div>
          {!n.read&&<div style={{width:8,height:8,borderRadius:'50%',background:'#4F46E5',flexShrink:0,marginTop:4}}/>}
        </div>)}
      </div>
    </div>
  </>;
});

/* ─── MAIN APP ──────────────────────────────────────────────── */
export default function LouveSync() {
  // ── Auth
  const [profile,setProfile]=useState(null);
  const [allMembers,setAllMembers]=useState([]);
  const [authLoading,setAuthLoading]=useState(true);

  // ── Data
  const [songs,setSongs]=useState([]);
  const [events,setEvents]=useState([]);
  const [dataLoading,setDataLoading]=useState(true);

  // ── UI
  const [dark,setDark]=useState(false);
  const [tab,setTab]=useState('home');
  const [selSong,setSelSong]=useState(null);
  const [selEvent,setSelEvent]=useState(null);
  const [tr,setTr]=useState(0);
  const [mode,setMode]=useState('chords');
  const [stageMode,setStageMode]=useState(false);
  const [stageFs,setStageFs]=useState(22);
  const [metro,setMetro]=useState(false);
  const [beatIdx,setBeatIdx]=useState(-1);
  const [catF,setCatF]=useState('all');
  const [search,setSearch]=useState('');
  const [weekOffset,setWeekOffset]=useState(0);
  const [evSheet,setEvSheet]=useState(null);
  const [addOpen,setAddOpen]=useState(false);
  const [notifsOpen,setNotifsOpen]=useState(false);
  const [selRole,setSelRole]=useState('Todos');
  const [confetti,setConfetti]=useState([]);
  const [notifs,setNotifs]=useState(()=>{
    const stored = localStorage.getItem('ls_notifs');
    if(stored) try { return JSON.parse(stored); } catch(e){}
    return [
      {id:1,text:'Bem-vindo ao LouveSync! Confirme sua presença no próximo evento.',time:'agora',read:false,cta:'Ver Escala',ctaTab:'escala'},
      {id:2,text:'Nova música disponível no repertório.',time:'hoje',read:false,cta:'Ver Repertório',ctaTab:'repertorio'},
    ];
  });

  useEffect(()=>{
    localStorage.setItem('ls_notifs', JSON.stringify(notifs));
  }, [notifs]);
  const [confirmState,setConfirmState]=useState(null);

  // ── Online/offline
  const [isOnline,setIsOnline]=useState(navigator.onLine);
  useEffect(()=>{
    const on=()=>setIsOnline(true); const off=()=>setIsOnline(false);
    window.addEventListener('online',on); window.addEventListener('offline',off);
    return()=>{window.removeEventListener('online',on);window.removeEventListener('offline',off);};
  },[]);

  // ── Landscape lock
  const [landscape,setLandscape]=useState(()=>window.matchMedia('(max-height:500px) and (orientation:landscape)').matches);
  useEffect(()=>{
    const mq=window.matchMedia('(max-height:500px) and (orientation:landscape)');
    const h=e=>setLandscape(e.matches); mq.addEventListener('change',h);
    return()=>mq.removeEventListener('change',h);
  },[]);

  // ── Favorites (localStorage)
  const [favorites,setFavorites]=useState(()=>{try{return JSON.parse(localStorage.getItem('ls_fav')||'[]');}catch{return [];}});
  function toggleFav(id){setFavorites(p=>{const n=p.includes(id)?p.filter(x=>x!==id):[...p,id];localStorage.setItem('ls_fav',JSON.stringify(n));return n;});}

  // ── Create event
  const [createEvOpen,setCreateEvOpen]=useState(false);
  const [createEvDate,setCreateEvDate]=useState(null);

  // ── Vocalist Monthly Reminder
  useEffect(()=>{
     if(profile && profile.vocal_category) {
        const d = new Date();
        const currentMonth = d.getMonth() + '_' + d.getFullYear();
        const lastNotif = localStorage.getItem('ls_notif_month_'+profile.id);
        if (lastNotif !== currentMonth) {
            setNotifs(p => {
               if(p.some(n=>n.id==='vocal_'+currentMonth)) return p;
               return [{id:'vocal_'+currentMonth, text:`Lembrete: Como vocalista de ${profile.vocal_category}, adicione pelo menos uma nova música neste mês!`, time:'hoje', read:false, cta:'Adicionar Música', ctaAction:'addSong'}, ...p];
            });
            localStorage.setItem('ls_notif_month_'+profile.id, currentMonth);
        }
     }
  }, [profile]);

  // ── AI
  const [aiMsgs,setAiMsgs]=useState([{r:'a',c:'Olá! Sou o Maestro, assistente de adoração do IMWAL.\n\nPosso ajudar com:\n• Setlists por tema bíblico\n• Fluxo progressivo de adoração\n• Reflexões ministeriais\n• Dicas de condução e ensaio\n\nComo posso servir hoje?'}]);
  const [aiIn,setAiIn]=useState('');
  const [aiLoad,setAiLoad]=useState(false);
  const [aiCount,setAiCount]=useState(0);

  const audioCtx=useRef(null);
  const metroTimer=useRef(null);
  const [keyF,setKeyF]=useState('');
  const inCifra=!!selSong&&tab==='repertorio';
  const unread=notifs.filter(n=>!n.read).length;

  /* ── Load auth members ── */
  useEffect(()=>{
    async function loadMembers(){
      try{
        const data=await fetchMembers();
        setAllMembers(data&&data.length>0?data:M);
      }catch{setAllMembers(M);}
      setAuthLoading(false);
    }
    // Check localStorage first
    const stored=localStorage.getItem('ls_profile');
    if(stored){try{const p=JSON.parse(stored);setProfile(p);}catch{localStorage.removeItem('ls_profile');}}
    loadMembers();
  },[]);

  /* ── Load app data ── */
  useEffect(()=>{
    if(!profile)return;
    async function loadData(){
      setDataLoading(true);
      try{
        const [rawSongs,rawEvents]=await Promise.all([fetchSongs(),fetchEvents()]);
        if(rawSongs&&rawSongs.length>0) {
            setSongs(rawSongs);
        } else {
            const lsS = localStorage.getItem('ls_songs');
            setSongs(lsS ? JSON.parse(lsS) : MOCK_SONGS);
        }
        
        if(rawEvents&&rawEvents.length>0) {
            setEvents(rawEvents.map(normalizeEvent));
        } else {
            const lsE = localStorage.getItem('ls_events');
            setEvents(lsE ? JSON.parse(lsE) : MOCK_EVENTS);
        }
      }catch{
        const lsS = localStorage.getItem('ls_songs');
        setSongs(lsS ? JSON.parse(lsS) : MOCK_SONGS);
        const lsE = localStorage.getItem('ls_events');
        setEvents(lsE ? JSON.parse(lsE) : MOCK_EVENTS);
      }
      setDataLoading(false);
    }
    loadData();

    // ── Supabase Realtime ──
    if(!supabase) return;
    const channel = supabase.channel('louvesync_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, payload => {
         loadData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'event_songs' }, payload => {
         loadData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'event_members' }, payload => {
         loadData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'songs' }, payload => {
         loadData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  },[profile]);
  
  // Persist data locally automatically
  useEffect(()=>{
    if(songs.length > 0 && !dataLoading){
      localStorage.setItem('ls_songs', JSON.stringify(songs));
    }
  }, [songs, dataLoading]);
  
  useEffect(()=>{
    if(events.length > 0 && !dataLoading){
      localStorage.setItem('ls_events', JSON.stringify(events));
    }
  }, [events, dataLoading]);

  /* ── Metronome ── */
  useEffect(()=>{
    if(metro&&selSong){
      const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
      if(!audioCtx.current)audioCtx.current=new AC();
      const beats=parseInt(selSong.time_signature?.split('/')[0])||4;
      let idx=-1;
      const tick=()=>{
        const ctx=audioCtx.current;if(!ctx)return;
        idx=(idx+1)%beats;setBeatIdx(idx);
        const o=ctx.createOscillator(),g=ctx.createGain();
        o.connect(g);g.connect(ctx.destination);
        o.frequency.value=idx===0?1200:880;
        g.gain.setValueAtTime(idx===0?.35:.2,ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.055);
        o.start(ctx.currentTime);o.stop(ctx.currentTime+.055);
        if(idx===0&&navigator.vibrate)navigator.vibrate(20);
      };
      tick();metroTimer.current=setInterval(tick,(60/selSong.bpm)*1000);
    }else{setBeatIdx(-1);}
    return()=>{clearInterval(metroTimer.current);if(audioCtx.current){audioCtx.current.close();audioCtx.current=null;}};
  },[metro,selSong]);

  /* ── Handlers ── */
  function handleLogin(member,pin){
    if(member.pin!==pin)return false;
    const {pin:_,...safe}=member;
    localStorage.setItem('ls_profile',JSON.stringify(safe));
    setProfile(safe);return true;
  }
  function handleLogout(){localStorage.removeItem('ls_profile');setProfile(null);setSelSong(null);setSelEvent(null);setTab('home');}
  function navTo(t){vib();setTab(t);if(t!=='repertorio'){setSelSong(null);setSelEvent(null);}}
  function selectSong(s,ev=null){vib();setSelSong(s);setSelEvent(ev);setTr(0);setMetro(false);setBeatIdx(-1);setTab('repertorio');}

  function spawnConfetti(){
    const colors=['#4F46E5','#10B981','#F59E0B','#EC4899','#8B5CF6','#06B6D4'];
    setConfetti(Array.from({length:18},(_,i)=>({id:Date.now()+i,color:colors[i%colors.length],x:Math.random()*100,size:6+Math.random()*8,dl:Math.random()*.6,rot:Math.random()*360})));
    setTimeout(()=>setConfetti([]),1800);
  }

  async function handleConfirm(eventId,confirmed){
    if(!profile)return;
    setEvents(evs=>evs.map(ev=>ev.id===eventId?{...ev,confirmations:{...ev.confirmations,[profile.id]:confirmed}}:ev));
    try{await setPresence(eventId,profile.id,confirmed);}catch(e){console.error('Sync presence failed:',e);}
  }

  function handleDeleteSong(id){
    if(profile?.is_admin){
      setConfirmState({
        title: 'Excluir Música',
        msg: 'Deseja excluir esta música DEFINITIVAMENTE do repertório da igreja?',
        onConfirm: () => {
          setSongs(s=>s.filter(x=>x.id!==id));setSelSong(null);
          dbDelSong(id).catch(console.error);
          setConfirmState(null);
        },
        onCancel: () => setConfirmState(null)
      });
    } else {
      setConfirmState({
        title: 'Solicitar Exclusão',
        msg: 'Você não é administrador. Deseja ENVIAR UM PEDIDO de exclusão desta música para a liderança?',
        onConfirm: () => {
          setSongs(s=>s.map(x=>x.id===id?{...x, delete_requested_by: profile.id}:x));
          setSelSong(null);
          requestDeleteSong(id, profile.id).catch(console.error);
          setConfirmState(null);
        },
        onCancel: () => setConfirmState(null)
      });
    }
  }

  function handleSaveEvent(evs){
    const toAdd = Array.isArray(evs) ? evs : [evs];
    setEvents(p=>[...p,...toAdd]);
    setCreateEvOpen(false);
    spawnConfetti();
    // TODO: sync to Supabase (upsertEvent)
  }

  async function handleSetSequence(evId, songId, seqStr){
    setEvents(evs => evs.map(e => e.id === evId ? {...e, sequenceBySong: {...(e.sequenceBySong||{}), [songId]:seqStr}} : e));
    try {
      await setSequenceForSong(evId, songId, seqStr);
    } catch(err) {
      console.error('Sequence update error', err);
    }
  }

  async function handleSaveSong(song){
    setSongs(p=>[...p,song]);setAddOpen(false);spawnConfetti();
    try{
      const {id:localId,...rest}=song;
      const saved=await upsertSong({...rest,created_by:profile?.id});
      if(saved)setSongs(p=>p.map(s=>s.id===localId?saved:s));
    }catch(e){console.error('Sync song failed:',e);}
  }

  async function sendAI(msg=''){
    const txt=(msg||aiIn).trim();if(!txt||aiLoad||aiCount>=10)return;
    setAiIn('');
    const msgs=[...aiMsgs,{r:'u',c:txt}];
    setAiMsgs(msgs);setAiLoad(true);setAiCount(c=>c+1);
    const history=msgs.slice(-6);
    const GROQ_KEY=import.meta.env.VITE_GROQ_API_KEY;
    try{
      const repertorioStr = songs.map(s => `${s.title} (${s.artist})`).join(', ');
      const sysMsgAI={role:'system',content:`Você é o Maestro, assistente de adoração IMWAL. Responda PRIMEIRO com base NESTE REPERTÓRIO ATUAL DO APP: [${repertorioStr}]. Se o usuário pedir uma música que não está nessa lista, diga que não está no repertório do app, mas você pode ajudar com sugestões ou arranjos se quiser. Seja pastoral. Máx 220 palavras.`};
      const convMsgs=history.map(m=>({role:m.r==='u'?'user':'assistant',content:m.c}));
      const res=await fetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${GROQ_KEY}`},body:JSON.stringify({model:'llama-3.1-8b-instant',max_tokens:400,messages:[sysMsgAI,...convMsgs]})});
      const data=await res.json();
      const reply=data.choices?.[0]?.message?.content||'Sem resposta.';
      setAiMsgs(p=>[...p,{r:'a',c:reply}]);
    }catch{setAiMsgs(p=>[...p,{r:'a',c:'Erro de conexão. Verifique sua internet.',err:true}]);}
    setAiLoad(false);
  }

  /* ── Landscape lock ── */
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
    return <LoginScreen members={allMembers} loading={authLoading} onLogin={handleLogin} dark={dark} setDark={setDark}/>;
  }

  const TABS=[
    {id:'home',ico:<IcoHome s={22}/>,l:'Início'},
    {id:'repertorio',ico:<IcoMusic s={22}/>,l:'Músicas'},
    {id:'escala',ico:<IcoCal s={22}/>,l:'Escala'},
    {id:'membros',ico:<IcoPeople s={22}/>,l:'Membros'},
    {id:'biblia',ico:<IcoBook s={22}/>,l:'Bíblia'},
    {id:'devocional',ico:<IcoHeart s={22}/>,l:'Devocional'},
    {id:'treinamento',ico:<IcoGuitar s={22}/>,l:'Treinar'},
    {id:'ia',ico:<IcoSpark s={22}/>,l:'Maestro'},
    ...(profile?.is_admin ? [{id:'admin',ico:<IcoPeople s={22}/>,l:'Admin'}] : [])
  ];
  const tc=dark?'#E2E8F0':'#0F172A';

  return <div className={`ls${dark?' dark':''}`}>
    <style>{CSS}</style>
    {/* Confetti */}
    {confetti.map(c=><div key={c.id} className="conf-p" style={{left:`${c.x}vw`,top:'-20px',width:c.size,height:c.size,background:c.color,borderRadius:c.size>10?'50%':'2px',animationDelay:`${c.dl}s`,transform:`rotate(${c.rot}deg)`}}/>)}
    {/* Background */}
    <div className={`bg ${dark?'bg-d':'bg-l'}`}>
      <div className="orb" style={{width:480,height:480,top:-150,left:-130,background:dark?'radial-gradient(circle, rgba(79,70,229,.35) 0%, transparent 70%)':'radial-gradient(circle, rgba(79,70,229,.4) 0%, transparent 70%)',animation:'oA 14s ease-in-out infinite'}}/>
      <div className="orb" style={{width:360,height:360,top:'33%',right:-90,background:dark?'radial-gradient(circle, rgba(16,185,129,.25) 0%, transparent 70%)':'radial-gradient(circle, rgba(16,185,129,.35) 0%, transparent 70%)',animation:'oB 17s ease-in-out infinite'}}/>
      <div className="orb" style={{width:400,height:400,bottom:-120,left:'5%',background:dark?'radial-gradient(circle, rgba(236,72,153,.25) 0%, transparent 70%)':'radial-gradient(circle, rgba(139,92,246,.35) 0%, transparent 70%)',animation:'oC 15s ease-in-out infinite'}}/>
      <div className="orb" style={{width:240,height:240,top:'58%',left:'38%',background:dark?'radial-gradient(circle, rgba(245,158,11,.15) 0%, transparent 70%)':'radial-gradient(circle, rgba(245,158,11,.25) 0%, transparent 70%)',animation:'oD 12s ease-in-out infinite'}}/>
    </div>
    {/* Shell */}
    <div style={{position:'relative',zIndex:1,height:'100dvh',display:'flex',flexDirection:'column',maxWidth:500,margin:'0 auto',overflow:'hidden'}}>
      {stageMode&&inCifra&&<Stage song={selSong} tr={tr} mode={mode} setMode={setMode} stageFs={stageFs} setStageFs={setStageFs} dark={dark} onClose={()=>setStageMode(false)} beatIdx={beatIdx}/>}
      {!stageMode&&<>
        {/* OFFLINE BANNER */}
        {!isOnline&&<div style={{background:'rgba(239,68,68,.9)',color:'#fff',textAlign:'center',padding:'5px',fontSize:'var(--fs-xs)',fontWeight:800,display:'flex',alignItems:'center',justifyContent:'center',gap:6,flexShrink:0}}><IcoWifi s={12} off/>Sem conexão — usando dados locais</div>}
        {/* TOP BAR */}
        <div className="gL0" style={{padding:'11px 16px', paddingTop:'calc(env(safe-area-inset-top, 0px) + 11px)', display:'flex',alignItems:'center',justifyContent:'space-between',borderBottom:`1px solid ${dark?'rgba(255,255,255,.06)':'rgba(0,0,0,.05)'}`,position:'sticky',top:0,zIndex:30,flexShrink:0}}>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            {inCifra&&<button onClick={()=>{vib();setSelSong(null);}} style={{padding:'8px 16px',borderRadius:'var(--r-full)',border:'none',background:'rgba(79,70,229,.15)',color:'#4F46E5',display:'flex',alignItems:'center',gap:6,fontWeight:800,fontSize:'var(--fs-sm)',cursor:'pointer',boxShadow:'0 2px 10px rgba(79,70,229,.15)'}}><IcoChevL s={16}/> Voltar</button>}
            {inCifra?<div style={{lineHeight:1.3,textAlign:'right'}}><div className="font-serif" style={{fontSize:16,fontWeight:900,color:tc}}>{selSong.title}</div><div style={{fontSize:'var(--fs-xs)',color:dark?'#94A3B8':'#475569'}}>{selSong.artist}</div></div>
            :<div style={{display:'flex',alignItems:'center',gap:10}}>
              <img src="/logo_solo.png" alt="Logo" style={{height:34, objectFit:'contain', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.08))'}} />
              <div><div style={{fontSize:'var(--fs-lg)',fontWeight:900,color:tc,letterSpacing:'-.02em',lineHeight:1}}>LouveSync</div><div style={{fontSize:8,color:dark?'#94A3B8':'#475569',fontWeight:700,letterSpacing:'.1em',textTransform:'uppercase'}}>IMWAL</div></div>
            </div>}
          </div>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            {!inCifra&&<button onClick={()=>setNotifsOpen(true)} style={{position:'relative',width:36,height:36,borderRadius:'var(--r-sm)',border:'none',background:'rgba(79,70,229,.08)',color:'#4F46E5',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
              <IcoBell s={18}/>{unread>0&&<div className="ndot-ring"/>}
            </button>}
            {!inCifra&&<button title="Sair" onClick={handleLogout} style={{width:36,height:36,borderRadius:'var(--r-sm)',border:'none',background:'rgba(0,0,0,.05)',color:dark?'#94A3B8':'#475569',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer'}}><IcoLogout s={15}/></button>}
            <button className={`tog${dark?' on':''}`} onClick={()=>setDark(p=>!p)} style={{background:dark?'#4F46E5':'#CBD5E1'}} aria-label="Tema"/>
          </div>
        </div>

        {/* MAIN SCROLL */}
        <div style={{flex:1,overflowY:'auto',paddingBottom:inCifra?96:10,minHeight:0,display:'flex',flexDirection:'column'}}>
          {dataLoading&&!inCifra?<Skeleton dark={dark} count={6}/>:<>
            {tab==='home'&&!inCifra&&<Home profile={profile} dark={dark} songs={songs} events={events} members={allMembers} onNavTo={navTo} onSelectSong={s=>{selectSong(s);}} onSetAddOpen={setAddOpen} onConfirm={handleConfirm} spawnConfetti={spawnConfetti} onCreateEvent={()=>setCreateEvOpen(true)}/>}
            {tab==='repertorio'&&!inCifra&&<Repertorio dark={dark} songs={songs} catF={catF} setCatF={setCatF} search={search} setSearch={setSearch} keyF={keyF} setKeyF={setKeyF} favorites={favorites} onToggleFav={toggleFav} onSelectSong={selectSong} onSetAddOpen={setAddOpen}/>}
            {inCifra&&<Cifra dark={dark} song={selSong} event={selEvent} tr={tr} setTr={setTr} mode={mode} setMode={setMode} metro={metro} setMetro={setMetro} beatIdx={beatIdx} stageMode={stageMode} setStageMode={setStageMode} onSendAI={sendAI} onNavTo={navTo} onDeleteSong={handleDeleteSong} onSetSequence={handleSetSequence} profile={profile}/>}
            {tab==='escala'&&!inCifra&&<Escala profile={profile} dark={dark} events={events} songs={songs} members={allMembers} onConfirm={handleConfirm} onEvSheet={setEvSheet} spawnConfetti={spawnConfetti} onCreateEvent={()=>setCreateEvOpen(true)}/>}
            {tab==='membros'&&!inCifra&&<Membros profile={profile} dark={dark} members={allMembers} events={events} selRole={selRole} setSelRole={setSelRole}/>}
            {tab==='ia'&&!inCifra&&<Maestro dark={dark} aiMsgs={aiMsgs} aiIn={aiIn} setAiIn={setAiIn} aiLoad={aiLoad} aiCount={aiCount} onSendAI={sendAI} profile={profile}/>}
            {tab==='devocional'&&!inCifra&&<Devocional dark={dark} profile={profile}/>}
            {tab==='treinamento'&&!inCifra&&<Treinamento dark={dark} profile={profile}/>}
            {tab==='biblia'&&!inCifra&&<Biblia dark={dark}/>}
            {tab==='admin'&&!inCifra&&<PainelAdmin dark={dark} profile={profile} events={events} members={allMembers} songs={songs} setSongs={setSongs} setConfirmState={setConfirmState}/>}
          </>}
        </div>

        {/* BOTTOM NAV — hidden in Cifra */}
        {!inCifra&&<div style={{position:'fixed',bottom:'calc(env(safe-area-inset-bottom, 0px) + 20px)',left:0,right:0,display:'flex',justifyContent:'center',zIndex:50,pointerEvents:'none',maxWidth:500,margin:'0 auto'}}>
          <div className="gNav hide-scroll" style={{borderRadius:100,padding:'6px 10px',display:'flex',gap:2,pointerEvents:'all',overflowX:'auto',maxWidth:'90%',WebkitOverflowScrolling:'touch'}}>
            {TABS.map(n=>{const active=tab===n.id;return <button key={n.id} className={`nb${active?' on':''}`} onClick={()=>navTo(n.id)}>
              <span className="ni" style={{color:active?'#4F46E5':dark?'#94A3B8':'#64748B'}}>{n.ico}</span>
              <span className="nl" style={{color:active?'#4F46E5':dark?'#94A3B8':'#64748B'}}>{n.l}</span>
              <div className="ndot" style={{width:active?22:0,background:dark?'#818CF8':'#4F46E5'}}/>
            </button>;})}
          </div>
        </div>}
      </>}

      {/* OVERLAYS */}
      {addOpen&&<AddSong dark={dark} onSave={handleSaveSong} onClose={()=>setAddOpen(false)}/>}
      {createEvOpen&&!addOpen&&<CreateEvent dark={dark} members={allMembers} songs={songs} events={events} initialDate={createEvDate} onSave={handleSaveEvent} onClose={()=>{setCreateEvOpen(false);setCreateEvDate(null);}}/>}
      {evSheet&&!addOpen&&!createEvOpen&&<EvSheet ev={evSheet} dark={dark} songs={songs} members={allMembers} profile={profile} onClose={()=>setEvSheet(null)} onSelectSong={s=>{selectSong(s);setEvSheet(null);}} onConfirm={handleConfirm} spawnConfetti={spawnConfetti}/>}
      {notifsOpen&&!addOpen&&!createEvOpen&&<NotifsSheet dark={dark} notifs={notifs} onClose={()=>setNotifsOpen(false)} onMarkRead={id=>setNotifs(ns=>ns.map(n=>n.id===id?{...n,read:true}:n))} onMarkAllRead={()=>setNotifs(ns=>ns.map(n=>({...n,read:true})))} onAction={n=>{if(n.ctaAction==='addSong'){setAddOpen(true);setNotifsOpen(false);}else if(n.ctaTab){navTo(n.ctaTab);setNotifsOpen(false);}}}/>}
      {confirmState&&<ConfirmDialog dark={dark} {...confirmState}/>}
    </div>
  </div>;
}
