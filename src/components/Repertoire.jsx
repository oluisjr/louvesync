import { memo, useId, useMemo } from 'react';
import { Icon } from './Interface.jsx';
import { repertoireView } from '../lib/repertoire-view.js';
import '../repertoire.css';

function Star({ filled = false }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m12 3 2.8 5.7 6.3.9-4.5 4.4 1 6.2-5.6-3-5.6 3 1-6.2L3 9.6l6.2-.9L12 3Z"/></svg>;
}

function SongRow({ song, favorite, onOpen, onEdit, onFavorite }) {
  const title = String(song.title || 'Sem título');
  const metadata = [song.bpm && `${song.bpm} BPM`, song.time_signature, ...(song.tags || []).slice(0, 2)].filter(Boolean);
  return <article className="repertoire-song" aria-label={title}>
    <button type="button" className="repertoire-song-open" aria-label={`Abrir cifra de ${title}`} onClick={() => onOpen(song)}>
      <span className="repertoire-song-copy"><strong>{title}</strong><span className="repertoire-artist">{song.artist || 'Ministério'}</span>{!!metadata.length && <span className="repertoire-metadata">{metadata.join(' · ')}</span>}</span>
      <span className="repertoire-song-key" aria-label={`Tom ${song.key || 'não informado'}`}>{song.key || '—'}</span>
    </button>
    <div className="repertoire-song-actions">
      <button type="button" className="repertoire-favorite" aria-label={favorite ? `Remover ${title} dos favoritos` : `Favoritar ${title}`} aria-pressed={favorite} onClick={() => onFavorite(song.id)}><Star filled={favorite}/></button>
      <button type="button" aria-label={`Editar ${title}`} onClick={() => onEdit(song)}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 5 4 4M4 20l4-1L21 6a2.8 2.8 0 0 0-4-4L4 15l-1 6Z"/></svg></button>
    </div>
  </article>;
}

export default memo(function Repertoire({ dark, songs, categories, catF, setCatF, search, setSearch, keyF, setKeyF, favorites, onToggleFav, onSelectSong, onSetAddOpen, loading = false }) {
  const headingId = useId();
  const view = useMemo(() => repertoireView(songs, categories, { category: catF, key: keyF, search, favorites }), [songs, categories, catF, keyF, search, favorites]);
  const initialLoading = loading && !songs.length;
  const filters = [{id:'all',label:'Todos',count:view.total},{id:'fav',label:'Favoritas',count:view.favoriteCount},...view.categories];
  const clearFilters = () => { setCatF('all'); setSearch(''); setKeyF(''); };

  return <section className="repertoire-page" data-theme={dark ? 'dark' : 'light'} aria-labelledby={headingId}>
    <header className="repertoire-heading"><div><h2 id={headingId}>Repertório</h2><p>Músicas para o seu ministério</p></div><button type="button" className="repertoire-add" onClick={() => onSetAddOpen(true)}><Icon name="plus" size={17}/>Adicionar</button></header>
    <section className="repertoire-overview" aria-label="Resumo do repertório" aria-busy={loading}>
      <div><span className="repertoire-eyebrow">Biblioteca musical</span><h3>{initialLoading ? 'Carregando…' : `${view.total} música${view.total === 1 ? '' : 's'}`}</h3>{!initialLoading && <p>{view.categoryCount} categoria{view.categoryCount === 1 ? '' : 's'}<span aria-hidden="true">·</span>{view.favoriteCount} favorita{view.favoriteCount === 1 ? '' : 's'}</p>}</div>
      <img src="/images/more/music.webp" alt="" width="200" height="178" decoding="async"/>
    </section>
    <label className="repertoire-search"><Icon name="search" size={19}/><input type="search" value={search} onChange={event => setSearch(event.target.value)} aria-label="Buscar música ou artista" placeholder="Buscar música ou artista..."/>{!!search && <button type="button" aria-label="Limpar busca" onClick={() => setSearch('')}><Icon name="close" size={17}/></button>}</label>
    <div className="repertoire-toolbar"><h3>Catálogo</h3><label className="repertoire-key-filter"><span>Tom</span><select aria-label="Filtrar por tom" value={keyF} onChange={event => setKeyF(event.target.value)}><option value="">Todos os tons</option>{view.keys.map(key => <option key={key} value={key}>{key}</option>)}</select></label></div>
    <div className="repertoire-categories" role="group" aria-label="Filtrar por categoria">
      {filters.map(filter => <button key={filter.id} type="button" aria-label={filter.label} aria-pressed={catF === filter.id} onClick={() => setCatF(filter.id)}>{filter.id === 'fav' && <Star/>}{filter.label}<span aria-hidden="true">{filter.count}</span></button>)}
    </div>
    <div className="repertoire-results"><span role="status" aria-live="polite">{initialLoading ? 'Carregando repertório…' : `${view.resultCount} música${view.resultCount === 1 ? '' : 's'}${view.hasFilters ? ' encontrada' + (view.resultCount === 1 ? '' : 's') : ' no repertório'}${loading ? ' · Atualizando…' : ''}`}</span>{view.hasFilters && <button type="button" onClick={clearFilters}>Limpar filtros</button>}</div>
    <div className="repertoire-groups" aria-busy={loading}>
      {view.groups.map(group => <section key={group.id} className="repertoire-group" aria-label={group.label}>
        <div className="repertoire-group-heading"><span style={{background:group.color}} aria-hidden="true"/><h3>{group.label}</h3><span>{group.songs.length}</span></div>
        <div className="repertoire-song-list">{group.songs.map(song => <SongRow key={song.id} song={song} favorite={favorites?.includes(song.id)} onOpen={onSelectSong} onEdit={onSetAddOpen} onFavorite={onToggleFav}/>)}</div>
      </section>)}
      {!initialLoading && !view.resultCount && <div className="repertoire-empty"><Icon name="music" size={27}/><h3>{view.total ? catF === 'fav' && !view.favoriteCount ? 'Suas favoritas ficam aqui' : 'Nenhuma música encontrada' : 'Seu repertório começa aqui'}</h3><p>{view.total ? catF === 'fav' && !view.favoriteCount ? 'Toque na estrela de uma música para guardá-la nesta lista.' : 'Tente outro termo, categoria ou tom.' : 'Adicione a primeira música para a equipe.'}</p>{view.total ? <button type="button" onClick={clearFilters}>Ver todas as músicas</button> : <button type="button" onClick={() => onSetAddOpen(true)}>Adicionar música</button>}</div>}
    </div>
  </section>;
});
