import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { normalizeSupabaseUrl } from '../src/lib/supabase-url.js';

test('project and Data API URLs reach the same SDK RPC and members routes without duplicated rest/v1', async () => {
  for (const [configured, base] of [
    ['https://fixture.supabase.co', 'https://fixture.supabase.co'],
    [' https://fixture.supabase.co/rest/v1/ ', 'https://fixture.supabase.co'],
    ['fixture.supabase.co/rest/v1/rpc/louvesync_activity', 'https://fixture.supabase.co'],
    ['https://fixture.supabase.co/rest/v1/members?select=*&apikey=fixture-query-key#api', 'https://fixture.supabase.co'],
    ['https://proxy.example.test/supabase/rest/v1/', 'https://proxy.example.test/supabase'],
  ]) {
    const calls = [];
    const url = normalizeSupabaseUrl(configured);
    assert.equal(url, base);
    assert.equal(normalizeSupabaseUrl(url), base);
    const client = createClient(url, 'fixture-public-key', {
      auth: { persistSession: false },
      global: { fetch: async (request) => {
        calls.push(String(request));
        // Same invalid-path condition that produced PGRST125 in production.
        if (new URL(request).pathname.includes('/rest/v1/rest/v1/')) return Response.json({ code: 'PGRST125' }, { status: 404 });
        return Response.json([]);
      } },
    });
    const rpc = await client.rpc('louvesync_activity', { p_payload: { action: 'online' } });
    const members = await client.from('members').select('id');
    assert.equal(rpc.error, null); assert.equal(members.error, null);
    assert.equal(calls[0], base + '/rest/v1/rpc/louvesync_activity');
    assert.equal(new URL(calls[1]).pathname, new URL(base).pathname.replace(/\/$/, '') + '/rest/v1/members');
    assert.ok(calls.every(call => !call.includes('fixture-query-key')));
  }
});
