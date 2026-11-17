// A collective assignment is a setlist choice, never a member/account ID.
export const ALL_VOCALS = '__all__';

export function vocalName(singerId, members, fallback = 'Não definido') {
  if (singerId === ALL_VOCALS) return 'TODOS';
  return members.find(member => member.id === singerId)?.name || fallback;
}

export function isIndividualVocal(singerId) {
  return !!singerId && singerId !== ALL_VOCALS;
}
