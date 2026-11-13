import { Dialog, Icon } from './Interface.jsx';

export default function NotificationInbox({dark,controller,onClose,onOpen}) {
  const {items,loading,error,setupRequired,push,support,pushConfigured}=controller;
  return <Dialog dark={dark} title="Notificações" description="Acompanhe as novidades que precisam da sua atenção." icon="bell" closeLabel="Fechar notificações" onClose={onClose} compact footer={<button type="button" className="ui-button ui-button-wide" onClick={onClose}>Fechar</button>}>
    <section className="ui-card">
      <h3 style={{fontSize:15,marginBottom:8}}>Avisos neste aparelho</h3>
      <p className="ui-helper">{push.active?'Notificações ativadas neste aparelho.':support.supported?'Receba os avisos mesmo com o app fechado.':support.reason}</p>
      {support.supported&&<button type="button" className="ui-button ui-button-soft" style={{marginTop:12}} disabled={push.busy||(!push.active&&!pushConfigured)} onClick={push.active?controller.disablePush:controller.enablePush}>{push.busy?'Aguarde…':push.active?'Desativar neste aparelho':'Ativar notificações'}</button>}
      {support.supported&&!pushConfigured&&!loading&&<p className="ui-helper">O envio para aparelhos precisa ser ativado pelo administrador.</p>}
      <button type="button" className="ui-button ui-button-quiet ui-button-small" style={{marginTop:8}} onClick={controller.refresh}>Atualizar</button>
      {push.error&&<p className="ui-message ui-error" role="alert" style={{marginTop:12}}>{push.error}</p>}
    </section>
    {error&&<div className="ui-message ui-error" role="alert"><div><p>{setupRequired?'As notificações precisam ser ativadas pelo administrador.':error}</p><button type="button" className="ui-button ui-button-small" onClick={controller.refresh}>Tentar novamente</button></div></div>}
    {loading&&<p className="ui-helper" role="status">Carregando notificações…</p>}
    {items.length>0&&<button type="button" className="ui-button ui-button-quiet ui-button-small" onClick={controller.markAllRead}>Marcar todas lidas</button>}
    {!loading&&!error&&!items.length&&<div className="ui-empty"><Icon name="bell"/><strong>Nenhuma notificação</strong><p>Os avisos destinados a você aparecerão aqui.</p></div>}
    <div className="ui-list" style={{marginTop:12}}>{items.map(item=><article key={item.id} className="ui-card" style={{marginBottom:0,borderColor:!item.read_at?'var(--ui-accent)':undefined}}>
      <strong>{item.title}</strong><p style={{color:'var(--ui-muted)',margin:'5px 0',fontSize:13}}>{item.body}</p>
      <time style={{fontSize:11,color:'var(--ui-muted)'}} dateTime={item.created_at}>{new Date(item.created_at).toLocaleString('pt-BR')}</time>
      <div style={{display:'flex',gap:8,marginTop:10,flexWrap:'wrap'}}><button type="button" className="ui-button ui-button-soft ui-button-small" onClick={()=>onOpen(item)}>Ver {item.type==='song_added'?'música':'escala'}</button>{!item.read_at&&<button type="button" className="ui-button ui-button-quiet ui-button-small" onClick={()=>controller.markRead([item.id])}>Marcar como lida</button>}</div>
    </article>)}</div>
  </Dialog>;
}
