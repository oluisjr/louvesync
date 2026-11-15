import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';

// A disposable in-memory PostgreSQL instance. Never connects to the app project.
const database = await PGlite.create();
try {
  await database.exec(await readFile(new URL('../tests/sql/attendance-setup.sql', import.meta.url), 'utf8'));
  const files = (await readdir(new URL('../supabase/migrations/', import.meta.url))).filter(name => name.endsWith('_ministry_attendance.sql'));
  if (files.length !== 1) throw new Error('Expected one attendance migration.');
  const migration = await readFile(new URL('../supabase/migrations/' + files[0], import.meta.url), 'utf8');
  await database.exec(migration);
  await database.exec(migration);
  await database.exec(await readFile(new URL('../tests/sql/attendance.sql', import.meta.url), 'utf8'));
  process.stdout.write('Attendance PostgreSQL checks passed: authorization, rosters, revisions, dates, partial calls and concurrency.\n');
} finally { await database.close(); }
