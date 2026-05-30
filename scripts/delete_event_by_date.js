#!/usr/bin/env node
/**
 * Delete events by date (YYYY-MM-DD) from Supabase along with related rows.
 * Usage: node scripts/delete_event_by_date.js 2026-05-31
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE URL or SERVICE ROLE KEY in environment (.env)');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL.replace(/"/g, ''), SERVICE_KEY.replace(/"/g, ''));

async function deleteByDate(dateStr) {
  try {
    console.log('Searching for events with date =', dateStr);
    const { data: events, error: selErr } = await supabase.from('events').select('id, date, label').eq('date', dateStr);
    if (selErr) throw selErr;
    if (!events || events.length === 0) {
      console.log('No events found for date', dateStr);
      return;
    }

    for (const ev of events) {
      console.log('Deleting event:', ev.id, ev.label || '', ev.date);
      const { error: e1 } = await supabase.from('event_songs').delete().eq('event_id', ev.id);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from('event_members').delete().eq('event_id', ev.id);
      if (e2) throw e2;
      const { error: e3 } = await supabase.from('events').delete().eq('id', ev.id);
      if (e3) throw e3;
      console.log('Deleted event', ev.id);
    }
  } catch (err) {
    console.error('Failed to delete events by date:', err.message || err);
    process.exitCode = 2;
  }
}

const dateArg = process.argv[2];
if (!dateArg) {
  console.error('Usage: node scripts/delete_event_by_date.js YYYY-MM-DD');
  process.exit(1);
}

deleteByDate(dateArg).then(() => process.exit()).catch(() => process.exit(1));
