// api/setlist.js — endpoint público para exibir setlist sem login (telão, operador de datashow)
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  const { id } = req.query;
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  if (!id) return res.status(400).json({ error: 'Event ID required' });

  try {
    const { data: ev, error } = await supabase
      .from('events')
      .select(`*, event_songs(*, songs(*)), event_members(member_id)`)
      .eq('id', id)
      .single();

    if (error || !ev) return res.status(404).json({ error: 'Event not found' });

    const songs = (ev.event_songs || [])
      .sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
      .filter(es => es.item_type !== 'note' && es.songs)
      .map(es => ({ title: es.songs.title, artist: es.songs.artist, key: es.songs.key, cat: es.songs.cat }));

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${ev.label} — LouveSync</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Inter',sans-serif; background:#05091A; color:#E2E8F0; min-height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:flex-start; padding:32px 16px; }
  .logo { font-size:13px; color:#64748B; margin-bottom:24px; letter-spacing:.12em; text-transform:uppercase; }
  .ev-name { font-size:clamp(22px,5vw,36px); font-weight:900; color:#fff; text-align:center; margin-bottom:6px; }
  .ev-meta { font-size:14px; color:#94A3B8; margin-bottom:8px; text-align:center; }
  .ev-theme { font-size:14px; color:#818CF8; margin-bottom:28px; text-align:center; font-style:italic; }
  .list { width:100%; max-width:520px; }
  .item { display:flex; align-items:center; gap:14px; padding:16px 18px; border-radius:16px; margin-bottom:10px; background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.07); }
  .num { width:32px; height:32px; border-radius:10px; background:rgba(79,70,229,.2); color:#818CF8; font-size:13px; font-weight:900; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
  .song-info { flex:1; }
  .song-title { font-size:17px; font-weight:800; color:#E2E8F0; }
  .song-artist { font-size:13px; color:#94A3B8; margin-top:2px; }
  .key { background:rgba(123,63,242,.15); color:#A78BFA; border:1px solid rgba(123,63,242,.3); border-radius:100px; padding:3px 12px; font-size:12px; font-weight:800; font-family:monospace; flex-shrink:0; }
  .footer { margin-top:32px; font-size:11px; color:#334155; text-align:center; }
</style>
</head>
<body>
<div class="logo">🎵 LouveSync · IMWAL</div>
<div class="ev-name">${ev.label}</div>
<div class="ev-meta">${ev.date} · ${ev.time}</div>
${ev.theme ? `<div class="ev-theme">📖 ${ev.theme}</div>` : ''}
<div class="list">
${songs.map((s, i) => `<div class="item">
  <div class="num">${i + 1}</div>
  <div class="song-info">
    <div class="song-title">${s.title}</div>
    <div class="song-artist">${s.artist}</div>
  </div>
  <div class="key">${s.key}</div>
</div>`).join('')}
</div>
<div class="footer">Gerado por LouveSync — Apenas leitura</div>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html');
    res.status(200).send(html);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
