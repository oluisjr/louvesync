import { useEffect, useRef } from 'react';
import { Icon } from './Interface.jsx';
import '../maestro.css';

const prompts = [
  ['Preparar o culto', 'Monte um setlist para o culto de domingo usando as músicas cadastradas. Organize um fluxo de celebração e adoração.'],
  ['Organizar o ensaio', 'Como organizar um ensaio produtivo com nossa equipe de louvor?'],
  ['Reflexão bíblica', 'Compartilhe uma reflexão sobre a adoração em João 4:23-24 para nossa equipe.'],
  ['Transições', 'Como preparar transições entre as músicas do culto, respeitando os tons de cada vocal?'],
];
export default function MaestroScreen({ dark, aiMsgs, aiIn, setAiIn, aiLoad, aiCount, onSendAI }) {
  const end = useRef(null), previous = useRef({ count: aiMsgs.length, loading: aiLoad }), limit = aiCount >= 10;
  useEffect(() => {
    if (aiMsgs.length > previous.current.count || aiLoad !== previous.current.loading) end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    previous.current = { count: aiMsgs.length, loading: aiLoad };
  }, [aiMsgs, aiLoad]);
  return <section className="maestro-page" data-theme={dark ? 'dark' : 'light'} aria-label="Maestro" aria-busy={aiLoad}>
    <header className="maestro-hero"><div><span>SEU ASSISTENTE NO MINISTÉRIO</span><h2>Olá, eu sou<br/>o Maestro.</h2><p>Vamos preparar o próximo encontro da sua equipe?</p><small>{aiCount}/10 respostas nesta sessão</small></div><img src="/images/maestro/character.webp" alt="Maestro, personagem de moletom azul com uma batuta" width="170" height="190"/></header>
    <div className="maestro-prompts" aria-label="Sugestões para conversar">{prompts.map(([label, prompt]) => <button key={label} type="button" disabled={aiLoad || limit} onClick={() => onSendAI(prompt)}>{label}<Icon name="right" size={14}/></button>)}</div>
    <div className="maestro-conversation" aria-label="Conversa com o Maestro" aria-live="polite">{aiMsgs.map((message, index) => <article key={index} className="maestro-message" data-author={message.r} data-error={message.err || undefined} role={message.err ? 'alert' : undefined}>
      {message.r === 'a' && <img src="/images/maestro/character.webp" alt="" width="35" height="35"/>}<div><strong>{message.r === 'u' ? 'Você' : 'Maestro'}</strong><p>{message.c}</p></div>
    </article>)}{aiLoad && <p className="maestro-thinking" role="status"><span/>Preparando uma resposta…</p>}</div>
    {limit && <p className="maestro-limit">Você recebeu 10 respostas nesta sessão. Volte mais tarde para continuar.</p>}
    <form className="maestro-compose" onSubmit={event => { event.preventDefault(); onSendAI(); }}><label className="sr-only" htmlFor="maestro-message-input">Mensagem para o Maestro</label><textarea id="maestro-message-input" data-update-blocking={!!aiIn.trim()} rows={2} value={aiIn} maxLength={8000} disabled={aiLoad || limit} onChange={event => setAiIn(event.target.value)} placeholder="No que posso ajudar sua equipe?" onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); onSendAI(); } }}/><button type="submit" aria-label="Enviar mensagem ao Maestro" disabled={aiLoad || limit || !aiIn.trim()}><Icon name="up" size={20}/></button></form>
    <p ref={end} className="maestro-footnote">As sugestões apoiam a equipe. A liderança revisa as decisões.</p>
  </section>;
}
