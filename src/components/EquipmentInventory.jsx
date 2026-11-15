import { useId } from 'react';
import { Icon } from './Interface.jsx';
import { equipmentArtwork, equipmentStatusTone, equipmentSummary } from '../lib/equipment-view.js';
import '../equipment.css';

const filters = [['all', 'Todos'], ['Disponível', 'Disponível'], ['Em uso', 'Em uso'], ['Manutenção', 'Manutenção']];

function EquipmentItem({ item, custodian, isAdmin, onEdit }) {
  const nameId = useId();
  const details = [item.brand, item.serial_number && `SN: ${item.serial_number}`].filter(Boolean).join(' · ');
  return <article className="equipment-item" data-editable={isAdmin} aria-labelledby={nameId}>
    <img className="equipment-thumbnail" src={equipmentArtwork(item)} alt="" width="76" height="76" loading="lazy" decoding="async"/>
    <div className="equipment-item-copy">
      <h3 id={nameId}>{item.name}</h3>
      {!!details && <p className="equipment-item-details">{details}</p>}
      {custodian && <p className="equipment-custodian">Custódia: {custodian.name}</p>}
    </div>
    <span className="equipment-status" data-tone={equipmentStatusTone(item.status)}><span aria-hidden="true"/>{item.status || 'Não informado'}</span>
    {isAdmin && <button type="button" className="equipment-edit" aria-label="Editar" aria-describedby={nameId} title={`Editar ${item.name}`} onClick={() => onEdit(item)}>
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 5 4 4M4 20l4-1L21 6a2.8 2.8 0 0 0-4-4L4 15l-1 6Z"/></svg>
    </button>}
  </article>;
}

export default function EquipmentInventory({ dark, equipment, items, members, loading, search, onSearchChange, statusFilter, onStatusChange, isAdmin, onAdd, onEdit, embedded = false }) {
  const headingId = useId();
  const summary = equipmentSummary(equipment);
  const initialLoading = loading && !equipment.length;

  return <section className="equipment-page" data-theme={dark ? 'dark' : 'light'} data-embedded={embedded} aria-labelledby={headingId}>
    <header className="equipment-heading">
      <div><h2 id={headingId}>Patrimônio</h2><p>Equipamentos do ministério</p></div>
      {isAdmin && <button type="button" className="equipment-add" aria-label="Adicionar equipamento" onClick={onAdd}><Icon name="plus" size={18}/>Novo</button>}
    </header>

    <section className="equipment-overview" aria-label="Resumo do inventário" aria-busy={loading}>
      <div className="equipment-overview-copy">
        <span className="equipment-eyebrow">Inventário</span>
        <h3 className="equipment-total">{initialLoading ? 'Carregando…' : `${summary.total} equipamento${summary.total === 1 ? '' : 's'}`}</h3>
        {!initialLoading && <div className="equipment-summary">
          <p className="equipment-available"><span aria-hidden="true"/>{summary.available} {summary.available === 1 ? 'disponível' : 'disponíveis'}</p>
          <p><span>{summary.inUse} em uso</span><span aria-hidden="true">·</span><span>{summary.maintenance} em manutenção</span></p>
        </div>}
      </div>
      <img src="/images/more/equipment.webp" alt="" width="220" height="170" decoding="async"/>
    </section>

    <label className="equipment-search"><Icon name="search" size={20}/><input type="search" value={search} onChange={event => onSearchChange(event.target.value)} aria-label="Buscar equipamento" placeholder="Buscar equipamento..."/></label>
    <div className="equipment-filters" role="group" aria-label="Filtrar por status">
      {filters.map(([value, label]) => <button key={value} type="button" aria-pressed={statusFilter === value} onClick={() => onStatusChange(value)}>{label}</button>)}
    </div>

    <section className="equipment-list" aria-label="Equipamentos" aria-busy={loading}>
      <div className="equipment-list-heading"><h3>Equipamentos</h3>{!initialLoading && (search || statusFilter !== 'all') && <span>{items.length} resultado{items.length === 1 ? '' : 's'}</span>}</div>
      {initialLoading ? <div className="equipment-loading" role="status">Carregando equipamentos…</div> : items.length ? items.map(item => <EquipmentItem key={item.id} item={item} custodian={members.find(member => member.id === item.custodian_id)} isAdmin={isAdmin} onEdit={onEdit}/>) : <div className="equipment-empty">
        <Icon name="search" size={26}/><h3>{equipment.length ? 'Nenhum equipamento encontrado' : 'Nenhum equipamento cadastrado'}</h3><p>{equipment.length ? 'Ajuste a busca ou o filtro de status.' : 'Os equipamentos cadastrados aparecerão aqui.'}</p>
      </div>}
    </section>
  </section>;
}
