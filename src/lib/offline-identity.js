import { cacheRead, cacheWrite, cacheRemove } from './offline-store.js';
import { publicMember } from './member-session.js';
const encode = value => Array.from(value).map(byte => byte.toString(16).padStart(2, '0')).join('');
const decode = value => Uint8Array.from(value.match(/../g) || [], byte => parseInt(byte, 16));
async function verifier(pin, salt) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  return encode(new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: decode(salt), iterations: 180000, hash: 'SHA-256' }, key, 256)));
}
export async function rememberIdentity(member, pin) {
  const salt = encode(crypto.getRandomValues(new Uint8Array(16)));
  const hash = await verifier(pin, salt);
  if(!cacheWrite('identity:' + member.id, { member: publicMember(member), salt, hash }))throw new Error('Libere espaço no aparelho para preparar seu acesso offline com segurança.');
}
export async function unlockIdentity(memberId, pin) {
  const cached = cacheRead('identity:' + memberId);
  if (!cached) throw new Error('O primeiro acesso desta conta precisa de internet. Depois você poderá entrar offline com seu PIN.');
  if (await verifier(pin, cached.salt) !== cached.hash) throw new Error('PIN incorreto.');
  return cached.member;
}
export function forgetIdentity(memberId) { cacheRemove('identity:' + memberId); }
