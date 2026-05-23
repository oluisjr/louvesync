import { useState, useEffect, useRef, useMemo } from "react";

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
html,body,#root{height:100%;overflow:hidden;-webkit-font-smoothing:antialiased;}
.ls{font-family:'Montserrat',sans-serif;height:100dvh;overflow:hidden;position:relative;}
.bg{position:fixed;inset:0;z-index:0;transition:background .7s;}
.bg-l{background:linear-gradient(160deg,#EEF2FF 0%,#E0F2FE 28%,#FDF4FF 58%,#ECFDF5 100%);}
.bg-d{background:linear-gradient(160deg,#05091A 0%,#0D0F2A 30%,#150A35 62%,#040D18 100%);}
.orb{position:absolute;border-radius:50%;pointer-events:none;filter:blur(100px);will-change:transform;}
@keyframes oA{0%,100%{transform:translate(0,0) scale(1)}40%{transform:translate(30px,-45px) scale(1.1)}70%{transform:translate(-15px,22px) scale(.93)}}
@keyframes oB{0%,100%{transform:translate(0,0) scale(1)}35%{transform:translate(-28px,32px) scale(.9)}70%{transform:translate(22px,-18px) scale(1.08)}}
@keyframes oC{0%,100%{transform:translate(0,0) scale(1)}55%{transform:translate(20px,28px) scale(1.06)}}
@keyframes oD{0%,100%{transform:translate(0,0) scale(1)}45%{transform:translate(-18px,-25px) scale(.95)}}
.gL0{background:rgba(255,255,255,.72);backdrop-filter:blur(32px);-webkit-backdrop-filter:blur(32px);border:1px solid rgba(255,255,255,.95);}
.gL1{background:rgba(255,255,255,.62);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);border:1px solid rgba(255,255,255,.88);box-shadow:0 4px 32px rgba(79,70,229,.06);}
.gL2{background:rgba(255,255,255,.96);backdrop-filter:blur(48px);-webkit-backdrop-filter:blur(48px);border-top:1px solid rgba(255,255,255,.9);box-shadow:0 -12px 56px rgba(79,70,229,.12);}
.gNav{background:rgba(255,255,255,.88);backdrop-filter:blur(36px);-webkit-backdrop-filter:blur(36px);border:1px solid rgba(255,255,255,.97);box-shadow:0 12px 40px rgba(79,70,229,.2),0 2px 8px rgba(0,0,0,.05);}
.gIn{background:rgba(255,255,255,.45);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);border:1.5px solid rgba(79,70,229,.18);border-radius:16px;transition:border .2s,box-shadow .2s;}
.gIn:focus-within{border-color:#4F46E5;box-shadow:0 0 0 3px rgba(79,70,229,.1);}
.dark .gL0{background:rgba(8,12,30,.88);border:1px solid rgba(255,255,255,.07);}
.dark .gL1{background:rgba(14,20,44,.82);border:1px solid rgba(255,255,255,.06);box-shadow:0 4px 32px rgba(0,0,0,.28);}
.dark .gL2{background:rgba(6,10,24,.98);border-top:1px solid rgba(255,255,255,.07);}
.dark .gNav{background:rgba(5,8,22,.93);border:1px solid rgba(255,255,255,.1);box-shadow:0 12px 40px rgba(0,0,0,.55);}
.dark .gIn{background:rgba(255,255,255,.03);border-color:rgba(255,255,255,.1);}
.dark .gIn:focus-within{border-color:#818CF8;box-shadow:0 0 0 3px rgba(129,140,248,.12);}
.aC-jubilo{border-left:3.5px solid #10B981;}.aC-adoracao{border-left:3.5px solid #4F46E5;}
.aC-hinario{border-left:3.5px solid #F59E0B;}.aC-oferta{border-left:3.5px solid #EC4899;}
::-webkit-scrollbar{width:3px;height:3px;}::-webkit-scrollbar-thumb{background:rgba(79,70,229,.22);border-radius:2px;}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
@keyframes slideUp{from{opacity:0;transform:translateY(22px)}to{opacity:1;transform:translateY(0)}}
@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
@keyframes bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
@keyframes confDrop{0%{transform:translateY(-10px) rotate(0deg);opacity:1}100%{transform:translateY(240px) rotate(540deg);opacity:0}}
@keyframes stageIn{from{opacity:0;transform:scale(.97)}to{opacity:1;transform:scale(1)}}
@keyframes beatGlow{0%,100%{box-shadow:0 0 0 0 rgba(16,185,129,.5)}50%{box-shadow:0 0 0 14px rgba(16,185,129,0)}}
.aUp{animation:slideUp .38s cubic-bezier(.22,1,.36,1) both;}
.stage-wrap{position:fixed;inset:0;z-index:200;overflow:hidden;animation:stageIn .35s ease;}
.nb{display:flex;flex-direction:column;align-items:center;gap:2px;padding:8px 12px;border:none;background:transparent;cursor:pointer;position:relative;transition:transform .15s;}
.nb:active{transform:scale(.9);}
.nb .ni{font-size:20px;line-height:1;transition:transform .28s cubic-bezier(.34,1.56,.64,1);}
.nb.on .ni{transform:scale(1.22);}
.nl{font-size:9px;font-weight:700;letter-spacing:.04em;font-family:'Montserrat',sans-serif;transition:color .2s;}
.ndot{position:absolute;bottom:3px;left:50%;transform:translateX(-50%);height:3px;border-radius:100px;transition:width .32s cubic-bezier(.34,1.56,.64,1);}
.sc{border-radius:20px;padding:16px;cursor:pointer;transition:transform .22s cubic-bezier(.34,1.56,.64,1),box-shadow .22s;margin-bottom:11px;}
.sc:hover{transform:translateY(-3px);box-shadow:0 16px 36px rgba(79,70,229,.14);}
.sc:active{transform:scale(.97);}
.bp{background:linear-gradient(135deg,#4F46E5,#6D28D9);color:#fff;border:none;border-radius:15px;padding:14px 20px;font-family:'Montserrat',sans-serif;font-weight:800;font-size:14px;cursor:pointer;width:100%;display:flex;align-items:center;justify-content:center;gap:8px;transition:all .2s;}
.bp:hover{opacity:.9;box-shadow:0 8px 28px rgba(79,70,229,.38);}
.bp:active{transform:scale(.97);}
.bp:disabled{opacity:.5;cursor:not-allowed;}
.bSec{border:1.5px solid rgba(79,70,229,.3);color:#4F46E5;background:rgba(79,70,229,.06);border-radius:12px;padding:11px 16px;font-family:'Montserrat',sans-serif;font-weight:700;font-size:13px;cursor:pointer;width:100%;transition:all .2s;display:flex;align-items:center;justify-content:center;gap:8px;}
.dark .bSec{color:#818CF8;border-color:rgba(129,140,248,.3);background:rgba(129,140,248,.06);}
.chord{font-family:'JetBrains Mono',monospace;color:#F59E0B;font-weight:800;font-size:12px;line-height:1.1;display:block;min-height:14px;}
.bdg{display:inline-flex;align-items:center;gap:5px;padding:4px 12px;border-radius:100px;font-size:11px;font-weight:800;}
.bJ{background:rgba(16,185,129,.1);color:#059669;border:1px solid rgba(16,185,129,.22);}
.bA{background:rgba(79,70,229,.1);color:#4F46E5;border:1px solid rgba(79,70,229,.22);}
.bH{background:rgba(245,158,11,.1);color:#D97706;border:1px solid rgba(245,158,11,.22);}
.bO{background:rgba(236,72,153,.1);color:#DB2777;border:1px solid rgba(236,72,153,.22);}
.dark .bJ{background:rgba(16,185,129,.15);color:#34D399;}.dark .bA{background:rgba(99,102,241,.15);color:#818CF8;}
.dark .bH{background:rgba(245,158,11,.15);color:#FBBF24;}.dark .bO{background:rgba(236,72,153,.15);color:#F472B6;}
.tog{width:52px;height:28px;border-radius:100px;border:none;cursor:pointer;position:relative;flex-shrink:0;transition:background .35s;}
.tog::after{content:'';position:absolute;top:4px;left:4px;width:20px;height:20px;background:#fff;border-radius:50%;transition:transform .32s cubic-bezier(.34,1.56,.64,1);box-shadow:0 1px 5px rgba(0,0,0,.18);}
.tog.on::after{transform:translateX(24px);}
.pbar{height:3px;border-radius:100px;background:rgba(79,70,229,.1);overflow:hidden;}
.pbar-fill{height:100%;border-radius:100px;background:linear-gradient(90deg,#4F46E5,#7C3AED);transition:width .5s ease;}
.conf{position:fixed;pointer-events:none;z-index:9999;font-size:22px;animation:confDrop 1.3s ease-out forwards;}
.fi{width:100%;padding:12px 14px;background:transparent;border:none;outline:none;font-family:'Montserrat',sans-serif;font-size:14px;font-weight:500;}
textarea.fi{resize:none;}
.ndot-ring{position:absolute;top:-1px;right:-1px;width:9px;height:9px;background:#EF4444;border-radius:50%;border:2px solid rgba(255,255,255,.9);}
input,textarea,button{font-family:'Montserrat',sans-serif;}
`;

const CAT={
  jubilo:  {label:'Júbilo',  icon:'🎉',color:'#10B981',cls:'bJ',acc:'aC-jubilo'},
  adoracao:{label:'Adoração',icon:'🙏',color:'#4F46E5',cls:'bA',acc:'aC-adoracao'},
  hinario: {label:'Hinário', icon:'📖',color:'#F59E0B',cls:'bH',acc:'aC-hinario'},
  oferta:  {label:'Oferta',  icon:'💝',color:'#EC4899',cls:'bO',acc:'aC-oferta'},
};
const SH=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const FL=['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
function tNote(n,st){let i=SH.indexOf(n);if(i===-1)i=FL.indexOf(n);if(i===-1)return n;return(n.includes('b')&&n!=='B')?FL[((i+st)%12+12)%12]:SH[((i+st)%12+12)%12];}
function tChord(ch,st){const m=ch.match(/^([A-G][#b]?)(.*?)(?:\/([A-G][#b]?)(.*))?$/);if(!m)return ch;const r=tNote(m[1],st),q=m[2]||'';if(m[3])return r+q+'/'+tNote(m[3],st)+(m[4]||'');return r+q;}
function tLyrics(txt,st){if(!st)return txt;return txt.replace(/\[([A-G][#b]?[^\]]*)\]/g,(_,c)=>'['+tChord(c,st)+']');}
function getKey(k,st){const i=SH.indexOf(k);if(i===-1)return k;return SH[((i+st)%12+12)%12];}
function fDate(ds){return new Date(ds+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'short'});}
function today(){return new Date().toISOString().slice(0,10);}
function parseLine(line){
  const segs=[];const parts=line.split(/(\[[^\]]+\])/);let i=0;
  while(i<parts.length){
    if(parts[i]?.startsWith('[')&&parts[i]?.endsWith(']')){
      const ch=parts[i].slice(1,-1);const nx=parts[i+1];const ly=(nx&&!nx.startsWith('['))?nx:'';
      segs.push({ch,ly});i+=(nx&&!nx.startsWith('['))?2:1;
    }else{if(parts[i])segs.push({ch:'',ly:parts[i]});i++;}
  }
  return segs;
}

const SONGS=[
  {id:1,title:'Oceanos',artist:'Hillsong United (PT)',cat:'adoracao',key:'C',bpm:68,tags:['Worship','Contemporânea'],
   lyrics:`Verso 1:\n[Am]Tu me chamas às [F]profundezas\n[C]Além das margens da [G]fé segura\n[Am]Onde os pés podem [F]falhar\nE o [C]medo me consome [G]\n\nPré-Coro:\n[F]Espírito, conduz-me onde [C]minha fé\n[Am]Caminhe sobre as [G]águas\n[F]Para onde Tu es[G]tás\n\nCoro:\n[C]Oceanos onde pés jamais toca[G]rão\n[Am]Que me aprofun[F]de\n[C]Levanta-me do fun[G]do\n[Am]Leva-me além dos [F]limites da minha [G]fé\n\nPonte:\n[Am]Espírito, Espírito [F]\n[C]Espírito, conduzi-[G]me\n[Am]Espírito, Espírito [F]\n[C]Para onde Tu es[G]tás`},
  {id:2,title:'Maravilhosa Graça',artist:'Ministério Ágape',cat:'jubilo',key:'D',bpm:95,tags:['Júbilo','Abertura'],
   lyrics:`Verso:\n[D]Maravilhosa graça do [A]Senhor\n[Bm]Que salvou um pecador co[G]mo eu\n[D]Fui perdido mas Ele me a[A]chou\n[Bm]Cego mas agora eu [G]vejo\n\nCoro:\n[G]Graça, graça, [D]graça de Deus\n[A]Me salvou e me [Bm]transformou\n[G]Graça, graça, [D]graça de Deus\n[A]Para sempre me [G]restaurou\n\nPonte:\n[D]Quando pesei [A]meus pecados\n[Bm]Sua graça foi [G]maior\n[D]Na Cruz o preço [A]foi pago\n[Bm]Pela graça do Se[G]nhor`},
  {id:3,title:'Ainda que a Figueira',artist:'Shirley Carvalhaes',cat:'adoracao',key:'G',bpm:72,tags:['Profunda','Fé'],
   lyrics:`Verso:\n[G]Ainda que a figuei[D]ra não floresça\n[Em]E nos parrei[C]rais nada produza\n[G]Ainda que o produto da oliv[D]eira falhe\nE os [Em]campos não deem [C]mantimento\n\nPré-Coro:\n[Am]Ainda que o rebanho [D]seja retirado\nE não [G]haja vacas nos estábulos\n\nCoro:\n[C]Ainda assim me ale[G]grarei no [D]Senhor\n[Em]Me alegra[C]rei no Deus da [G]minha salva[D]ção\n[C]Ainda assim me ale[G]grarei no [D]Senhor\n[Em]Me alegra[C]rei no [G]Senhor [D]`},
  {id:4,title:'Castelo Forte',artist:'Harpa Cristã nº 26',cat:'hinario',key:'F',bpm:80,tags:['Clássico','Harpa'],
   lyrics:`Verso 1:\n[F]Castelo forte é nosso [C7]Deus\nBom [F]baluarte e [Bb]bom escudo\n[F]Com Ele à frente, quem mais [C]temos\n[F]Que nos valha mais que [C7]tudo?\n\nCoro:\n[Bb]Castelo [F]forte é [C7]nosso [F]Deus\n[Bb]Nosso [F]Deus, [C7]nosso [F]Deus\n[Bb]Castelo [F]forte é [C7]nosso [F]Deus\n[Bb]Nossa forta[C7]leza e [F]amparo!`},
  {id:5,title:'Oferta de Amor',artist:'Fernandinho',cat:'oferta',key:'A',bpm:76,tags:['Ofertório','Devoção'],
   lyrics:`Verso:\n[A]Tudo que sou, tudo que [E]tenho\n[F#m]Coloco aos Teus [D]pés\n[A]Toda a minha vida é [E]uma oferta\n[F#m]Pra Te a[D]gradar\n\nCoro:\n[D]Recebe minha ofer[A]ta de amor\n[E]Com todo o meu cora[F#m]ção\n[D]Tudo que eu sou é [A]Teu, Senhor\n[E]Minha devo[D]ção\n\nPonte:\n[D]Não tenho ouro, [A]não tenho prata\n[E]Mas tenho um cora[F#m]ção\n[D]Que quer Te ado[A]rar\n[E]Esta é minha oferta de a[D]mor`},
  {id:6,title:'Tu és Santo',artist:'Hillsong / PT',cat:'adoracao',key:'E',bpm:65,tags:['Santidade','Worship'],
   lyrics:`Verso:\n[E]Tu és Santo, Tu és [A]Santo\nTu és dig[B]no de louvores\n[C#m]Tu és Santo, Tu és [A]Santo\n[B]Glória a Ti Se[E]nhor\n\nCoro:\n[A]Santo, Santo, [E]Santo é o Senhor\n[B]Todo Podero[C#m]so Deus\n[A]Santo, Santo, [E]Santo é o Senhor\n[B]Glória a [A]Ti!\n\nPonte:\n[A]Digno és de ser lo[E]uvado\n[B]Digno és de ser adora[C#m]do\n[A]Digno és de toda [E]honra\n[B]Glória a [A]Ti! [B][E]`},
  {id:7,title:'Aleluia',artist:'Coral Kemuel',cat:'jubilo',key:'G',bpm:120,tags:['Animada','Celebração'],
   lyrics:`Coro:\n[G]Aleluia, [D]aleluia\n[Em]Aleluia ao [C]Senhor\n[G]Aleluia, [D]aleluia\n[Em]Glória ao Cria[C]dor\n\nVerso:\n[G]Que todo ser vi[D]vente\nLouve o nome do [Em]Senhor\n[C]De toda nação e lín[G]gua\n[D]Toda criatura ado[C]rai ao Senhor!\n\nPonte:\n[G]Glória, glória, [D]glória\n[Em]Ao Rei dos [C]reis\n[G]Glória, glória, [D]glória\n[Em]Para sem[C]pre e além!`},
  {id:8,title:'Quão Grande és Tu',artist:'Hinário / Clássico',cat:'hinario',key:'Bb',bpm:74,tags:['Clássico','Majestade'],
   lyrics:`Verso:\n[Bb]Senhor meu Deus, quando eu, com olhos [F]meus\n[Gm]Contemplo o céu e o infinito [Eb]espaço\n[Bb]A lua, as estrelas e a luz que é dada\n[F]Por Tua mão em toda a sua [Bb]graça\n\nCoro:\n[Eb]Então minha alma [Bb]adora a Ti!\n[F]Quão grande és [Bb]Tu!\n[Eb]Então minha alma [Bb]adora a Ti!\n[F]Quão grande és [Bb]Tu!`},
];
const MEMBERS=[
  {id:1,name:'Ana Paula',role:'Solista Principal',avatar:'AP',color:'#4F46E5',instrument:'Voz',status:'ativo',confirmRate:95},
  {id:2,name:'Carlos M.',role:'Guitarra',avatar:'CM',color:'#10B981',instrument:'Guitarra',status:'ativo',confirmRate:88},
  {id:3,name:'Marcos S.',role:'Baixo',avatar:'MS',color:'#F59E0B',instrument:'Baixo',status:'ativo',confirmRate:92},
  {id:4,name:'Fernanda',role:'Teclas / Piano',avatar:'FD',color:'#EC4899',instrument:'Piano',status:'ativo',confirmRate:100},
  {id:5,name:'Paulo R.',role:'Bateria',avatar:'PR',color:'#06B6D4',instrument:'Bateria',status:'ativo',confirmRate:78},
  {id:6,name:'Lúcia B.',role:'Solista',avatar:'LB',color:'#8B5CF6',instrument:'Voz',status:'ativo',confirmRate:90},
  {id:7,name:'Rafael T.',role:'Violão',avatar:'RT',color:'#EF4444',instrument:'Violão',status:'licença',confirmRate:60},
];
const SCHED=[
  {id:1,date:'2026-05-21',type:'culto', label:'Culto Noturno',  time:'19:00',theme:'Fidelidade de Deus',  songs:[1,2,6],  members:[1,2,3,4,5]},
  {id:2,date:'2026-05-23',type:'ensaio',label:'Ensaio Geral',   time:'15:00',theme:null,                  songs:[1,3,7],  members:[1,2,4,6]},
  {id:3,date:'2026-05-24',type:'culto', label:'Culto de Manhã', time:'09:00',theme:'Graça Suficiente',    songs:[7,3,4,5],members:[1,2,3,4,5,6]},
  {id:4,date:'2026-05-28',type:'culto', label:'Culto de Quinta',time:'19:30',theme:'Adoração Verdadeira', songs:[2,6,5],  members:[1,4,5,6]},
  {id:5,date:'2026-05-31',type:'ensaio',label:'Ensaio',         time:'15:00',theme:null,                  songs:[2,7,1],  members:[1,2,3,4,5,6]},
  {id:6,date:'2026-06-01',type:'culto', label:'Culto de Manhã', time:'09:00',theme:'Perseverança na Fé',  songs:[3,6,4,5],members:[1,2,4,5]},
];
const INIT_NOTIFS=[
  {id:1,type:'escala', text:'Você foi escalado para o Culto Noturno de Quinta',time:'há 2h', read:false},
  {id:2,type:'musica', text:'Nova música adicionada ao repertório',            time:'há 5h', read:false},
  {id:3,type:'ensaio', text:'Ensaio amanhã às 15h — confirme presença',       time:'há 8h', read:false},
  {id:4,type:'troca',  text:'Carlos M. transpôs "Oceanos" de C→D',            time:'ontem', read:true},
  {id:5,type:'confirm',text:'Ana Paula confirmou presença no Culto de Manhã', time:'ontem', read:true},
];

// ── ATOMS ──
function Ava({m,size=36,ring=false}){return<div style={{width:size,height:size,borderRadius:'50%',background:m.color,color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:size*.32,fontWeight:900,flexShrink:0,border:ring?'2.5px solid rgba(255,255,255,.9)':`${size>30?2:1.5}px solid rgba(255,255,255,.8)`,boxShadow:`0 2px 10px ${m.color}50`}}>{m.avatar}</div>;}
function Bdg({cat}){const c=CAT[cat];return<span className={`bdg ${c.cls}`}>{c.icon} {c.label}</span>;}
function KeyChip({k,size=11}){return<span style={{background:'rgba(79,70,229,.1)',color:'#4F46E5',border:'1px solid rgba(79,70,229,.2)',borderRadius:100,padding:`${size<12?2:3}px ${size<12?8:12}px`,fontSize:size,fontWeight:800,fontFamily:"'JetBrains Mono',monospace",flexShrink:0}}>{k}</span>;}
function BpmChip({bpm}){return<span style={{background:'rgba(245,158,11,.1)',color:'#D97706',border:'1px solid rgba(245,158,11,.2)',borderRadius:100,padding:'2px 8px',fontSize:10,fontWeight:700}}>♩{bpm}</span>;}
function Sec({t}){return<div style={{fontSize:9,fontWeight:900,color:'#F59E0B',letterSpacing:'.14em',textTransform:'uppercase',margin:'18px 0 6px',display:'flex',alignItems:'center',gap:6}}><div style={{width:16,height:1.5,background:'#F59E0B',opacity:.5}}/>{t}<div style={{flex:1,height:1.5,background:'#F59E0B',opacity:.5}}/></div>;}
function Loader(){return<div style={{width:20,height:20,borderRadius:'50%',border:'2.5px solid rgba(79,70,229,.2)',borderTopColor:'#4F46E5',animation:'spin .7s linear infinite'}}/>;}

function LyricView({text,st=0,mode='chords',dark,fs=17}){
  const tc=dark?'#E2E8F0':'#1E293B';
  const lines=tLyrics(text,st).split('\n');
  return<div style={{fontFamily:"'Montserrat',sans-serif"}}>{lines.map((line,li)=>{
    if(!line.trim())return<div key={li} style={{height:8}}/>;
    if(/^(Verso|Coro|Pré-Coro|Ponte|Intro|Final|Outro|Bridge)[\s:]?(\d*)$/i.test(line.trim()))return<Sec key={li} t={line.trim()}/>;
    if(mode==='lyrics'||!line.includes('['))return<div key={li} style={{fontSize:fs,lineHeight:1.8,color:tc,marginBottom:1,whiteSpace:'pre-wrap',wordBreak:'break-word'}}>{line.replace(/\[[^\]]+\]/g,'')}</div>;
    return<div key={li} style={{display:'flex',flexWrap:'wrap',marginBottom:5,alignItems:'flex-end'}}>{parseLine(line).map((seg,si)=><span key={si} style={{display:'inline-flex',flexDirection:'column',alignItems:'flex-start'}}><span className="chord">{seg.ch||' '}</span><span style={{fontSize:fs,lineHeight:1.7,color:tc,whiteSpace:'pre'}}>{seg.ly||(seg.ch?' ':'')}</span></span>)}</div>;
  })}</div>;
}


export default function LouveSync(){
  const [dark,setDark]=useState(false);
  const [tab,setTab]=useState('home');
  const [songs,setSongs]=useState(SONGS);
  const [notifs,setNotifs]=useState(INIT_NOTIFS);
  const [selSong,setSelSong]=useState(null);
  const [tr,setTr]=useState(0);
  const [mode,setMode]=useState('chords');
  const [stageMode,setStageMode]=useState(false);
  const [stageFs,setStageFs]=useState(22);
  const [metro,setMetro]=useState(false);
  const [beat,setBeat]=useState(false);
  const [catF,setCatF]=useState('all');
  const [search,setSearch]=useState('');
  const [confs,setConfs]=useState({1:true,2:false,3:true,4:true,5:false,6:true});
  const [evSheet,setEvSheet]=useState(null);
  const [aiMsgs,setAiMsgs]=useState([{r:'a',c:'Olá! Sou o Assistente de Adoração do LouveSync. 🎵\n\nPosso ajudar com:\n• Setlists por tema bíblico\n• Fluxo progressivo de adoração\n• Reflexões ministeriais\n• Dicas de condução e transições\n\nComo posso servir hoje?'}]);
  const [aiIn,setAiIn]=useState('');
  const [aiLoad,setAiLoad]=useState(false);
  const [addOpen,setAddOpen]=useState(false);
  const [addStep,setAddStep]=useState(1);
  const [addF,setAddF]=useState({title:'',artist:'',cat:'adoracao',key:'G',bpm:'80',lyrics:'',tags:''});
  const [genLoad,setGenLoad]=useState(false);
  const [notifsOpen,setNotifsOpen]=useState(false);
  const [confetti,setConfetti]=useState([]);
  const [selRole,setSelRole]=useState('Todos');
  const aiEnd=useRef(null);
  const audioCtx=useRef(null);
  const metroTimer=useRef(null);

  const d=dark, tc=d?'#E2E8F0':'#0F172A', t2=d?'#94A3B8':'#475569';
  const gc='gL1', CS={borderRadius:20,padding:'17px',marginBottom:12};
  const todayStr=today(), inCifra=!!selSong&&tab==='repertorio';
  const unread=notifs.filter(n=>!n.read).length;

  useEffect(()=>{
    if(metro&&selSong){
      const AC=window.AudioContext||window.webkitAudioContext; if(!AC)return;
      if(!audioCtx.current)audioCtx.current=new AC();
      const tick=()=>{
        const ctx=audioCtx.current; if(!ctx)return;
        const o=ctx.createOscillator(),g=ctx.createGain();
        o.connect(g);g.connect(ctx.destination);
        o.frequency.value=1040;g.gain.setValueAtTime(.28,ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.055);
        o.start(ctx.currentTime);o.stop(ctx.currentTime+.055);
        setBeat(true);setTimeout(()=>setBeat(false),110);
      };
      tick(); metroTimer.current=setInterval(tick,(60/selSong.bpm)*1000);
    }
    return()=>{clearInterval(metroTimer.current);if(audioCtx.current){audioCtx.current.close();audioCtx.current=null;}};
  },[metro,selSong]);

  useEffect(()=>{aiEnd.current?.scrollIntoView({behavior:'smooth'});},[aiMsgs]);

  function spawnConfetti(){
    const e=['🎉','✨','🎊','🙏','🎵','💫','🌟'];
    setConfetti(Array.from({length:14},(_,i)=>({id:Date.now()+i,e:e[i%e.length],x:Math.random()*100,dl:Math.random()*.7})));
    setTimeout(()=>setConfetti([]),1600);
  }

  async function sendAI(msg=''){
    const txt=(msg||aiIn).trim(); if(!txt||aiLoad)return;
    setAiIn('');
    const msgs=[...aiMsgs,{r:'u',c:txt}];
    setAiMsgs(msgs); setAiLoad(true);
    try{
      const res=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:1000,
          system:'Você é o Assistente de Adoração do LouveSync — IA especializada em ministério de louvor evangélico brasileiro. Expertise: sugestão de músicas por tema (categoria Júbilo/Adoração/Hinário/Oferta, tom, BPM, justificativa ministerial), setlists com fluxo progressivo, reflexões bíblicas, técnicas de condução, orientação sobre escalas e ensaios. Responda em português brasileiro. Seja pastoral, prático e inspirador. Use • para listas. Máximo 250 palavras.',
          messages:msgs.map(m=>({role:m.r==='u'?'user':'assistant',content:m.c}))})});
      const data=await res.json();
      setAiMsgs(p=>[...p,{r:'a',c:data.content?.[0]?.text||'Erro na resposta.'}]);
    }catch{setAiMsgs(p=>[...p,{r:'a',c:'Erro de conexão. Tente novamente. 🔌'}]);}
    setAiLoad(false);
  }

  async function genCifra(){
    if(!addF.title)return; setGenLoad(true);
    try{
      const res=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({model:'claude-sonnet-4-20250514',max_tokens:800,
          system:'Especialista em cifras gospel brasileiras. Gere cifras com acordes em colchetes [G],[Em],[C7]. Inclua: Verso, Pré-Coro, Coro, Ponte. Responda APENAS com a cifra, sem markdown ou explicações.',
          messages:[{role:'user',content:`Cifra de "${addF.title}" de ${addF.artist||'Ministério Gospel'} no tom ${addF.key}.`}]})});
      const data=await res.json();
      setAddF(f=>({...f,lyrics:data.content?.[0]?.text||''})); setAddStep(3);
    }catch{alert('Erro ao gerar. Tente manualmente.');}
    setGenLoad(false);
  }

  function saveSong(){
    if(!addF.title||!addF.lyrics)return;
    setSongs(p=>[...p,{id:Date.now(),title:addF.title,artist:addF.artist||'Ministério',cat:addF.cat,key:addF.key,bpm:parseInt(addF.bpm)||80,lyrics:addF.lyrics,tags:addF.tags.split(',').map(t=>t.trim()).filter(Boolean)}]);
    setAddOpen(false);setAddF({title:'',artist:'',cat:'adoracao',key:'G',bpm:'80',lyrics:'',tags:''});setAddStep(1);spawnConfetti();
  }

  function navTo(t){setTab(t);if(t!=='repertorio')setSelSong(null);}

  const filtSongs=useMemo(()=>{
    let s=catF==='all'?songs:songs.filter(x=>x.cat===catF);
    if(search.trim())s=s.filter(x=>x.title.toLowerCase().includes(search.toLowerCase())||x.artist.toLowerCase().includes(search.toLowerCase()));
    return s;
  },[songs,catF,search]);

  // ─────────────────── HOME ───────────────────
  function Home(){
    const up=SCHED.filter(s=>s.date>=todayStr),nxt=up[0];
    const nS=nxt?.songs.map(id=>songs.find(s=>s.id===id)).filter(Boolean)||[];
    const nM=nxt?.members.map(id=>MEMBERS.find(m=>m.id===id)).filter(Boolean)||[];
    const days=Array.from({length:7},(_,i)=>{const dt=new Date();dt.setDate(dt.getDate()+i);const ds=dt.toISOString().slice(0,10);return{ds,dt,ev:SCHED.find(s=>s.date===ds)};});
    return<div style={{padding:'16px 16px 0'}}>
      <div className="aUp" style={{marginBottom:16,display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
        <div>
          <div style={{fontSize:11,color:'#4F46E5',fontWeight:800,marginBottom:4,letterSpacing:'.08em'}}>✦ BEM-VINDO DE VOLTA</div>
          <div style={{fontSize:26,fontWeight:900,color:tc,letterSpacing:'-.03em',lineHeight:1.1}}>Ministério<br/>de Louvor</div>
        </div>
        <div style={{textAlign:'right',paddingTop:4}}>
          <div style={{fontSize:8,color:t2,fontWeight:700,letterSpacing:'.06em',textTransform:'uppercase',marginBottom:2}}>Hoje</div>
          <div style={{fontSize:12,fontWeight:800,color:tc}}>{new Date().toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'short'})}</div>
        </div>
      </div>
      {/* Stats */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8,marginBottom:12}}>
        {[{v:songs.length,l:'Músicas',i:'🎵',c:'#4F46E5'},{v:MEMBERS.filter(m=>m.status==='ativo').length,l:'Membros',i:'👥',c:'#10B981'},{v:SCHED.filter(s=>s.type==='culto'&&s.date>=todayStr).length,l:'Cultos',i:'⛪',c:'#F59E0B'},{v:Object.values(confs).filter(Boolean).length,l:'Confirm.',i:'✓',c:'#EC4899'}].map((s,i)=>(
          <div key={s.l} className={`${gc} aUp`} style={{borderRadius:16,padding:'12px 6px',textAlign:'center',animationDelay:`${i*.05}s`}}>
            <div style={{fontSize:16,marginBottom:2}}>{s.i}</div>
            <div style={{fontSize:18,fontWeight:900,color:s.c,lineHeight:1}}>{s.v}</div>
            <div style={{fontSize:8,color:t2,fontWeight:700,marginTop:2}}>{s.l}</div>
          </div>
        ))}
      </div>
      {/* Calendar strip */}
      <div className={`${gc} aUp`} style={{...CS,animationDelay:'.06s'}}>
        <div style={{fontSize:9,fontWeight:800,color:t2,letterSpacing:'.1em',textTransform:'uppercase',marginBottom:10}}>📅 Agenda da Semana</div>
        <div style={{display:'flex',gap:6,overflowX:'auto',paddingBottom:2}}>
          {days.map(({ds,dt,ev})=>{const isT=ds===todayStr;return(
            <div key={ds} onClick={()=>ev&&setEvSheet(ev)} style={{flexShrink:0,width:50,borderRadius:14,padding:'9px 0',textAlign:'center',cursor:ev?'pointer':'default',background:isT?'#4F46E5':ev?'rgba(79,70,229,.08)':'transparent',border:`1px solid ${ev&&!isT?'rgba(79,70,229,.2)':'transparent'}`,transition:'all .2s',opacity:ev||isT?1:.45}}>
              <div style={{fontSize:8,fontWeight:700,color:isT?'rgba(255,255,255,.75)':t2,marginBottom:3}}>{dt.toLocaleDateString('pt-BR',{weekday:'short'}).slice(0,3).toUpperCase()}</div>
              <div style={{fontSize:18,fontWeight:900,color:isT?'#fff':ev?'#4F46E5':tc,lineHeight:1}}>{dt.getDate()}</div>
              {ev&&<div style={{width:5,height:5,borderRadius:'50%',margin:'5px auto 0',background:isT?'rgba(255,255,255,.8)':ev.type==='culto'?'#4F46E5':'#10B981'}}/>}
            </div>
          );})}
        </div>
      </div>
      {/* Next event */}
      {nxt&&<div className={`${gc} aUp`} style={{...CS,animationDelay:'.11s',position:'relative',overflow:'hidden'}}>
        <div style={{position:'absolute',top:0,right:0,width:100,height:100,background:'linear-gradient(135deg,rgba(79,70,229,.07),transparent)',borderRadius:'0 20px 0 100%'}}/>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:12}}>
          <div>
            <span style={{display:'inline-block',fontSize:9,fontWeight:800,padding:'3px 10px',borderRadius:100,marginBottom:6,background:nxt.type==='culto'?'rgba(79,70,229,.1)':'rgba(16,185,129,.1)',color:nxt.type==='culto'?'#4F46E5':'#059669',border:`1px solid ${nxt.type==='culto'?'rgba(79,70,229,.2)':'rgba(16,185,129,.2)'}`}}>{nxt.type==='culto'?'⛪ PRÓXIMO CULTO':'🎸 PRÓXIMO ENSAIO'}</span>
            <div style={{fontSize:17,fontWeight:900,color:tc,lineHeight:1.2}}>{nxt.label}</div>
          </div>
          <div style={{textAlign:'right',flexShrink:0}}>
            <div style={{fontSize:19,fontWeight:900,color:tc,lineHeight:1}}>{nxt.time}</div>
            <div style={{fontSize:10,color:t2,marginTop:2}}>{fDate(nxt.date)}</div>
          </div>
        </div>
        {nxt.theme&&<div style={{background:'rgba(79,70,229,.06)',borderRadius:10,padding:'8px 12px',marginBottom:12,fontSize:12,color:'#4F46E5',fontWeight:700,border:'1px solid rgba(79,70,229,.14)'}}>📖 {nxt.theme}</div>}
        <div style={{marginBottom:12}}>
          <div style={{fontSize:9,color:t2,fontWeight:800,textTransform:'uppercase',letterSpacing:'.1em',marginBottom:7}}>Setlist</div>
          {nS.map((s,i)=><div key={s.id} onClick={()=>{setSelSong(s);setTr(0);setMetro(false);setTab('repertorio');}} style={{display:'flex',alignItems:'center',gap:9,padding:'8px 0',cursor:'pointer',borderBottom:i<nS.length-1?`1px solid ${d?'rgba(255,255,255,.05)':'rgba(0,0,0,.05)'}`:'none'}}>
            <span style={{width:22,height:22,borderRadius:7,background:'rgba(79,70,229,.1)',color:'#4F46E5',fontSize:9,fontWeight:900,display:'flex',alignItems:'center',justifyContent:'center'}}>{i+1}</span>
            <div style={{flex:1}}><div style={{fontSize:12,fontWeight:800,color:tc,lineHeight:1.2}}>{s.title}</div><div style={{fontSize:9,color:t2}}>{s.artist}</div></div>
            <KeyChip k={s.key} size={10}/><span style={{fontSize:13}}>{CAT[s.cat].icon}</span>
          </div>)}
        </div>
        <div style={{display:'flex',alignItems:'center',gap:4}}>
          {nM.slice(0,6).map((m,i)=><div key={m.id} style={{marginLeft:i?-8:0,zIndex:10-i}}><Ava m={m} size={26} ring/></div>)}
          {nM.length>6&&<span style={{fontSize:9,color:t2,marginLeft:5,fontWeight:600}}>+{nM.length-6}</span>}
          <span style={{fontSize:10,color:t2,fontWeight:600,marginLeft:6}}>{nM.length} escalado{nM.length!==1?'s':''}</span>
        </div>
      </div>}
      {/* Quick actions */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12}} className="aUp">
        {[{i:'🤖',l:'IA Worship',s:'Setlists com IA',g:'linear-gradient(135deg,#4F46E5,#7C3AED)',a:()=>navTo('ia')},{i:'➕',l:'Adicionar',s:'Nova música',g:'linear-gradient(135deg,#10B981,#059669)',a:()=>{setAddOpen(true);setAddStep(1);}}].map(a=><button key={a.l} onClick={a.a} style={{padding:'16px 14px',borderRadius:18,border:'none',cursor:'pointer',background:a.g,display:'flex',flexDirection:'column',alignItems:'flex-start',gap:5,boxShadow:'0 6px 20px rgba(0,0,0,.14)'}}>
          <span style={{fontSize:24}}>{a.i}</span>
          <span style={{fontSize:13,fontWeight:800,color:'#fff'}}>{a.l}</span>
          <span style={{fontSize:10,color:'rgba(255,255,255,.75)',fontWeight:600}}>{a.s}</span>
        </button>)}
      </div>
      {/* Team strip */}
      <div className={`${gc} aUp`} style={{...CS,animationDelay:'.17s',marginBottom:20}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
          <div style={{fontSize:9,fontWeight:800,color:t2,letterSpacing:'.1em',textTransform:'uppercase'}}>👥 Equipe Ativa</div>
          <button onClick={()=>navTo('membros')} style={{fontSize:10,color:'#4F46E5',fontWeight:700,border:'none',background:'transparent',cursor:'pointer'}}>Ver todos →</button>
        </div>
        <div style={{display:'flex',gap:12,overflowX:'auto',paddingBottom:2}}>
          {MEMBERS.filter(m=>m.status==='ativo').slice(0,5).map(m=><div key={m.id} style={{flexShrink:0,textAlign:'center'}}>
            <Ava m={m} size={44} ring/>
            <div style={{fontSize:10,fontWeight:700,color:tc,marginTop:5,width:46,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{m.name.split(' ')[0]}</div>
            <div style={{fontSize:8,color:t2}}>{m.instrument}</div>
          </div>)}
        </div>
      </div>
    </div>;
  }

  // ─────────────────── REPERTÓRIO ───────────────────
  function Repertorio(){
    return<div style={{padding:'16px'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}} className="aUp">
        <div style={{fontSize:22,fontWeight:900,color:tc,letterSpacing:'-.02em'}}>🎵 Repertório</div>
        <button onClick={()=>{setAddOpen(true);setAddStep(1);}} style={{display:'flex',alignItems:'center',gap:6,padding:'9px 16px',borderRadius:100,border:'none',background:'#4F46E5',color:'#fff',fontSize:12,fontWeight:700,cursor:'pointer',boxShadow:'0 4px 14px rgba(79,70,229,.35)'}}>+ Adicionar</button>
      </div>
      <div className="gIn aUp" style={{display:'flex',alignItems:'center',gap:10,padding:'10px 16px',marginBottom:14,animationDelay:'.04s'}}>
        <span style={{fontSize:15,opacity:.4}}>🔍</span>
        <input className="fi" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar música ou artista..." style={{color:tc,flex:1,padding:0}}/>
        {search&&<button onClick={()=>setSearch('')} style={{border:'none',background:'transparent',fontSize:13,color:t2,cursor:'pointer'}}>✕</button>}
      </div>
      <div style={{display:'flex',gap:8,overflowX:'auto',marginBottom:18,paddingBottom:2}} className="aUp">
        {[{id:'all',label:'Todos',icon:'🎶',cnt:songs.length},...Object.entries(CAT).map(([id,c])=>({id,label:c.label,icon:c.icon,cnt:songs.filter(s=>s.cat===id).length}))].map(c=><button key={c.id} onClick={()=>setCatF(c.id)} style={{flexShrink:0,padding:'7px 14px',borderRadius:100,border:'none',cursor:'pointer',background:catF===c.id?'#4F46E5':d?'rgba(255,255,255,.07)':'rgba(79,70,229,.07)',color:catF===c.id?'#fff':tc,fontSize:11,fontWeight:700,transition:'all .2s',boxShadow:catF===c.id?'0 4px 12px rgba(79,70,229,.3)':''}}>
          {c.icon} {c.label} <span style={{opacity:.55,fontSize:9}}>({c.cnt})</span>
        </button>)}
      </div>
      {search&&filtSongs.length===0&&<div style={{textAlign:'center',padding:'40px 0',color:t2}}><div style={{fontSize:30,marginBottom:8}}>🎵</div><div style={{fontWeight:700}}>Nenhuma música encontrada</div></div>}
      {Object.entries(CAT).map(([catId,catC])=>{
        if(catF!=='all'&&catF!==catId)return null;
        const cs=filtSongs.filter(s=>s.cat===catId);if(!cs.length)return null;
        return<div key={catId} style={{marginBottom:22}}>
          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
            <div style={{width:4,height:18,borderRadius:2,background:catC.color}}/>
            <span style={{fontSize:10,fontWeight:900,color:catC.color,letterSpacing:'.08em',textTransform:'uppercase'}}>{catC.icon} {catC.label}</span>
            <span style={{fontSize:9,color:t2}}>({cs.length})</span>
          </div>
          {cs.map((s,i)=><div key={s.id} className={`${gc} sc ${catC.acc} aUp`} style={{animationDelay:`${i*.05}s`}} onClick={()=>{setSelSong(s);setTr(0);setMetro(false);}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:800,fontSize:14,color:tc,marginBottom:2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.title}</div>
                <div style={{fontSize:11,color:t2,marginBottom:8}}>{s.artist}</div>
                <div style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
                  <Bdg cat={s.cat}/>
                  {s.tags?.slice(0,2).map(tg=><span key={tg} style={{fontSize:9,color:t2,background:d?'rgba(255,255,255,.06)':'rgba(0,0,0,.05)',padding:'2px 8px',borderRadius:100,fontWeight:600}}>{tg}</span>)}
                </div>
              </div>
              <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:5,marginLeft:10,flexShrink:0}}><KeyChip k={s.key}/><BpmChip bpm={s.bpm}/></div>
            </div>
          </div>)}
        </div>;
      })}
      <div style={{height:8}}/>
    </div>;
  }

  // ─────────────────── CIFRA ───────────────────
  function Cifra(){
    if(!selSong)return null;
    const curKey=getKey(selSong.key,tr);
    return<div style={{padding:'16px'}}>
      <div className={`${gc} aUp`} style={{...CS}}>
        <Bdg cat={selSong.cat}/>
        <div style={{fontSize:22,fontWeight:900,color:tc,marginTop:8,letterSpacing:'-.02em',lineHeight:1.15}}>{selSong.title}</div>
        <div style={{fontSize:12,color:t2,marginTop:3,marginBottom:14}}>{selSong.artist}</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
          <div style={{background:'rgba(79,70,229,.07)',borderRadius:13,padding:'13px',border:'1px solid rgba(79,70,229,.14)',textAlign:'center'}}>
            <div style={{fontSize:9,fontWeight:800,color:t2,letterSpacing:'.1em',textTransform:'uppercase',marginBottom:4}}>Tom Atual</div>
            <div style={{fontSize:30,fontWeight:900,color:'#4F46E5',fontFamily:"'JetBrains Mono',monospace",lineHeight:1}}>{curKey}</div>
            {tr!==0&&<div style={{fontSize:10,color:t2,marginTop:3}}>{tr>0?'+':''}{tr} st</div>}
          </div>
          <div onClick={()=>setMetro(m=>!m)} style={{background:'rgba(245,158,11,.07)',borderRadius:13,padding:'13px',border:'1px solid rgba(245,158,11,.14)',textAlign:'center',cursor:'pointer',transition:'all .2s',boxShadow:beat&&metro?'0 0 0 8px rgba(16,185,129,.18)':''}}>
            <div style={{fontSize:9,fontWeight:800,color:t2,letterSpacing:'.1em',textTransform:'uppercase',marginBottom:4}}>BPM · Metrônomo</div>
            <div style={{fontSize:30,fontWeight:900,color:metro?'#10B981':'#F59E0B',fontFamily:"'JetBrains Mono',monospace",lineHeight:1,transition:'color .15s'}}>{selSong.bpm}</div>
            <div style={{fontSize:10,color:metro?'#059669':t2,marginTop:3,fontWeight:700}}>{metro?'● Tocando':'● Ativar'}</div>
          </div>
        </div>
      </div>
      {/* Transposer */}
      <div className={`${gc} aUp`} style={{...CS,animationDelay:'.07s'}}>
        <div style={{fontSize:9,fontWeight:800,color:t2,textTransform:'uppercase',letterSpacing:'.1em',marginBottom:10}}>🎸 Transpositor de Tom</div>
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
          <button onClick={()=>setTr(t=>t-1)} style={{width:40,height:40,borderRadius:11,border:'1px solid rgba(79,70,229,.22)',background:'rgba(79,70,229,.07)',color:'#4F46E5',fontSize:22,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>−</button>
          <div style={{flex:1,display:'flex',gap:4,justifyContent:'center'}}>
            {[-3,-2,-1,0,1,2,3].map(n=><button key={n} onClick={()=>setTr(n)} style={{width:34,height:34,borderRadius:9,border:'none',cursor:'pointer',fontSize:10,fontWeight:800,background:tr===n?'#4F46E5':'rgba(79,70,229,.07)',color:tr===n?'#fff':'#4F46E5',boxShadow:tr===n?'0 4px 12px rgba(79,70,229,.32)':'',transition:'all .18s'}}>{n>0?`+${n}`:n}</button>)}
          </div>
          <button onClick={()=>setTr(t=>t+1)} style={{width:40,height:40,borderRadius:11,border:'1px solid rgba(79,70,229,.22)',background:'rgba(79,70,229,.07)',color:'#4F46E5',fontSize:22,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>+</button>
        </div>
        {tr!==0&&<button onClick={()=>setTr(0)} style={{width:'100%',padding:'8px',borderRadius:10,border:'none',cursor:'pointer',background:'rgba(245,158,11,.08)',color:'#D97706',fontSize:11,fontWeight:700}}>↩ Voltar ao tom original ({selSong.key})</button>}
      </div>
      {/* Mode controls */}
      <div className={`${gc} aUp`} style={{...CS,animationDelay:'.1s'}}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8}}>
          {[{l:mode==='chords'?'🎸 Cifras':'📝 Letra',a:()=>setMode(m=>m==='chords'?'lyrics':'chords'),act:mode==='chords',g:false},{l:metro?'🥁 Metro ●':'🥁 Metro',a:()=>setMetro(m=>!m),act:metro,g:true},{l:'🎙️ Palco',a:()=>setStageMode(true),act:false,gold:true}].map((b,i)=><button key={i} onClick={b.a} style={{padding:'10px 6px',borderRadius:12,border:'none',cursor:'pointer',fontSize:11,fontWeight:700,background:b.act?(b.g?'rgba(16,185,129,.1)':'rgba(79,70,229,.1)'):(b.gold?'rgba(245,158,11,.08)':'rgba(0,0,0,.04)'),color:b.act?(b.g?'#059669':'#4F46E5'):(b.gold?'#D97706':t2)}}>{b.l}</button>)}
        </div>
      </div>
      {/* Lyrics */}
      <div className={`${gc} aUp`} style={{...CS,animationDelay:'.14s'}}><LyricView text={selSong.lyrics} st={tr} mode={mode} dark={d}/></div>
      <button className="bp aUp" style={{marginBottom:8,animationDelay:'.18s'}} onClick={()=>{sendAI(`Analise "${selSong.title}" (tom ${curKey}, ${CAT[selSong.cat].label}, ${selSong.bpm}bpm) e sugira 3 músicas complementares para um setlist ministerial, com justificativa de fluxo.`);navTo('ia');}}>🤖 Analisar com IA — sugerir setlist</button>
      <div style={{height:16}}/>
    </div>;
  }

  // ─────────────────── STAGE ───────────────────
  function Stage(){
    if(!stageMode||!selSong)return null;
    const [sMet,setSMet]=useState(false),[sB,setSB]=useState(false);
    const sA=useRef(null),sT=useRef(null);
    const curK=getKey(selSong.key,tr);
    useEffect(()=>{
      if(sMet){const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;sA.current=new AC();
        const tick=()=>{const ctx=sA.current;if(!ctx)return;const o=ctx.createOscillator(),g=ctx.createGain();o.connect(g);g.connect(ctx.destination);o.frequency.value=1040;g.gain.setValueAtTime(.22,ctx.currentTime);g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.05);o.start(ctx.currentTime);o.stop(ctx.currentTime+.05);setSB(true);setTimeout(()=>setSB(false),100);};
        tick();sT.current=setInterval(tick,(60/selSong.bpm)*1000);}
      return()=>{clearInterval(sT.current);if(sA.current){sA.current.close();sA.current=null;}};
    },[sMet]);
    return<div className="stage-wrap" style={{background:d?'#05091A':'#0A0F1E',color:'#E2E8F0',display:'flex',flexDirection:'column'}}>
      <div style={{background:d?'rgba(5,9,26,.95)':'rgba(10,15,30,.95)',padding:'12px 16px',display:'flex',justifyContent:'space-between',alignItems:'center',flexShrink:0,borderBottom:'1px solid rgba(255,255,255,.07)'}}>
        <div style={{display:'flex',gap:10,alignItems:'center'}}>
          <button onClick={()=>setStageMode(false)} style={{width:36,height:36,borderRadius:10,border:'1px solid rgba(255,255,255,.14)',background:'rgba(255,255,255,.05)',color:'#E2E8F0',fontSize:16,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>←</button>
          <div><div style={{fontSize:14,fontWeight:800,color:'#E2E8F0',lineHeight:1.2}}>{selSong.title}</div><div style={{fontSize:10,color:'rgba(255,255,255,.4)'}}>{selSong.artist}</div></div>
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          <div style={{background:'rgba(79,70,229,.22)',border:'1px solid rgba(99,102,241,.4)',borderRadius:10,padding:'5px 12px',textAlign:'center'}}>
            <div style={{fontSize:8,color:'rgba(255,255,255,.4)',letterSpacing:'.08em'}}>TOM</div>
            <div style={{fontSize:18,fontWeight:900,color:'#818CF8',fontFamily:"'JetBrains Mono',monospace",lineHeight:1}}>{curK}</div>
          </div>
          <div onClick={()=>setSMet(m=>!m)} style={{background:sMet?'rgba(16,185,129,.2)':'rgba(245,158,11,.14)',border:`1px solid ${sMet?'rgba(16,185,129,.4)':'rgba(245,158,11,.32)'}`,borderRadius:10,padding:'5px 12px',textAlign:'center',cursor:'pointer',transition:'box-shadow .1s',boxShadow:sB?'0 0 20px rgba(16,185,129,.5)':''}}>
            <div style={{fontSize:8,color:'rgba(255,255,255,.4)',letterSpacing:'.08em'}}>BPM</div>
            <div style={{fontSize:18,fontWeight:900,color:sMet?'#34D399':'#F59E0B',fontFamily:"'JetBrains Mono',monospace",lineHeight:1}}>{selSong.bpm}</div>
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:3}}>
            <button onClick={()=>setStageFs(f=>Math.min(f+3,42))} style={{border:'1px solid rgba(255,255,255,.14)',background:'rgba(255,255,255,.05)',color:'#E2E8F0',fontSize:12,borderRadius:7,padding:'3px 8px',cursor:'pointer'}}>A+</button>
            <button onClick={()=>setStageFs(f=>Math.max(f-3,14))} style={{border:'1px solid rgba(255,255,255,.14)',background:'rgba(255,255,255,.05)',color:'#E2E8F0',fontSize:10,borderRadius:7,padding:'3px 8px',cursor:'pointer'}}>A−</button>
          </div>
        </div>
      </div>
      <div style={{background:'rgba(0,0,0,.25)',padding:'7px 14px',display:'flex',alignItems:'center',gap:5,flexShrink:0,overflowX:'auto'}}>
        <span style={{fontSize:9,color:'rgba(255,255,255,.35)',marginRight:4,flexShrink:0,fontWeight:800}}>TOM:</span>
        {[-5,-4,-3,-2,-1,0,1,2,3,4,5].map(n=><button key={n} onClick={()=>setTr(n)} style={{flexShrink:0,width:30,height:26,borderRadius:7,border:'none',cursor:'pointer',fontSize:9,fontWeight:800,background:tr===n?'#4F46E5':'rgba(255,255,255,.07)',color:tr===n?'#fff':'rgba(255,255,255,.45)',transition:'all .15s'}}>{n>0?`+${n}`:n}</button>)}
        <button onClick={()=>setMode(m=>m==='chords'?'lyrics':'chords')} style={{flexShrink:0,marginLeft:8,padding:'5px 12px',borderRadius:8,border:'1px solid rgba(255,255,255,.14)',background:'rgba(255,255,255,.06)',color:'rgba(255,255,255,.7)',fontSize:10,fontWeight:700,cursor:'pointer'}}>{mode==='chords'?'🎸 Cifra':'📝 Letra'}</button>
      </div>
      <div style={{flex:1,overflowY:'auto',padding:'22px 20px 48px'}}><LyricView text={selSong.lyrics} st={tr} mode={mode} dark={true} fs={stageFs}/></div>
    </div>;
  }

  // ─────────────────── ESCALA ───────────────────
  function Escala(){
    const up=SCHED.filter(s=>s.date>=todayStr);
    return<div style={{padding:'16px'}}>
      <div style={{fontSize:22,fontWeight:900,color:tc,marginBottom:14,letterSpacing:'-.02em'}} className="aUp">📅 Escala</div>
      <div className={`${gc} aUp`} style={{...CS,animationDelay:'.04s'}}>
        <div style={{fontSize:9,fontWeight:800,color:t2,textTransform:'uppercase',letterSpacing:'.1em',marginBottom:10}}>Minha Confirmação</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:10}}>
          {[{l:'Confirmados',v:Object.values(confs).filter(Boolean).length,c:'#10B981'},{l:'Recusados',v:Object.values(confs).filter(x=>x===false).length,c:'#EF4444'},{l:'Total Eventos',v:up.length,c:'#4F46E5'}].map(s=><div key={s.l} style={{textAlign:'center',padding:'10px 6px',borderRadius:11,background:d?'rgba(255,255,255,.03)':'rgba(0,0,0,.03)'}}>
            <div style={{fontSize:19,fontWeight:900,color:s.c,lineHeight:1}}>{s.v}</div>
            <div style={{fontSize:8,color:t2,marginTop:3,fontWeight:700}}>{s.l}</div>
          </div>)}
        </div>
        <div className="pbar"><div className="pbar-fill" style={{width:`${(Object.values(confs).filter(Boolean).length/Math.max(up.length,1))*100}%`}}/></div>
      </div>
      {up.map((ev,ei)=>{
        const evM=ev.members.map(id=>MEMBERS.find(m=>m.id===id)).filter(Boolean);
        const evS=ev.songs.map(id=>songs.find(s=>s.id===id)).filter(Boolean);
        const conf=confs[ev.id];
        return<div key={ev.id} className={`${gc} aUp`} style={{...CS,animationDelay:`${ei*.06}s`,borderLeft:`3px solid ${ev.type==='culto'?'#4F46E5':'#10B981'}`}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:10}}>
            <div>
              <span style={{display:'inline-block',fontSize:9,fontWeight:800,padding:'3px 10px',borderRadius:100,marginBottom:5,background:ev.type==='culto'?'rgba(79,70,229,.1)':'rgba(16,185,129,.1)',color:ev.type==='culto'?'#4F46E5':'#059669',border:`1px solid ${ev.type==='culto'?'rgba(79,70,229,.2)':'rgba(16,185,129,.2)'}`}}>{ev.type==='culto'?'⛪ CULTO':'🎸 ENSAIO'}</span>
              <div style={{fontSize:15,fontWeight:900,color:tc}}>{ev.label}</div>
              <div style={{fontSize:11,color:t2,marginTop:1}}>{fDate(ev.date)} · {ev.time}</div>
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:5,alignItems:'flex-end',flexShrink:0}}>
              <button onClick={()=>{setConfs(c=>({...c,[ev.id]:true}));if(!confs[ev.id])spawnConfetti();}} style={{padding:'6px 14px',borderRadius:100,border:'none',cursor:'pointer',fontSize:11,fontWeight:800,background:conf===true?'#10B981':'rgba(16,185,129,.1)',color:conf===true?'#fff':'#059669',transition:'all .2s'}}>✓ Confirmar</button>
              <button onClick={()=>setConfs(c=>({...c,[ev.id]:false}))} style={{padding:'6px 14px',borderRadius:100,border:'none',cursor:'pointer',fontSize:11,fontWeight:800,background:conf===false?'#EF4444':'rgba(239,68,68,.08)',color:conf===false?'#fff':'#DC2626',transition:'all .2s'}}>✗ Recusar</button>
            </div>
          </div>
          {ev.theme&&<div style={{background:'rgba(79,70,229,.06)',borderRadius:9,padding:'7px 12px',marginBottom:10,fontSize:11,color:'#4F46E5',fontWeight:700,border:'1px solid rgba(79,70,229,.14)'}}>📖 {ev.theme}</div>}
          <div style={{marginBottom:10}}>
            <div style={{fontSize:9,color:t2,fontWeight:800,textTransform:'uppercase',letterSpacing:'.1em',marginBottom:6}}>Músicas</div>
            <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
              {evS.map(s=><span key={s.id} onClick={()=>{setSelSong(s);setTr(0);setMetro(false);setTab('repertorio');}} style={{padding:'4px 11px',borderRadius:100,fontSize:10,fontWeight:700,cursor:'pointer',background:`${CAT[s.cat].color}14`,color:CAT[s.cat].color,border:`1px solid ${CAT[s.cat].color}28`}}>{CAT[s.cat].icon} {s.title}</span>)}
            </div>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:3}}>
            {evM.slice(0,6).map((m,i)=><div key={m.id} style={{marginLeft:i?-7:0,zIndex:10-i}}><Ava m={m} size={24} ring/></div>)}
            {evM.length>6&&<span style={{fontSize:9,color:t2,marginLeft:5,fontWeight:600}}>+{evM.length-6}</span>}
          </div>
        </div>;
      })}
    </div>;
  }

  // ─────────────────── MEMBROS ───────────────────
  function Membros(){
    const roles=[...new Set(MEMBERS.map(m=>m.instrument))];
    const filtered=selRole==='Todos'?MEMBERS:MEMBERS.filter(m=>m.instrument===selRole);
    return<div style={{padding:'16px'}}>
      <div style={{fontSize:22,fontWeight:900,color:tc,marginBottom:14,letterSpacing:'-.02em'}} className="aUp">👥 Membros</div>
      <div style={{display:'flex',gap:8,overflowX:'auto',marginBottom:14,paddingBottom:2}} className="aUp">
        {['Todos',...roles].map(r=><button key={r} onClick={()=>setSelRole(r)} style={{flexShrink:0,padding:'7px 14px',borderRadius:100,border:'none',cursor:'pointer',background:selRole===r?'#4F46E5':d?'rgba(255,255,255,.07)':'rgba(79,70,229,.07)',color:selRole===r?'#fff':tc,fontSize:11,fontWeight:700,transition:'all .2s'}}>{r}</button>)}
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:18}}>
        {filtered.map((m,i)=>{
          const cCount=SCHED.filter(s=>s.members.includes(m.id)&&s.type==='culto').length;
          return<div key={m.id} className={`${gc} aUp`} style={{borderRadius:18,padding:'16px',animationDelay:`${i*.04}s`,opacity:m.status==='licença'?.7:1}}>
            <div style={{display:'flex',flexDirection:'column',alignItems:'center',marginBottom:12}}>
              <div style={{position:'relative',marginBottom:8}}>
                <Ava m={m} size={52} ring/>
                <div style={{position:'absolute',bottom:0,right:0,width:13,height:13,borderRadius:'50%',background:m.status==='ativo'?'#10B981':'#94A3B8',border:'2px solid white'}}/>
              </div>
              <div style={{fontSize:13,fontWeight:800,color:tc,textAlign:'center',lineHeight:1.2}}>{m.name}</div>
              <div style={{fontSize:10,color:t2,marginTop:2}}>{m.role}</div>
              {m.status==='licença'&&<span style={{marginTop:4,fontSize:9,color:'#94A3B8',background:'rgba(148,163,184,.1)',padding:'2px 8px',borderRadius:100,fontWeight:700}}>Em licença</span>}
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:5}}>
              <div style={{textAlign:'center',padding:'8px 4px',borderRadius:10,background:d?'rgba(255,255,255,.04)':'rgba(0,0,0,.04)'}}>
                <div style={{fontSize:15,fontWeight:900,color:'#4F46E5',lineHeight:1}}>{m.confirmRate}%</div>
                <div style={{fontSize:8,color:t2,marginTop:2,fontWeight:700}}>PRESENÇA</div>
              </div>
              <div style={{textAlign:'center',padding:'8px 4px',borderRadius:10,background:d?'rgba(255,255,255,.04)':'rgba(0,0,0,.04)'}}>
                <div style={{fontSize:15,fontWeight:900,color:'#10B981',lineHeight:1}}>{cCount}</div>
                <div style={{fontSize:8,color:t2,marginTop:2,fontWeight:700}}>CULTOS</div>
              </div>
            </div>
          </div>;
        })}
      </div>
      <div className={`${gc} aUp`} style={{...CS}}>
        <div style={{fontSize:9,fontWeight:800,color:t2,textTransform:'uppercase',letterSpacing:'.1em',marginBottom:12}}>📊 Estatísticas da Equipe</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10}}>
          {[{l:'Média Presença',v:`${Math.round(MEMBERS.reduce((a,m)=>a+m.confirmRate,0)/MEMBERS.length)}%`,c:'#4F46E5'},{l:'Membros Ativos',v:MEMBERS.filter(m=>m.status==='ativo').length,c:'#10B981'},{l:'Instrumentos',v:[...new Set(MEMBERS.map(m=>m.instrument))].length,c:'#F59E0B'}].map(s=><div key={s.l} style={{textAlign:'center',padding:'11px 6px',borderRadius:12,background:d?'rgba(255,255,255,.03)':'rgba(0,0,0,.03)'}}>
            <div style={{fontSize:19,fontWeight:900,color:s.c,lineHeight:1}}>{s.v}</div>
            <div style={{fontSize:8,color:t2,marginTop:3,fontWeight:700}}>{s.l}</div>
          </div>)}
        </div>
      </div>
    </div>;
  }

  // ─────────────────── IA ───────────────────
  function IA(){
    const qp=[{e:'🎵',l:'Setlist Domingo',p:'Monte um setlist completo de 5 músicas para culto dominical com tema de gratidão, com fluxo progressivo de Júbilo até Adoração profunda. Indique categoria, tom e BPM para cada música.'},{e:'🎉',l:'Abertura',p:'Sugira 3 músicas de Júbilo animadas para abrir o culto com energia e celebração.'},{e:'🙏',l:'Adoração',p:'Quais músicas de adoração profunda você recomenda para o clímax ministerial do culto?'},{e:'📖',l:'Reflexão',p:'Escreva uma reflexão ministerial sobre adoração verdadeira baseada em João 4:23-24 para compartilhar com a equipe antes do culto.'},{e:'🔄',l:'Transições',p:'Como fazer transições fluidas entre Júbilo e Adoração no culto? Dê dicas práticas para o líder de louvor.'},{e:'🎸',l:'Ensaio',p:'Estruture um ensaio eficiente de 2 horas para ministério de louvor, com divisão de tempo e objetivos para cada etapa.'}];
    return<div style={{display:'flex',flexDirection:'column',height:'calc(100dvh - 130px)',padding:'16px 16px 0'}}>
      <div style={{marginBottom:12}} className="aUp">
        <div style={{fontSize:22,fontWeight:900,color:tc,letterSpacing:'-.02em',marginBottom:2}}>🤖 IA Worship</div>
        <div style={{fontSize:11,color:t2}}>Assistente ministerial com inteligência artificial</div>
      </div>
      <div style={{display:'flex',gap:7,overflowX:'auto',marginBottom:12,paddingBottom:2,flexShrink:0}} className="aUp">
        {qp.map(q=><button key={q.l} onClick={()=>sendAI(q.p)} style={{flexShrink:0,padding:'7px 12px',borderRadius:100,border:'1px solid rgba(79,70,229,.2)',background:'rgba(79,70,229,.07)',color:'#4F46E5',fontSize:10,fontWeight:700,cursor:'pointer',whiteSpace:'nowrap'}}>{q.e} {q.l}</button>)}
      </div>
      <div style={{flex:1,overflowY:'auto',display:'flex',flexDirection:'column',gap:11,paddingBottom:8}}>
        {aiMsgs.map((msg,i)=><div key={i} style={{display:'flex',justifyContent:msg.r==='u'?'flex-end':'flex-start',animation:'slideUp .3s ease both',animationDelay:`${Math.min(i,.2)*.04}s`}}>
          {msg.r==='a'&&<div style={{width:32,height:32,borderRadius:'50%',background:'linear-gradient(135deg,#4F46E5,#7C3AED)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:15,flexShrink:0,marginRight:8,alignSelf:'flex-end',boxShadow:'0 4px 12px rgba(79,70,229,.32)'}}>🤖</div>}
          <div style={{maxWidth:'80%',padding:'12px 15px',borderRadius:msg.r==='u'?'20px 20px 5px 20px':'5px 20px 20px 20px',background:msg.r==='u'?'linear-gradient(135deg,#4F46E5,#6D28D9)':d?'rgba(20,28,52,.9)':'rgba(255,255,255,.9)',backdropFilter:'blur(20px)',WebkitBackdropFilter:'blur(20px)',border:msg.r==='u'?'none':`1px solid ${d?'rgba(255,255,255,.07)':'rgba(0,0,0,.07)'}`,color:msg.r==='u'?'#fff':tc,fontSize:13,lineHeight:1.7,whiteSpace:'pre-wrap',wordBreak:'break-word',boxShadow:msg.r==='u'?'0 4px 16px rgba(79,70,229,.3)':'0 2px 10px rgba(0,0,0,.06)'}}>{msg.c}</div>
        </div>)}
        {aiLoad&&<div style={{display:'flex',gap:8,alignItems:'flex-end'}}>
          <div style={{width:32,height:32,borderRadius:'50%',background:'linear-gradient(135deg,#4F46E5,#7C3AED)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:15}}>🤖</div>
          <div className={gc} style={{borderRadius:'5px 20px 20px 20px',padding:'13px 17px'}}>
            <div style={{display:'flex',gap:4,alignItems:'center'}}>{[0,1,2].map(i=><div key={i} style={{width:6,height:6,borderRadius:'50%',background:'#4F46E5',animation:`bounce .9s ease-in-out ${i*.18}s infinite`}}/>)}</div>
          </div>
        </div>}
        <div ref={aiEnd}/>
      </div>
      <div className="gIn" style={{display:'flex',gap:8,alignItems:'flex-end',marginTop:8,flexShrink:0,marginBottom:8,padding:'10px 10px 10px 16px'}}>
        <textarea value={aiIn} onChange={e=>setAiIn(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendAI();}}} placeholder="Pergunte sobre setlists, músicas, adoração..." rows={1} style={{flex:1,background:'transparent',border:'none',resize:'none',fontSize:13,color:tc,lineHeight:1.6,maxHeight:100,padding:0}}/>
        <button onClick={()=>sendAI()} disabled={aiLoad||!aiIn.trim()} style={{width:38,height:38,borderRadius:11,border:'none',flexShrink:0,cursor:aiIn.trim()?'pointer':'not-allowed',background:aiIn.trim()?'linear-gradient(135deg,#4F46E5,#6D28D9)':'rgba(79,70,229,.1)',color:aiIn.trim()?'#fff':'#4F46E5',fontSize:17,transition:'all .2s',boxShadow:aiIn.trim()?'0 4px 12px rgba(79,70,229,.35)':'',display:'flex',alignItems:'center',justifyContent:'center'}}>{aiLoad?<Loader/>:'↑'}</button>
      </div>
    </div>;
  }

  // ─────────────────── OVERLAYS ───────────────────
  function AddSong(){
    const KEYS=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    return<>
      <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.5)',zIndex:99,backdropFilter:'blur(8px)',WebkitBackdropFilter:'blur(8px)',animation:'fadeIn .2s'}} onClick={()=>setAddOpen(false)}/>
      <div className="gL2" style={{position:'fixed',bottom:0,left:0,right:0,maxHeight:'92dvh',overflowY:'auto',borderRadius:'28px 28px 0 0',zIndex:100,animation:'slideUp .42s cubic-bezier(.22,1,.36,1)'}}>
        <div style={{display:'flex',justifyContent:'center',padding:'14px 0 0'}}><div style={{width:44,height:4,borderRadius:100,background:'rgba(127,127,127,.22)'}}/></div>
        <div style={{padding:'16px 20px 52px'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
            <div>
              <div style={{fontSize:18,fontWeight:900,color:tc}}>{addStep===1?'➕ Nova Música':addStep===2?'🤖 Gerar Cifra':'✏️ Revisar Cifra'}</div>
              <div style={{display:'flex',gap:5,marginTop:7}}>{[1,2,3].map(s=><div key={s} style={{width:s===addStep?24:8,height:4,borderRadius:100,transition:'all .3s',background:s<=addStep?'#4F46E5':'rgba(79,70,229,.15)'}}/>)}</div>
            </div>
            <button onClick={()=>setAddOpen(false)} style={{width:34,height:34,borderRadius:10,border:'none',background:'rgba(0,0,0,.07)',color:t2,fontSize:16,cursor:'pointer'}}>✕</button>
          </div>
          {addStep===1&&<div style={{display:'flex',flexDirection:'column',gap:11}}>
            <div className="gIn"><input className="fi" value={addF.title} onChange={e=>setAddF(f=>({...f,title:e.target.value}))} placeholder="Título da música *" style={{color:tc}}/></div>
            <div className="gIn"><input className="fi" value={addF.artist} onChange={e=>setAddF(f=>({...f,artist:e.target.value}))} placeholder="Artista / Ministério" style={{color:tc}}/></div>
            <div>
              <div style={{fontSize:9,fontWeight:800,color:t2,textTransform:'uppercase',letterSpacing:'.1em',marginBottom:8}}>Categoria</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                {Object.entries(CAT).map(([id,c])=><button key={id} onClick={()=>setAddF(f=>({...f,cat:id}))} style={{padding:'12px',borderRadius:14,border:`2px solid ${addF.cat===id?c.color:'transparent'}`,background:addF.cat===id?`${c.color}12`:'rgba(0,0,0,.04)',cursor:'pointer',display:'flex',alignItems:'center',gap:8,transition:'all .18s'}}>
                  <span style={{fontSize:17}}>{c.icon}</span><span style={{fontSize:12,fontWeight:800,color:addF.cat===id?c.color:t2}}>{c.label}</span>
                </button>)}
              </div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
              <div>
                <div style={{fontSize:9,fontWeight:800,color:t2,textTransform:'uppercase',letterSpacing:'.1em',marginBottom:6}}>Tom</div>
                <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>{KEYS.map(k=><button key={k} onClick={()=>setAddF(f=>({...f,key:k}))} style={{width:34,height:30,borderRadius:8,border:'none',cursor:'pointer',fontSize:10,fontWeight:800,background:addF.key===k?'#4F46E5':'rgba(79,70,229,.07)',color:addF.key===k?'#fff':'#4F46E5',transition:'all .15s'}}>{k}</button>)}</div>
              </div>
              <div>
                <div style={{fontSize:9,fontWeight:800,color:t2,textTransform:'uppercase',letterSpacing:'.1em',marginBottom:6}}>BPM</div>
                <div className="gIn"><input className="fi" type="number" value={addF.bpm} onChange={e=>setAddF(f=>({...f,bpm:e.target.value}))} style={{color:tc}} placeholder="80"/></div>
              </div>
            </div>
            <div className="gIn"><input className="fi" value={addF.tags} onChange={e=>setAddF(f=>({...f,tags:e.target.value}))} placeholder="Tags: Worship, Avivamento (vírgula)" style={{color:tc}}/></div>
            <button className="bp" onClick={()=>setAddStep(2)} disabled={!addF.title}>Próximo: Adicionar Cifra →</button>
          </div>}
          {addStep===2&&<div style={{display:'flex',flexDirection:'column',gap:12}}>
            <div className={gc} style={{borderRadius:18,padding:'20px',textAlign:'center',border:'2px dashed rgba(79,70,229,.22)'}}>
              <div style={{fontSize:34,marginBottom:10}}>🤖</div>
              <div style={{fontSize:15,fontWeight:800,color:tc,marginBottom:5}}>Gerar Cifra com IA</div>
              <div style={{fontSize:12,color:t2,marginBottom:16}}>A IA vai gerar a cifra de<br/>"{addF.title}" no tom {addF.key}</div>
              <button className="bp" onClick={genCifra} disabled={genLoad} style={{maxWidth:240,margin:'0 auto'}}>{genLoad?<><Loader/> Gerando...</>:<>✨ Gerar com IA</>}</button>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:10}}><div style={{flex:1,height:1,background:'rgba(0,0,0,.08)'}}/><span style={{fontSize:10,color:t2,fontWeight:600}}>ou</span><div style={{flex:1,height:1,background:'rgba(0,0,0,.08)'}}/></div>
            <button className="bSec" onClick={()=>setAddStep(3)}>✏️ Digitar manualmente</button>
            <button onClick={()=>setAddStep(1)} style={{border:'none',background:'transparent',color:t2,fontSize:12,cursor:'pointer'}}>← Voltar</button>
          </div>}
          {addStep===3&&<div style={{display:'flex',flexDirection:'column',gap:12}}>
            <div style={{fontSize:11,color:t2,fontWeight:700}}>Cifra — use [G], [Em], [C7] para acordes</div>
            <div className="gIn" style={{borderRadius:16}}>
              <textarea className="fi" value={addF.lyrics} onChange={e=>setAddF(f=>({...f,lyrics:e.target.value}))} placeholder={'Verso:\n[G]Letra com [D]acordes\n\nCoro:\n[C]Continue a[G]qui...'} style={{color:tc,minHeight:200,fontFamily:"'JetBrains Mono',monospace",fontSize:12,lineHeight:1.8}}/>
            </div>
            {addF.lyrics&&<div className={gc} style={{borderRadius:14,padding:'14px'}}>
              <div style={{fontSize:9,color:t2,fontWeight:800,textTransform:'uppercase',letterSpacing:'.1em',marginBottom:8}}>Preview</div>
              <LyricView text={addF.lyrics} st={0} mode='chords' dark={d}/>
            </div>}
            <button className="bp" onClick={saveSong} disabled={!addF.lyrics}>💾 Salvar Música</button>
            <button onClick={()=>setAddStep(2)} style={{border:'none',background:'transparent',color:t2,fontSize:12,cursor:'pointer'}}>← Voltar</button>
          </div>}
        </div>
      </div>
    </>;
  }

  function EvSheet(){
    if(!evSheet)return null;
    const ev=evSheet,evS=ev.songs.map(id=>songs.find(s=>s.id===id)).filter(Boolean),evM=ev.members.map(id=>MEMBERS.find(m=>m.id===id)).filter(Boolean);
    return<>
      <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.45)',zIndex:99,backdropFilter:'blur(7px)',WebkitBackdropFilter:'blur(7px)',animation:'fadeIn .2s'}} onClick={()=>setEvSheet(null)}/>
      <div className="gL2" style={{position:'fixed',bottom:0,left:0,right:0,maxHeight:'88dvh',overflowY:'auto',borderRadius:'28px 28px 0 0',zIndex:100,animation:'slideUp .4s cubic-bezier(.22,1,.36,1)'}}>
        <div style={{display:'flex',justifyContent:'center',padding:'14px 0 0'}}><div style={{width:44,height:4,borderRadius:100,background:'rgba(127,127,127,.22)'}}/></div>
        <div style={{padding:'16px 20px 52px'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:14}}>
            <div><div style={{fontSize:20,fontWeight:900,color:tc}}>{ev.label}</div><div style={{fontSize:11,color:t2,marginTop:3}}>{fDate(ev.date)} · {ev.time}</div></div>
            <button onClick={()=>setEvSheet(null)} style={{width:34,height:34,borderRadius:10,border:'none',background:'rgba(0,0,0,.07)',color:t2,fontSize:16,cursor:'pointer'}}>✕</button>
          </div>
          {ev.theme&&<div style={{background:'rgba(79,70,229,.07)',borderRadius:12,padding:'9px 14px',marginBottom:14,fontSize:12,color:'#4F46E5',fontWeight:700,border:'1px solid rgba(79,70,229,.15)'}}>📖 {ev.theme}</div>}
          <div style={{fontSize:9,color:t2,fontWeight:800,textTransform:'uppercase',letterSpacing:'.1em',marginBottom:10}}>Setlist</div>
          {evS.map((s,i)=><div key={s.id} onClick={()=>{setSelSong(s);setTr(0);setMetro(false);setTab('repertorio');setEvSheet(null);}} style={{display:'flex',alignItems:'center',gap:11,padding:'11px',borderRadius:13,marginBottom:7,background:d?'rgba(255,255,255,.04)':'rgba(0,0,0,.03)',cursor:'pointer'}}>
            <span style={{width:26,height:26,borderRadius:8,background:'rgba(79,70,229,.1)',color:'#4F46E5',fontSize:10,fontWeight:900,display:'flex',alignItems:'center',justifyContent:'center'}}>{i+1}</span>
            <div style={{flex:1}}><div style={{fontSize:13,fontWeight:800,color:tc}}>{s.title}</div><div style={{fontSize:10,color:t2}}>{s.artist}</div></div>
            <KeyChip k={s.key} size={10}/><span style={{fontSize:13}}>{CAT[s.cat].icon}</span>
          </div>)}
          <div style={{fontSize:9,color:t2,fontWeight:800,textTransform:'uppercase',letterSpacing:'.1em',margin:'16px 0 10px'}}>Equipe</div>
          <div style={{display:'flex',flexWrap:'wrap',gap:9}}>
            {evM.map(m=><div key={m.id} style={{display:'flex',alignItems:'center',gap:8,padding:'7px 11px',borderRadius:11,background:d?'rgba(255,255,255,.04)':'rgba(0,0,0,.03)'}}>
              <Ava m={m} size={28} ring/><div><div style={{fontSize:12,fontWeight:700,color:tc}}>{m.name}</div><div style={{fontSize:9,color:t2}}>{m.role}</div></div>
            </div>)}
          </div>
        </div>
      </div>
    </>;
  }

  function NotifsSheet(){
    return<>
      <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.4)',zIndex:99,animation:'fadeIn .2s'}} onClick={()=>setNotifsOpen(false)}/>
      <div className="gL2" style={{position:'fixed',bottom:0,left:0,right:0,maxHeight:'78dvh',overflowY:'auto',borderRadius:'28px 28px 0 0',zIndex:100,animation:'slideUp .4s cubic-bezier(.22,1,.36,1)'}}>
        <div style={{display:'flex',justifyContent:'center',padding:'14px 0 0'}}><div style={{width:44,height:4,borderRadius:100,background:'rgba(127,127,127,.22)'}}/></div>
        <div style={{padding:'16px 20px 52px'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
            <div style={{fontSize:18,fontWeight:900,color:tc}}>🔔 Notificações</div>
            <div style={{display:'flex',gap:8}}>
              <button onClick={()=>setNotifs(n=>n.map(x=>({...x,read:true})))} style={{fontSize:10,fontWeight:700,color:'#4F46E5',border:'none',background:'transparent',cursor:'pointer'}}>Marcar todas lidas</button>
              <button onClick={()=>setNotifsOpen(false)} style={{width:30,height:30,borderRadius:8,border:'none',background:'rgba(0,0,0,.07)',color:t2,fontSize:13,cursor:'pointer'}}>✕</button>
            </div>
          </div>
          {notifs.map(n=>{
            const icon=n.type==='escala'?'📅':n.type==='musica'?'🎵':n.type==='ensaio'?'🎸':n.type==='troca'?'🔄':'✓';
            return<div key={n.id} onClick={()=>setNotifs(ns=>ns.map(x=>x.id===n.id?{...x,read:true}:x))} style={{display:'flex',gap:11,padding:'13px',borderRadius:13,marginBottom:7,cursor:'pointer',background:n.read?(d?'rgba(255,255,255,.02)':'rgba(0,0,0,.02)'):(d?'rgba(79,70,229,.1)':'rgba(79,70,229,.06)'),border:n.read?'none':'1px solid rgba(79,70,229,.15)',transition:'all .2s'}}>
              <div style={{width:38,height:38,borderRadius:11,background:'rgba(79,70,229,.1)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:17,flexShrink:0}}>{icon}</div>
              <div style={{flex:1,minWidth:0}}><div style={{fontSize:12,fontWeight:n.read?600:800,color:tc,lineHeight:1.4}}>{n.text}</div><div style={{fontSize:10,color:t2,marginTop:3}}>{n.time}</div></div>
              {!n.read&&<div style={{width:8,height:8,borderRadius:'50%',background:'#4F46E5',flexShrink:0,marginTop:4}}/>}
            </div>;
          })}
        </div>
      </div>
    </>;
  }

  // ─────────────────── NAV + RENDER ───────────────────
  const TABS=[{id:'home',icon:'🏠',l:'Início'},{id:'repertorio',icon:'🎵',l:'Músicas'},{id:'escala',icon:'📅',l:'Escala'},{id:'membros',icon:'👥',l:'Membros'},{id:'ia',icon:'🤖',l:'IA'}];

  return<div className={`ls${d?' dark':''}`}>
    <style>{CSS}</style>
    {/* Confetti */}
    {confetti.map(c=><div key={c.id} className="conf" style={{left:`${c.x}vw`,top:'-20px',animationDelay:`${c.dl}s`}}>{c.e}</div>)}
    {/* BG orbs */}
    <div className={`bg ${d?'bg-d':'bg-l'}`}>
      <div className="orb" style={{width:480,height:480,top:-150,left:-130,background:d?'rgba(79,70,229,.12)':'rgba(79,70,229,.2)',animation:'oA 14s ease-in-out infinite'}}/>
      <div className="orb" style={{width:360,height:360,top:'33%',right:-90,background:d?'rgba(16,185,129,.08)':'rgba(16,185,129,.14)',animation:'oB 17s ease-in-out infinite'}}/>
      <div className="orb" style={{width:400,height:400,bottom:-120,left:'5%',background:d?'rgba(139,92,246,.1)':'rgba(139,92,246,.17)',animation:'oC 15s ease-in-out infinite'}}/>
      <div className="orb" style={{width:240,height:240,top:'58%',left:'38%',background:d?'rgba(245,158,11,.06)':'rgba(245,158,11,.11)',animation:'oD 12s ease-in-out infinite'}}/>
    </div>
    {/* Shell */}
    <div style={{position:'relative',zIndex:1,height:'100dvh',display:'flex',flexDirection:'column',maxWidth:500,margin:'0 auto',overflow:'hidden'}}>
      {stageMode&&inCifra&&<Stage/>}
      {!stageMode&&<>
        {/* TOP BAR */}
        <div className="gL0" style={{padding:'11px 16px',display:'flex',alignItems:'center',justifyContent:'space-between',borderBottom:`1px solid ${d?'rgba(255,255,255,.05)':'rgba(0,0,0,.05)'}`,position:'sticky',top:0,zIndex:30,flexShrink:0}}>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            {inCifra&&<button onClick={()=>setSelSong(null)} style={{width:36,height:36,borderRadius:11,border:'none',background:'rgba(79,70,229,.1)',color:'#4F46E5',fontSize:17,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer'}}>←</button>}
            {inCifra?<div style={{lineHeight:1.3}}><div style={{fontSize:15,fontWeight:900,color:tc}}>{selSong.title}</div><div style={{fontSize:10,color:t2}}>{selSong.artist}</div></div>:<div style={{display:'flex',alignItems:'center',gap:10}}>
              <div style={{width:34,height:34,borderRadius:11,background:'linear-gradient(135deg,#4F46E5,#6D28D9)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:17,boxShadow:'0 4px 14px rgba(79,70,229,.4)'}}>🎵</div>
              <div><div style={{fontSize:16,fontWeight:900,color:tc,letterSpacing:'-.02em',lineHeight:1}}>LouveSync</div><div style={{fontSize:8,color:t2,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase'}}>HARMONIA MINISTERIAL</div></div>
            </div>}
          </div>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            {!inCifra&&<button onClick={()=>setNotifsOpen(true)} style={{position:'relative',width:36,height:36,borderRadius:11,border:'none',background:'rgba(79,70,229,.08)',color:'#4F46E5',fontSize:16,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
              🔔{unread>0&&<div className="ndot-ring"/>}
            </button>}
            <button className={`tog${d?' on':''}`} onClick={()=>setDark(p=>!p)} style={{background:d?'#4F46E5':'#CBD5E1'}} aria-label="Tema"/>
          </div>
        </div>
        {/* MAIN SCROLL */}
        <div style={{flex:1,overflowY:'auto',paddingBottom:96}}>
          {tab==='home'&&!inCifra&&<Home/>}
          {tab==='repertorio'&&!inCifra&&<Repertorio/>}
          {inCifra&&<Cifra/>}
          {tab==='escala'&&!inCifra&&<Escala/>}
          {tab==='membros'&&!inCifra&&<Membros/>}
          {tab==='ia'&&!inCifra&&<IA/>}
        </div>
        {/* FLOATING NAV */}
        <div style={{position:'fixed',bottom:16,left:0,right:0,display:'flex',justifyContent:'center',zIndex:50,pointerEvents:'none',maxWidth:500,margin:'0 auto'}}>
          <div className="gNav" style={{borderRadius:100,padding:'6px 8px',display:'flex',gap:0,pointerEvents:'all'}}>
            {TABS.map(n=>{const active=tab===n.id&&!inCifra;return<button key={n.id} className={`nb${active?' on':''}`} onClick={()=>navTo(n.id)}>
              <span className="ni">{n.icon}</span>
              <span className="nl" style={{color:active?'#4F46E5':t2}}>{n.l}</span>
              <div className="ndot" style={{width:active?18:0,background:d?'#818CF8':'#4F46E5'}}/>
            </button>;})}
          </div>
        </div>
      </>}
      {/* OVERLAYS */}
      {addOpen&&<AddSong/>}
      {evSheet&&!addOpen&&<EvSheet/>}
      {notifsOpen&&!addOpen&&<NotifsSheet/>}
    </div>
  </div>;
}
