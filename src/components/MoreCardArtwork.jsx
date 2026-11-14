const artwork = {
  repertorio: 'music',
  treinamento: 'training',
  ensaio: 'rehearsal',
  patrimonio: 'equipment',
  membros: 'members',
  admin: 'settings',
};

export default function MoreCardArtwork({ destination }) {
  const image = artwork[destination];
  if (!image) return null;

  return <img className="app-more-artwork" src={`/images/more/${image}.webp`} alt="" width="384" height="320" loading="lazy" decoding="async" draggable="false"/>;
}
