import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
const db=await PGlite.create();
try{
  await db.exec(await readFile(new URL('../tests/sql/event-changes-setup.sql',import.meta.url),'utf8'));
  await db.exec('create role service_role bypassrls; grant usage on schema public to service_role;');
  const files=await readdir(new URL('../supabase/migrations/',import.meta.url));
  for(const suffix of ['_event_change_approval_and_audit.sql','_member_access_and_availability.sql','_church_member_classification.sql','_church_public_intake.sql','_church_administration.sql']){
    const file=files.find(name=>name.endsWith(suffix));if(!file)throw new Error('Missing migration: '+suffix);
    const sql=await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8');await db.exec(sql);if(suffix.includes('church_'))await db.exec(sql);
  }
  await db.exec(await readFile(new URL('../tests/sql/church-community.sql',import.meta.url),'utf8'));
  process.stdout.write('Church community PostgreSQL checks passed: classification, private intake, consent, moderation, rate limits and audit.\n');
}catch(error){process.stderr.write(JSON.stringify({message:error.message,code:error.code,where:error.where})+'\n');process.exitCode=1;}finally{await db.close();}
