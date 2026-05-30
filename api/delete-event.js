const { createClient } = require('@supabase/supabase-js');

// Secure admin endpoint to delete events by date.
// Protect with header 'x-internal-token' equal to process.env.INTERNAL_API_TOKEN
// Deploy to Vercel (or any serverless) — ensure SUPABASE_SERVICE_ROLE_KEY and INTERNAL_API_TOKEN are set in env.

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = req.headers['x-internal-token'] || req.query.token;
  if (!token || token !== process.env.INTERNAL_API_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const date = req.body && req.body.date ? String(req.body.date) : req.query.date;
  if (!date) return res.status(400).json({ error: 'Missing date parameter (YYYY-MM-DD)' });

  const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return res.status(500).json({ error: 'Supabase service key not configured' });
  }

  const supabase = createClient(SUPABASE_URL.replace(/"/g, ''), SERVICE_KEY.replace(/"/g, ''));

  try {
    const { data: events, error: selErr } = await supabase.from('events').select('id, date, label').eq('date', date);
    if (selErr) throw selErr;
    if (!events || events.length === 0) return res.json({ deleted: 0, message: 'No events found' });

    for (const ev of events) {
      await supabase.from('event_songs').delete().eq('event_id', ev.id);
      await supabase.from('event_members').delete().eq('event_id', ev.id);
      await supabase.from('events').delete().eq('id', ev.id);
    }

    return res.json({ deleted: events.length });
  } catch (err) {
    console.error('delete-event error', err);
    return res.status(500).json({ error: err.message || String(err) });
  }
};
