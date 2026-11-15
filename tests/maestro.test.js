import test from 'node:test';
import assert from 'node:assert/strict';
import { createMaestroHandler, maestroConfig } from '../server/maestro.js';
import { maestroEndpoint, maestroRequest } from '../src/lib/maestro-client.js';
const secret = 'xai-SYNTHETIC_SERVER_ONLY_KEY', pin = 'SYNTHETIC_PRIVATE_MEMBER_PIN';
const member = { id: 'member', name: 'Membro', status: 'ativo', role: 'Vocal', is_admin: false };
const body = { memberId: member.id, pin, messages: [{ role: 'user', content: 'Como preparar o ensaio?' }] };
const request = (patch = {}) => ({ method: 'POST', headers: { host: 'louvesync.vercel.app', origin: 'https://louvesync.vercel.app' }, body, ...patch });
const response = () => ({ code: 200, body: null, headers: {}, setHeader(name, value) { this.headers[name] = value; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, send(body) { this.body = body; return this; } });

test('GROK_API_KEY actually configures Maestro and Groq keys under the old misspelling still use Groq', () => {
  assert.equal(maestroConfig({}), null);
  const grok = maestroConfig({ GROK_API_KEY: secret }); assert.equal(grok.provider, 'xai'); assert.equal(grok.model, 'grok-4.3'); assert.equal(grok.url, 'https://api.x.ai/v1/chat/completions');
  const groq = maestroConfig({ GROK_API_KEY: 'gsk_SYNTHETIC_KEY' }); assert.equal(groq.provider, 'groq'); assert.match(groq.url, /api.groq.com/);
  assert.equal(maestroConfig({ XAI_API_KEY: secret, XAI_MODEL: 'configured-model' }).model, 'configured-model');
});

test('a real server response uses the configured provider model and never forwards the member PIN or exposes the API key', async () => {
  let outbound, auth;
  const handler = createMaestroHandler({ environment: { GROK_API_KEY: secret }, verifyActor: async value => { auth = value; return member; }, fetcher: async (url, options) => { outbound = { url, options }; return Response.json({ choices: [{ message: { content: 'Planeje o repertório e reserve tempo para as transições.' } }], internal: secret }); } });
  const res = response(); await handler(request({ body: { ...body, model: 'untrusted-model', max_tokens: 999999, is_admin: true } }), res);
  assert.equal(res.code, 200); assert.deepEqual(auth, { memberId: member.id, pin });
  const payload = JSON.parse(outbound.options.body); assert.equal(payload.model, 'grok-4.3'); assert.equal(payload.max_tokens, 2000);
  assert.equal(outbound.options.headers.Authorization, 'Bearer ' + secret);
  assert.ok(!outbound.options.body.includes(pin)); assert.ok(!JSON.stringify(res.body).includes(secret)); assert.equal(res.headers['Cache-Control'], 'private, no-store');
});

test('server enforces persisted Maestro visibility and actual member authentication', async () => {
  let calls = 0;
  for (const actor of [null, { ...member, permissions: ['home'] }, { ...member, status: 'inativo' }]) {
    const handler = createMaestroHandler({ environment: { GROK_API_KEY: secret }, verifyActor: async () => actor, fetcher: async () => { calls++; } });
    const res = response(); await handler(request({ body: { ...body, is_admin: true, permissions: ['ia'] } }), res);
    assert.equal(res.code, actor ? 403 : 401);
  }
  assert.equal(calls, 0);
});

test('native WebViews receive CORS support but external sites are refused before authentication or billing', async () => {
  let verified = false;
  const handler = createMaestroHandler({ environment: { GROK_API_KEY: secret }, verifyActor: async () => { verified = true; return member; } });
  const preflight = response(); await handler(request({ method: 'OPTIONS', headers: { host: 'louvesync.vercel.app', origin: 'https://localhost' } }), preflight);
  assert.equal(preflight.code, 204); assert.equal(preflight.headers['Access-Control-Allow-Origin'], 'https://localhost'); assert.equal(verified, false);
  const denied = response(); await handler(request({ headers: { host: 'louvesync.vercel.app', origin: 'https://other.test' } }), denied); assert.equal(denied.code, 403); assert.equal(verified, false);
  assert.equal(maestroEndpoint({ origin: 'https://localhost', native: true }), 'https://louvesync.vercel.app/api/maestro');
  assert.equal(maestroEndpoint({ origin: 'http://localhost:5174', native: false }), '/api/maestro');
});

test('provider failures distinguish invalid keys, missing models and credits without leaking upstream messages', async () => {
  for (const [status, expected] of [[401, 'provider_auth'], [403, 'provider_auth'], [404, 'provider_model'], [429, 'provider_quota'], [500, 'provider_unavailable']]) {
    const handler = createMaestroHandler({ environment: { GROK_API_KEY: secret }, verifyActor: async () => member, fetcher: async () => Response.json({ error: secret }, { status }) });
    const res = response(); await handler(request(), res); assert.equal(res.body.code, expected); assert.ok(!JSON.stringify(res.body).includes(secret));
  }
});

test('client authenticates, awaits a nonempty reply and preserves useful configuration errors', async () => {
  let call;
  const result = await maestroRequest({ memberId: member.id, pin }, body.messages, { fetcher: async (url, options) => { call = { url, options }; return Response.json({ choices: [{ message: { content: 'Resposta real do teste' } }] }); } });
  assert.equal(result, 'Resposta real do teste'); assert.equal(JSON.parse(call.options.body).pin, pin); assert.equal(call.options.method, 'POST');
  await assert.rejects(maestroRequest({ memberId: member.id, pin }, body.messages, { fetcher: async () => Response.json({ error: 'A configuração foi recusada.', code: 'provider_auth' }, { status: 503 }) }), error => error.code === 'provider_auth' && error.message === 'A configuração foi recusada.');
  await assert.rejects(maestroRequest({ memberId: member.id, pin }, body.messages, { fetcher: async () => Response.json({ choices: [] }) }), /resposta completa/);
});
