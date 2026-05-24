import axios from "axios";
import * as cheerio from "cheerio";
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: "Missing URL parameter" });

    // Cache primeiro
    const { data: cached } = await supabase
      .from('songs_cache')
      .select('content')
      .eq('source_url', url)
      .single();

    if (cached) return res.status(200).json(cached.content);

    // SCRAPERAPI_KEY — corrigido (era SCRAPER_API_KEY, incompatível com .env)
    const scraperKey = process.env.SCRAPERAPI_KEY;

    let fetchUrl = url;
    if (scraperKey) {
      // render: true necessário para garantir que o JS do CifraClub execute e popule os acordes
      fetchUrl = `http://api.scraperapi.com/?api_key=${scraperKey}&url=${encodeURIComponent(url)}&render=true&country_code=br`;
    }

    const response = await axios.get(fetchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      },
      timeout: 25000
    });

    const html = response.data;

    // Detecção de bloqueio
    if (
      html.includes('cf-browser-verification') ||
      html.includes('Just a moment') ||
      html.includes('Enable JavaScript and cookies')
    ) {
      return res.status(403).json({ error: 'Blocked by Cloudflare' });
    }

    const $ = cheerio.load(html);

    // Seletores em ordem de prioridade para CifraClub
    // 1. Wrapper principal moderno: .cifra_cnt pre
    // 2. Classe JS legacy: pre.js-tab-content
    // 3. Atributo data-js: [data-js="cifra"] pre
    // 4. Qualquer <pre> na página
    let pre = $();
    const selectors = [
      '.cifra_cnt pre',
      'pre.js-tab-content',
      '[data-js="cifra"] pre',
      '#cifra_cnt pre',
      '.js-cifra pre',
      'pre',
    ];
    for (const sel of selectors) {
      const el = $(sel).first();
      if (el.length) { pre = el; break; }
    }

    if (!pre.length) return res.status(404).json({ error: "Chords section not found" });

    // Extrair tom
    let key = 'C';
    const keySelectors = ['#cifra_tom a', '.tom a', '[data-key]', '.js-cifra-tom'];
    for (const sel of keySelectors) {
      const el = $(sel).first();
      if (el.length) { key = el.text().trim() || el.attr('data-key') || 'C'; break; }
    }

    // Converter acordes: <b>Acorde</b> e <span data-chord="..."> → [Acorde]
    pre.find('b').each(function () {
      const txt = $(this).text().trim();
      if (/^[A-G]/.test(txt)) $(this).replaceWith(`[${txt}]`);
    });
    pre.find('span[data-chord]').each(function () {
      const chord = $(this).attr('data-chord');
      if (chord) $(this).replaceWith(`[${chord}]`);
    });
    // Links de acorde: <a ...>Dm</a>
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

    if (rawText.length < 50) return res.status(404).json({ error: "Content too short — page may not have rendered" });

    const result = { text: rawText, key, hasCifra: /\[[A-G]/.test(rawText) };

    // Salvar no cache
    await supabase.from('songs_cache').insert({ source_url: url, content: result })
      .catch(err => console.error("Cache error:", err));

    res.status(200).json(result);

  } catch (err) {
    console.error("Cifra API Error:", err.message);
    res.status(500).json({ error: err.message });
  }
}