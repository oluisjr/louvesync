import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { setTimeout } from 'node:timers/promises';

const exec = promisify(execFile), env = { ...process.env };
for (const name of ['DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH']) delete env[name];
const name = `louvesync-activity-${randomUUID().slice(0, 8)}`;
const docker = (...args) => exec('docker', ['--host=unix:///var/run/docker.sock', ...args], { env, maxBuffer: 2 * 1024 * 1024 });
try {
  await docker('run', '--rm', '-d', '--network', 'none', '--name', name, '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', '-e', 'POSTGRES_DB=louvesync_test', 'postgres:17-alpine');
  let ready = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    try { await docker('exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'louvesync_test'); ready = true; break; }
    catch { await setTimeout(500); }
  }
  if (!ready) throw new Error('PostgreSQL de teste não iniciou.');
  await docker('exec', name, 'mkdir', '-p', '/app/supabase/migrations');
  await docker('cp', resolve('supabase/migrations/20261108_admin_activity.sql'), `${name}:/app/supabase/migrations/20261108_admin_activity.sql`);
  await docker('cp', resolve('tests/sql/activity.sql'), `${name}:/app/activity.sql`);
  const result = await docker('exec', name, 'psql', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'louvesync_test', '-v', 'ON_ERROR_STOP=1', '-f', '/app/activity.sql');
  process.stdout.write(result.stdout);
} finally { await docker('rm', '-f', name).catch(() => {}); }
