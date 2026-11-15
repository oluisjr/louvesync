import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
const database = await PGlite.create();
try {
  await database.exec(await readFile(new URL('../tests/sql/event-changes-setup.sql', import.meta.url), 'utf8'));
  const attendance = (await readdir(new URL('../supabase/migrations/', import.meta.url))).find(name => name.endsWith('_ministry_attendance.sql'));
  await database.exec(await readFile(new URL('../supabase/migrations/' + attendance, import.meta.url), 'utf8'));
  const files = (await readdir(new URL('../supabase/migrations/', import.meta.url))).filter(name => name.endsWith('_event_change_approval_and_audit.sql'));
  if (files.length !== 1) throw new Error('Expected one event approval migration.');
  const sql = await readFile(new URL('../supabase/migrations/' + files[0], import.meta.url), 'utf8');
  await database.exec(sql); await database.exec(sql);
  await database.exec(await readFile(new URL('../tests/sql/event-changes.sql', import.meta.url), 'utf8'));
  process.stdout.write('PostgreSQL permission, approval, concurrency and audit checks passed.\n');
} catch(error) { process.stderr.write(JSON.stringify({message:error.message,code:error.code,detail:error.detail,where:error.where})+'\n'); process.exitCode=1; } finally { await database.close(); }
