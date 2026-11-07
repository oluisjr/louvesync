import { useId, useState } from 'react';
import { Dialog, Icon, Section } from './Interface.jsx';

const screens = [
  ['home', 'Início'], ['repertorio', 'Repertório'], ['escala', 'Escala'],
  ['devocional', 'Devocional'], ['treinamento', 'Treinamento'],
  ['patrimonio', 'Patrimônio'], ['membros', 'Membros'], ['admin', 'Painel administrativo'],
];
const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export default function MemberEditor({ dark, member, isNew, canDelete, onSave, onDelete, onClose }) {
  const [form, setForm] = useState(() => ({ ...member }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const formId = useId();
  const update = patch => setForm(previous => ({ ...previous, ...patch }));
  const toggleList = (key, value, checked) => setForm(previous => ({ ...previous,
    [key]: checked ? [...new Set([...(previous[key] || []), value])] : (previous[key] || []).filter(item => item !== value),
  }));
  const updateName = name => {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    const avatar = parts.length > 1 ? parts[0][0] + parts[1][0] : parts[0]?.slice(0, 2) || 'NM';
    update({ name, avatar: avatar.toUpperCase() });
  };
  const submit = async event => {
    event.preventDefault();
    if (saving) return;
    if (!form.name?.trim() || !form.pin?.trim()) { setError('Preencha o nome e o PIN de acesso.'); return; }
    setSaving(true); setError('');
    try { await onSave({ ...form, name: form.name.trim() }); }
    catch (failure) { setError('Não foi possível salvar o membro. ' + (failure.message || 'Tente novamente.')); }
    finally { setSaving(false); }
  };
  return <Dialog dark={dark} icon="users" title={isNew ? 'Novo membro' : 'Editar membro'} description="Organize o perfil, o acesso e a participação na equipe." closeLabel="Fechar cadastro de membro" busy={saving} onClose={onClose}
    footer={<>
      {error && <div className="ui-message ui-error" role="alert">{error}</div>}
      <div className="ui-dialog-buttons"><button type="button" className="ui-button" onClick={onClose} disabled={saving}>Cancelar</button><button type="submit" form={formId} className="ui-button ui-button-primary" disabled={saving}><Icon name="check" size={17}/>{saving ? 'Salvando…' : isNew ? 'Cadastrar membro' : 'Salvar alterações'}</button></div>
    </>}>
    <form id={formId} onSubmit={submit} className="ui-member-form">
      <fieldset disabled={saving} className="ui-member-fields">
        <div className="ui-member-profile">
          <span className="ui-avatar" style={{ '--avatar-color': form.color || '#7b3ff2', '--avatar-tint': (form.color || '#7b3ff2') + '18' }}>{form.avatar || 'NM'}</span>
          <div><span className="ui-eyebrow">Faz parte da nossa harmonia</span><strong>{form.name.trim() || 'Um novo talento na equipe'}</strong><p>{form.instrument || 'Preencha os dados para começar.'}</p></div>
        </div>
        <Section icon="users" title="Dados do membro">
          <label className="ui-field">Nome completo<input value={form.name || ''} onChange={event => updateName(event.target.value)} placeholder="Como a pessoa se chama?" autoComplete="name" required/></label>
          <label className="ui-field">Função ou instrumento<input value={form.instrument || ''} onChange={event => update({ instrument: event.target.value })} placeholder="Ex.: Vocal 1, teclado, bateria"/></label>
        </Section>
        <Section icon="settings" title="Acesso ao app" description="Defina como este membro participa do LouveSync.">
          <label className="ui-field">PIN de acesso<input type="text" value={form.pin || ''} onChange={event => update({ pin: event.target.value })} placeholder="PIN numérico ou alfanumérico" autoComplete="off" autoCapitalize="none" spellCheck={false} required/></label>
          <label className="ui-member-option"><input type="checkbox" checked={!!form.is_admin} onChange={event => update({ is_admin: event.target.checked })}/><span><strong>Administrador</strong><small>Acesso completo à gestão do ministério.</small></span></label>
          <fieldset className="ui-member-permissions"><legend>Acesso às telas</legend><div className="ui-member-screen-grid">
            {screens.map(([id, label]) => <label className="ui-member-check" key={id}><input type="checkbox" checked={(form.permissions || []).includes(id) || (form.is_admin && id === 'admin')} disabled={form.is_admin && id === 'admin'} onChange={event => toggleList('permissions', id, event.target.checked)}/><span>{label}</span></label>)}
          </div></fieldset>
        </Section>
        <Section icon="calendar" title="Participação na escala">
          <label className="ui-member-option"><input type="checkbox" checked={form.status === 'ativo'} onChange={event => update({ status: event.target.checked ? 'ativo' : 'inativo' })}/><span><strong>Ativo na escala</strong><small>Participa da seleção da equipe para os eventos.</small></span></label>
          {/vocal|voz/i.test(form.instrument || '') && <label className="ui-field">Categoria vocal<select aria-label="Categoria vocal" value={form.vocal_category || ''} onChange={event => update({ vocal_category: event.target.value || null })}><option value="">Nenhuma</option><option value="adoracao">Adoração</option><option value="jubilo">Júbilo</option><option value="hinario">Hinário</option><option value="oferta">Oferta</option></select></label>}
          <fieldset className="ui-member-permissions"><legend>Dias indisponíveis</legend><p className="ui-helper">Marque os dias em que este membro não pode participar.</p><div className="ui-member-days">
            {weekdays.map((day, index) => <label className="ui-member-check" key={day}><input type="checkbox" aria-label={'Indisponível: ' + day} checked={(form.unavailableDays || []).includes(index)} onChange={event => toggleList('unavailableDays', index, event.target.checked)}/><span>{day}</span></label>)}
          </div></fieldset>
        </Section>
        {canDelete && <button className="ui-button ui-member-delete" type="button" onClick={onDelete}><Icon name="close" size={16}/>Excluir membro</button>}
      </fieldset>
    </form>
  </Dialog>;
}
