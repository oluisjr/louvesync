import test from 'node:test';
import assert from 'node:assert/strict';
import axios from 'axios';
import maestro from '../api/maestro.js';
import proxy from '../api/proxy.js';
import deleteEvent from '../api/delete-event.js';
function response() {
  return { code: 200, body: null, setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, send(body) { this.body = body; return this; } };
}
test('admin deletion handler loads in ESM and rejects an unauthenticated request', async () => {
  const res = response();
  await deleteEvent({ method: 'POST', headers: {}, query: {}, body: {} }, res);
  assert.equal(res.code, 401);
});
test('proxy rejects a private address before any upstream request', async () => {
  const res = response(); let called = false;
  const original = axios.get; axios.get = async () => { called = true; };
  try { await proxy({ query: { url: 'https://127.0.0.1/' } }, res); }
  finally { axios.get = original; }
  assert.equal(res.code, 400); assert.equal(called, false);
});
test('cifra extraction succeeds even if its optional cache is unavailable', async () => {
  const original = axios.get;
  axios.get = async () => ({ data: '<html><pre>' + '[C]Linha de teste da cifra\n'.repeat(50) + '</pre></html>' });
  try {
    const { default: cifra } = await import('../api/cifra.js');
    const res = response();
    await cifra({ method: 'GET', query: { url: 'https://www.cifraclub.com.br/fixture/song/' } }, res);
    assert.equal(res.code, 200); assert.equal(res.body.hasCifra, true); assert.ok(res.body.text.includes('[C]'));
  } finally { axios.get = original; }
});
test('Maestro refuses unsupported methods and validates payloads without exposing its key', async () => {
  const previous = process.env.GROQ_API_KEY;
  process.env.GROQ_API_KEY = 'fixture-private-key';
  try {
    const get = response(); await maestro({ method: 'GET' }, get); assert.equal(get.code, 405);
    const invalid = response(); await maestro({ method: 'POST', headers: { host: 'louvesync.vercel.app' }, body: { messages: [{ role: 'invalid', content: 'test' }] } }, invalid);
    assert.equal(invalid.code, 400); assert.ok(!JSON.stringify(invalid.body).includes(process.env.GROQ_API_KEY));
    const external = response(); await maestro({ method: 'POST', headers: { host: 'louvesync.vercel.app', origin: 'https://other.test' }, body: {} }, external); assert.equal(external.code, 403);
  } finally { if (previous === undefined) delete process.env.GROQ_API_KEY; else process.env.GROQ_API_KEY = previous; }
});
