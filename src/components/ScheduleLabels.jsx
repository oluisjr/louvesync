import { Icon } from './Interface.jsx';
import '../schedule-labels.css';
const categories={jubilo:['Júbilo','celebration'],adoracao:['Adoração','worship'],hinario:['Hinário','hymn'],oferta:['Oferta','offering'],corinho:['Corinhos','chorus'],corinhos:['Corinhos','chorus'],ceia:['Santa Ceia','communion'],santa_ceia:['Santa Ceia','communion']};
export function ResponseBadge({ value, label }) {
  const state=value===true?'yes':value===false?'no':'pending';
  return <span className="rsvp-badge" data-response={state}><Icon name={state==='yes'?'check':state==='no'?'close':'timer'} size={13}/>{label||(state==='yes'?'Confirmado':state==='no'?'Recusou':'Pendente')}</span>;
}
export function CategoryBadge({ category, label }) {
  const meta=categories[category]||[label||category||'Sem categoria','other'];
  return <span className="song-category-badge" data-category={meta[1]}>{label||meta[0]}</span>;
}
