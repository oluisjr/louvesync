import { useId, useState } from 'react';
import { Dialog, Icon, Section } from './Interface.jsx';

export default function EquipmentEditor({ dark, item, members, isNew, onSave, onDelete, onClose }) {
  const [form, setForm] = useState(() => ({ ...item, name:item.name||'', brand:item.brand||'', serial_number:item.serial_number||'', status:item.status||'Disponível' }));
  const [operation, setOperation] = useState('');
  const [error, setError] = useState('');
  const formId = useId(), busy = !!operation;
  const update = patch => setForm(previous => ({ ...previous, ...patch }));
  const submit = async event => {
    event.preventDefault();
    if (busy) return;
    if (!form.name.trim()) { setError('Informe o nome do equipamento.'); return; }
    setOperation('save'); setError('');
    try { await onSave({ ...form, name:form.name.trim() }); }
    catch (failure) { setError('Não foi possível salvar. ' + (failure.message || 'Tente novamente.')); }
    finally { setOperation(''); }
  };
  const remove = async () => {
    if (busy) return;
    setOperation('delete'); setError('');
    try { await onDelete(); }
    catch (failure) { setError('Não foi possível excluir. ' + (failure.message || 'Tente novamente.')); }
    finally { setOperation(''); }
  };
  return <Dialog dark={dark} icon="settings" title={isNew?'Novo equipamento':'Editar equipamento'} description="Organize os dados, o estado e a custódia do patrimônio." closeLabel="Fechar cadastro de equipamento" busy={busy} onClose={onClose}
    footer={<>
      {error&&<div className="ui-message ui-error" role="alert">{error}</div>}
      <div className="ui-dialog-buttons"><button className="ui-button" type="button" disabled={busy} onClick={onClose}>Cancelar</button><button className="ui-button ui-button-primary" type="submit" form={formId} disabled={busy}><Icon name="check" size={17}/>{operation==='save'?'Salvando…':'Salvar'}</button></div>
    </>}>
    <form id={formId} onSubmit={submit}>
      <fieldset disabled={busy} style={{border:0,margin:0,padding:0,minWidth:0}}>
        <Section icon="settings" title="Dados do equipamento">
          <label className="ui-field">Nome do equipamento<input value={form.name} onChange={event=>update({name:event.target.value})} placeholder="Ex.: Microfone sem fio" required/></label>
          <label className="ui-field">Marca/fabricante<input value={form.brand} onChange={event=>update({brand:event.target.value})} placeholder="Ex.: Shure"/></label>
          <label className="ui-field">Número de série<input value={form.serial_number} onChange={event=>update({serial_number:event.target.value})} placeholder="Identificação do equipamento"/></label>
        </Section>
        <Section icon="users" title="Disponibilidade e custódia">
          <label className="ui-field">Status<select aria-label="Status" value={form.status} onChange={event=>update({status:event.target.value})}><option>Disponível</option><option>Em uso</option><option>Manutenção</option></select></label>
          <label className="ui-field">Responsável pela custódia<select aria-label="Responsável pela custódia" value={form.custodian_id||''} onChange={event=>update({custodian_id:event.target.value||null})}><option value="">Ninguém — disponível no estúdio</option>{members.map(member=><option key={member.id} value={member.id}>{member.name} ({member.instrument})</option>)}</select></label>
        </Section>
        {!isNew&&<button type="button" className="ui-button ui-member-delete" onClick={remove} disabled={busy}>{operation==='delete'?'Excluindo…':'Excluir equipamento'}</button>}
      </fieldset>
    </form>
  </Dialog>;
}
