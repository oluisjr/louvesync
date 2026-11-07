import { Icon } from './Interface.jsx';

export default function MetronomeControls({ metronome, action, compact = false }) {
  const { active, starting, beat, bpm, beats, signature, error, toggle } = metronome;
  const label = starting ? 'Ativando áudio…' : active ? 'Parar metrônomo' : 'Ativar metrônomo';
  return <div className={'ui-metronome' + (compact ? ' ui-metronome-compact' : '')} data-update-blocking={active || starting}>
    <div className="ui-metronome-actions"><button className={'ui-button ' + (active ? 'ui-button-primary' : 'ui-button-soft')} disabled={starting} aria-label={label} aria-pressed={active} onClick={toggle}><Icon name={active ? 'pause' : 'sound'} size={17}/>{compact && !starting ? active ? 'Parar' : 'Metrônomo' : label}</button>{action}</div>
    <div className="ui-metronome-status"><span>♩ {bpm} BPM · {signature}</span><div className="ui-metronome-beats" aria-label={'Compasso ' + signature}>
      {Array.from({ length: beats }, (_, index) => <span key={index} className="ui-metronome-dot" data-beat={index + 1} data-active={active && beat === index} aria-hidden="true"/>)}
    </div></div>
    {error && <p className="ui-message ui-error" role="alert">{error}</p>}
  </div>;
}
