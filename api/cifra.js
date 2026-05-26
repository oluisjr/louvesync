import axios from "axios";
import * as cheerio from "cheerio";
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function fetchHtml(url) {
  const scraperKey = process.env.SCRAPERAPI_KEY;

  // Strategy 1: ScraperAPI render=false (fastest, works for CifraClub server-side HTML)
  if (scraperKey) {
    try {
      const proxyUrl = `http://api.scraperapi.com/?api_key=${scraperKey}&url=${encodeURIComponent(url)}&render=false&country_code=br`;
      const r = await axios.get(proxyUrl, { headers: { 'User-Agent': UA, 'Accept-Language': 'pt-BR,pt;q=0.9' }, timeout: 20000 });
      const html = r.data;
      if (html && html.length > 1000 && !html.includes('cf-browser-verification') && !html.includes('Just a moment')) {
        console.log('[cifra] ScraperAPI render=false OK, length:', html.length);
        return html;
      }
    } catch (e) {
      console.warn('[cifra] ScraperAPI render=false failed:', e.message);
    }
  }

  // Strategy 2: Direct fetch (works from Vercel servers in some regions)
  try {
    const r = await axios.get(url, {
      headers: {
        'User-Agent': UA,
        'Accept-Language': 'pt-BR,pt;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Referer': 'https://www.google.com/',
      },
      timeout: 15000
    });
    const html = r.data;
    if (html && html.length > 1000 && !html.includes('cf-browser-verification') && !html.includes('Just a moment')) {
      console.log('[cifra] Direct fetch OK, length:', html.length);
      return html;
    }
  } catch (e) {
    console.warn('[cifra] Direct fetch failed:', e.message);
  }

  // Strategy 3: ScraperAPI render=true (slowest fallback, uses JS rendering)
  if (scraperKey) {
    try {
      const proxyUrl = `http://api.scraperapi.com/?api_key=${scraperKey}&url=${encodeURIComponent(url)}&render=true&country_code=br`;
      const r = await axios.get(proxyUrl, { headers: { 'User-Agent': UA }, timeout: 45000 });
      console.log('[cifra] ScraperAPI render=true OK, length:', r.data?.length);
      return r.data;
    } catch (e) {
      console.warn('[cifra] ScraperAPI render=true failed:', e.message);
    }
  }

  return null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: "Missing URL parameter" });

    // Cache primeiro
    try {
      const { data: cached } = await supabase
        .from('songs_cache')
        .select('content')
        .eq('source_url', url)
        .single();
      if (cached?.content) {
        console.log('[cifra] Cache hit for', url);
        return res.status(200).json(cached.content);
      }
    } catch(e) { /* cache miss, continue */ }

    const html = await fetchHtml(url);

    if (!html) {
      return res.status(502).json({ error: 'A conexão foi bloqueada. Tente novamente mais tarde.' });
    }

    const $ = cheerio.load(html);

    // Seletores em ordem de prioridade para CifraClub
    let pre = $();
    const selectors = ['.cifra_cnt pre', 'pre.js-tab-content', '[data-js="cifra"] pre', '#cifra_cnt pre', '.js-cifra pre', 'pre'];
    for (const sel of selectors) {
      const el = $(sel).first();
      if (el.length) { pre = el; break; }
    }

    if (!pre.length) return res.status(404).json({ error: "Seção de acordes não encontrada na página." });

    // Extrair tom
    let key = 'C';
    const keySelectors = ['#cifra_tom a', '.tom a', '[data-key]', '.js-cifra-tom'];
    for (const sel of keySelectors) {
      const el = $(sel).first();
      if (el.length) { key = el.text().trim() || el.attr('data-key') || 'C'; break; }
    }

    // Converter acordes em [colchetes]
    pre.find('b').each(function () {
      const txt = $(this).text().trim();
      if (/^[A-G]/.test(txt)) $(this).replaceWith(`[${txt}]`);
    });
    pre.find('span[data-chord]').each(function () {
      const chord = $(this).attr('data-chord');
      if (chord) $(this).replaceWith(`[${chord}]`);
    });
    pre.find('a').each(function () {
      const txt = $(this).text().trim();
      if (/^[A-G]/.test(txt)) $(this).replaceWith(`[${txt}]`);
    });

    let rawText = pre.html()
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ').replace(/&#\d+;/g, ' ')
      .replace(/\r\n/g, '\n').replace(/\r/g, '\n')
      .replace(/\n{4,}/g, '\n\n\n')
      .trim();

    if (rawText.length < 50) {
      return res.status(404).json({ error: "Conteúdo muito curto — a página pode não ter renderizado corretamente." });
    }

    const result = { text: rawText, key, hasCifra: /\[[A-G]/.test(rawText) };

    // Salvar no cache
    supabase.from('songs_cache').insert({ source_url: url, content: result })
      .catch(err => console.error("Cache insert error:", err));

    return res.status(200).json(result);

  } catch (err) {
    console.error("Cifra API Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}