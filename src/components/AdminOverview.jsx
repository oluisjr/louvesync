import { Icon } from './Interface.jsx';
import './ministry-pages.css';

function AdminLink({ icon, title, detail, tone, badge, onClick, tile = false }) {
  return <button type="button" className={tile ? 'admin-tile' : 'ministry-row'} onClick={onClick}>
    <span className="admin-link-icon" data-tone={tone}><Icon name={icon} size={19}/></span>
    <span className="ministry-row-copy"><strong>{title}</strong>{detail && <small>{detail}</small>}</span>
    {badge > 0 && <span className="ministry-label" data-tone="gold" aria-label={`${badge} pendências`}>{badge}</span>}
    {!tile && <Icon name="right" size={17} className="ministry-chevron"/>}
  </button>;
}

export default function AdminOverview({ active, eventCount, deletionCount, open, openAttendance, headingRef }) {
  return <>
    <header className="admin-heading ministry-heading">
      <div><h1 ref={headingRef} tabIndex={-1}>Painel Admin</h1><p>{active} {active === 1 ? 'membro ativo' : 'membros ativos'} · {eventCount} {eventCount === 1 ? 'evento' : 'eventos'}</p></div>
      <img src="/images/louve-redesign/admin.webp" alt="" width="106" height="106"/>
    </header>
    <section className="ministry-section" aria-labelledby="admin-review">
      <h2 id="admin-review">Para revisar</h2>
      <div className="ministry-list">
        <AdminLink icon="trash" tone="gold" title="Solicitações de exclusão" badge={deletionCount}
          detail={deletionCount ? 'Músicas e eventos' : 'Nenhuma pendência'} onClick={() => open('exclusoes')}/>
        <AdminLink icon="lock" tone="green" title="Pedidos de oração" detail="Acompanhamento privado" onClick={() => open('oracoes')}/>
      </div>
    </section>
    <section className="ministry-section" aria-labelledby="admin-manage">
      <h2 id="admin-manage">Gerenciar</h2>
      <div className="admin-tiles">
        <AdminLink tile icon="users" title="Membros e acessos" onClick={() => open('membros')}/>
        {openAttendance && <AdminLink tile icon="check" tone="green" title="Presenças" onClick={openAttendance}/>}
        <AdminLink tile icon="guitar" tone="gold" title="Patrimônio" onClick={() => open('patrimonio')}/>
        <AdminLink tile icon="home" tone="rose" title="Comunidade da igreja" onClick={() => open('comunidade')}/>
      </div>
    </section>
    <div className="ministry-list admin-shortcuts">
      <AdminLink icon="music" title="Música da semana" onClick={() => open('musica')}/>
      <AdminLink icon="note" title="Estatísticas" onClick={() => open('dashboard')}/>
    </div>
  </>;
}
