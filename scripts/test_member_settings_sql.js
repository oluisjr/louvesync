import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
const database = await PGlite.create();
try {
  await database.exec(await readFile(new URL('../tests/sql/event-changes-setup.sql', import.meta.url), 'utf8'));
  const migrations = await readdir(new URL('../supabase/migrations/', import.meta.url));
  for (const suffix of ['_event_change_approval_and_audit.sql', '_member_access_and_availability.sql']) {
    const name = migrations.find(file => file.endsWith(suffix));
    const sql = await readFile(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8');
    await database.exec(sql); if (suffix.includes('member_access')) await database.exec(sql);
  }
  await database.exec(await readFile(new URL('../tests/sql/member-settings.sql', import.meta.url), 'utf8'));
  process.stdout.write('Member settings PostgreSQL checks passed: persistence, privacy, roles, weekdays, participation and history.\n');
} catch (error) { process.stderr.write(JSON.stringify({ message: error.message, code: error.code, where: error.where }) + '\n'); process.exitCode = 1; }
finally { await database.close(); }
