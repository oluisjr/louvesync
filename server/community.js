import { createClient } from '@supabase/supabase-js';
import { createHmac } from 'node:crypto';
import { normalizeSupabaseUrl } from '../src/lib/supabase-url.js';
import { prayerStatuses } from '../src/lib/community.js';

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const text=(value,max)=>typeof value==='string'&&value.length<=max;
// Schedule dates and times are authored in the church's Sao Paulo timezone.
export function publicScheduleEvent(event) {
  if(!event?.id||typeof event.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(event.date))return null;
  const day=new Date(event.date+'T12:00:00-03:00');
  if(!Number.isFinite(day.getTime())||day.toISOString().slice(0,10)!==event.date)return null;
  const time=typeof event.time==='string'&&/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,6})?)?$/.test(event.time)?event.time:null;
  return {id:String(event.id),title:typeof event.label==='string'&&event.label.trim()?event.label.trim():'Encontro da igreja',starts_at:new Date(event.date+'T'+(time||'00:00')+'-03:00').toISOString(),time_defined:!!time,published:true};
}
async function publicSchedule(db,signal,now) {
  const today=new Date(now).toLocaleDateString('sv-SE',{timeZone:'America/Sao_Paulo'});
  const result=await db.from('events').select('id,label,date,time').gte('date',today).order('date').order('time').limit(120).abortSignal(signal);
  if(result.error)throw result.error;
  return (result.data||[]).map(publicScheduleEvent).filter(Boolean);
}
export function communityPayload(body) {
  if(!body||!['public','submit_prayer','admin_list','review_prayer'].includes(body.action))return null;
  const payload={action:body.action};
  if(body.memberId!=null||body.pin!=null){if(!text(body.memberId,128)||!body.memberId||!text(body.pin,256)||!body.pin)return null;payload.memberId=body.memberId;payload.pin=body.pin;}
  if(body.action==='submit_prayer'){
    if(!uuid.test(body.id)||!text(body.message,2000)||body.message.trim().length<10||!text(body.name||'',100)||!['team','community'].includes(body.visibility)||typeof body.anonymous!=='boolean'||(body.website!=null&&body.website!==''))return null;
    const name=(body.name||'').trim();
    const anonymous=body.anonymous||!name;
    Object.assign(payload,{id:body.id,message:body.message.trim(),name:anonymous?'':name,anonymous,visibility:'team'});
  }
  if(body.action==='review_prayer'){
    if(!uuid.test(body.id)||!Object.hasOwn(prayerStatuses,body.status)||typeof body.published!=='boolean'||(body.reviewed_at&&!Number.isFinite(Date.parse(body.reviewed_at))))return null;
    Object.assign(payload,{id:body.id,status:body.status,published:false,reviewed_at:body.reviewed_at||null});
  }
  if(['admin_list','review_prayer'].includes(body.action)&&!payload.memberId)return null;
  return payload;
}
function clients(environment) {
  const url=environment.SUPABASE_URL||environment.VITE_SUPABASE_URL, service=environment.SUPABASE_SERVICE_ROLE_KEY||environment.SUPABASE_SERVICE_KEY,anon=environment.SUPABASE_ANON_KEY||environment.VITE_SUPABASE_ANON_KEY;
  if(!url||!service||!anon)throw new Error('not_configured');
  const options={auth:{persistSession:false,autoRefreshToken:false}};
  return {db:createClient(normalizeSupabaseUrl(url),service,options),auth:createClient(normalizeSupabaseUrl(url),anon,options),salt:service};
}
export function createCommunityHandler({environment=process.env,connect=clients,now=Date.now}={}) {
  return async(req,res)=>{
    res.setHeader('Cache-Control','private, no-store');
    const origin=req.headers?.origin;
    if(origin){let allowed=['capacitor://localhost','ionic://localhost','https://localhost','http://localhost'].includes(origin);try{allowed||=new URL(origin).host===req.headers.host;}catch{/* Refuse invalid origins. */}if(!allowed)return res.status(403).json({ok:false,error:'Origem não permitida.'});res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type');}
    if(req.method==='OPTIONS')return res.status(204).send('');
    if(req.method!=='POST')return res.status(405).json({ok:false,error:'Método não permitido.'});
    const payload=communityPayload(req.body);
    if(!payload)return res.status(400).json({ok:false,error:'Confira os dados e tente novamente.'});
    try{
      const {db,auth,salt}=connect(environment),signal=AbortSignal.timeout(18000);
      if(payload.action==='public'){
        const events=await publicSchedule(db,signal,now());
        return res.status(200).json({ok:true,events,prayers:[]});
      }
      let result;
      if(payload.action==='submit_prayer'){
        let memberId=null;
        if(payload.memberId){const login=await auth.rpc('louvesync_login',{p_payload:{memberId:payload.memberId,pin:payload.pin}}).abortSignal(signal);if(login.error)throw login.error;if(!login.data?.ok||login.data.member?.id!==payload.memberId)return res.status(401).json({ok:false,error:'Entre novamente para enviar como membro.'});memberId=login.data.member.id;}
        const address=String(req.headers?.['x-vercel-forwarded-for']||req.headers?.['x-real-ip']||req.socket?.remoteAddress||'local').split(',')[0].trim();
        const ipHash=createHmac('sha256',salt).update(address).digest('hex');
        result=await db.rpc('louvesync_submit_prayer',{p_payload:{id:payload.id,message:payload.message,name:payload.name,anonymous:payload.anonymous,visibility:payload.visibility},p_ip_hash:ipHash,p_member_id:payload.anonymous?null:memberId}).abortSignal(signal);
      }else result=await db.rpc('louvesync_community_admin',{p_payload:payload}).abortSignal(signal);
      if(result.error)throw result.error;if(!result.data?.ok)throw new Error('unconfirmed');
      if(payload.action==='admin_list')return res.status(200).json({...result.data,events:await publicSchedule(db,signal,now())});
      return res.status(200).json(result.data);
    }catch(error){
      const code=typeof error.code==='string'&&/^[A-Z0-9]{5}$/.test(error.code)?error.code:error.message==='not_configured'?'not_configured':'unavailable',status=code==='28000'?403:code==='54000'?429:code==='40001'||code==='23505'?409:code==='42501'?403:['23514','22023','22007','22P02'].includes(code)?400:503;
      const message=code==='28000'?'Acesso restrito. Entre novamente com uma conta autorizada.':code==='54000'?'Você enviou vários pedidos. Aguarde antes de tentar novamente.':code==='40001'?'Este registro mudou em outro aparelho. Atualize a lista e tente novamente.':code==='42501'?'Este pedido não tem autorização para ser compartilhado.':code==='23505'?'Este envio já foi recebido com outros dados. Atualize a página antes de enviar um novo pedido.':status===400?'Confira os campos e tente novamente.':'A comunidade está temporariamente indisponível. Seu texto foi preservado para tentar novamente.';
      return res.status(status).json({ok:false,code,error:message});
    }
  };
}
