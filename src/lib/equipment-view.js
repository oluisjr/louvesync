export function equipmentSummary(equipment) {
  const summary = { total: equipment.length, available: 0, inUse: 0, maintenance: 0 };
  for (const item of equipment) {
    if (item.status === 'Disponível') summary.available++;
    else if (item.status === 'Em uso') summary.inUse++;
    else if (item.status === 'Manutenção') summary.maintenance++;
  }
  return summary;
}

export function equipmentStatusTone(status) {
  if (status === 'Disponível') return 'available';
  if (status === 'Em uso') return 'in-use';
  if (status === 'Manutenção') return 'maintenance';
  return 'unknown';
}

export function equipmentArtwork(item) {
  const name = `${item.name || ''} ${item.brand || ''}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/\b(cabo|capa|case|suporte|pedal|bag)\b/.test(name)) return '/images/more/equipment.webp';
  if (/\b(microfone|microphone|mic|sm58|sm57)\b/.test(name)) return '/images/equipment/microphone.webp';
  if (/\b(teclado|keyboard|piano|sintetizador|synth)\b/.test(name)) return '/images/equipment/keyboard.webp';
  if (/\b(baixo|contrabaixo|bass)\b/.test(name)) return '/images/equipment/bass.webp';
  if (/\b(sax|saxofone|saxophone)\b/.test(name)) return '/images/equipment/saxophone.webp';
  if ((/\bflauta\b/.test(name) && !/\bflauta doce\b/.test(name)) || /\bflute\b/.test(name)) return '/images/equipment/flute.webp';
  if (/\b(cavaquinho|cavaco)\b/.test(name)) return '/images/equipment/cavaquinho.webp';
  if (/\b(ukulele|ukelele)\b/.test(name)) return '/images/equipment/ukulele.webp';
  if (/\b(violao|guitarra|guitar)\b/.test(name)) return '/images/equipment/guitar.webp';
  return '/images/more/equipment.webp';
}
