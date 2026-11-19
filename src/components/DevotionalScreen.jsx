import { useState } from 'react';
import { Dialog, Icon } from './Interface.jsx';
import './ministry-pages.css';

const reflection = {
  type: 'text',
  title: 'Comunidade: onde a graça opera',
  theme: 'Comunhão',
  author: 'Baseado em John Wesley',
  text: 'A fé cristã é essencialmente social. Quando nos reunimos para ensaiar, estamos praticando a disciplina do amor mútuo. As discordâncias no tom da música ou no volume da bateria são oportunidades para exercer a paciência e suportar uns aos outros em amor. A adoração perfeita não vem de notas executadas sem erro, mas de corações unidos em uma única voz.',
};

const resources = [
  { type: 'podcast', title: 'O coração do ministro', theme: 'Liderança', desc: 'Podcast JesusCopy — Refletindo sobre a verdadeira adoração e os perigos de buscar os holofotes.', spotifyId: '5bU5h2C3N4957pE5FjUa7P' },
  { type: 'video', title: 'A essência da adoração', theme: 'Devocional', desc: 'Ministração Nívea Soares', ytId: 'WNnFmy-cqzg' },
  { type: 'text', title: 'O altar não é palco', theme: 'Postura', author: 'C.S. Lewis', text: 'O louvor não existe para nos entreter, mas para completar a nossa alegria em Deus. Quando estamos no altar, devemos ser como janelas: as pessoas não devem olhar PARA nós, mas sim ATRAVÉS de nós, para verem a Cristo.' },
  { type: 'video', title: 'Como fluir no louvor', theme: 'Devocional', desc: 'Dicas práticas de adoração', ytId: 'BEkStuKw5Ow' },
];

const formats = {
  text: { singular: 'Leitura', plural: 'Leituras', image: '/images/more/devotional.webp', icon: 'book' },
  podcast: { singular: 'Podcast', plural: 'Áudio', image: '/images/more/rehearsal.webp', icon: 'sound' },
  video: { singular: 'Vídeo', plural: 'Vídeos', image: '/images/louve-redesign/video.webp', icon: 'play' },
};

function ResourceContent({ resource, online }) {
  if (resource.type === 'text') return <div className="devotional-reading">
    <p>{resource.text}</p>
    <small>{resource.author}</small>
  </div>;

  return <div className="devotional-media" data-format={resource.type}>
    <p>{resource.desc}</p>
    {online ? <iframe
      title={resource.title}
      src={resource.type === 'podcast'
        ? `https://open.spotify.com/embed/show/${resource.spotifyId}`
        : `https://www.youtube.com/embed/${resource.ytId}`}
      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
      allowFullScreen
    /> : <p role="status">{resource.type === 'podcast' ? 'O áudio do Spotify' : 'O vídeo'} precisa de internet para carregar.</p>}
  </div>;
}

export default function DevotionalScreen({ dark, online }) {
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState(null);
  const visible = filter === 'all' ? resources : [reflection, ...resources].filter(resource => resource.type === filter);

  return <div className="app-page ministry-page devotional-page" data-theme={dark ? 'dark' : 'light'}>
    <h1>Devocional</h1>
    <article className="devotional-feature">
      <img src="/images/louve-redesign/devocional.webp" alt="" width="1200" height="675" fetchPriority="high"/>
      <div className="devotional-feature-copy">
        <span>{reflection.theme}</span>
        <h2>{reflection.title}</h2>
        <button type="button" onClick={() => setSelected(reflection)}>Ler reflexão <Icon name="arrow-right" size={17}/></button>
      </div>
    </article>
    <section className="ministry-section" aria-labelledby="devotional-resources">
      <h2 id="devotional-resources">Recursos</h2>
      <div className="ministry-filters" role="group" aria-label="Formatos de recurso">
        {[['all', 'Todos'], ...Object.entries(formats).map(([key, value]) => [key, value.plural])].map(([key, label]) =>
          <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}</button>
        )}
      </div>
      <ul className="ministry-list">
        {visible.map(resource => {
          const format = formats[resource.type];
          return <li key={resource.title}>
            <button type="button" className="ministry-row" onClick={() => setSelected(resource)}>
              <img className="devotional-resource-art" src={format.image} alt="" width="54" height="54"/>
              <span className="ministry-row-copy"><strong>{resource.title}</strong><small>{format.singular} · {resource.theme}</small></span>
              <Icon name="right" size={18} className="ministry-chevron"/>
            </button>
          </li>;
        })}
      </ul>
    </section>
    {selected && <Dialog dark={dark} title={selected.title} eyebrow={selected.theme} icon={formats[selected.type].icon}
      closeLabel="Fechar recurso" onClose={() => setSelected(null)} compact>
      <ResourceContent resource={selected} online={online}/>
    </Dialog>}
  </div>;
}
