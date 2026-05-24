import axios from "axios";
import * as cheerio from "cheerio";
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  try {
    const { url } = req.query;
    if (!url) {
      return res.status(400).json({ error: "Missing URL parameter" });
    }

    console.log(`[cifra.js] Requesting: ${url}`);

    // PASSO 8 - Cache Verification
    const { data: cached } = await supabase
      .from('songs_cache')
      .select('content')
      .eq('source_url', url)
      .single();

    if (cached) {
      console.log(`[cifra.js] Cache HIT for: ${url}`);
      return res.status(200).json(cached.content);
    }

    console.log(`[cifra.js] Cache MISS for: ${url}, requesting via ScraperAPI...`);

    const response = await axios.get("http://api.scraperapi.com", {
      params: {
        api_key: process.env.SCRAPER_API_KEY,
        url,
        render: true,
        country_code: "br",
        premium: true
      },
      timeout: 30000
    });

    const html = response.data;
    
    // PASSO 7 - Detect blocks
    if (
      html.includes('Attention Required') ||
      html.includes('Cloudflare') ||
      html.includes('cf-browser-verification') ||
      html.includes('Just a moment')
    ) {
      console.log({ source: 'CifraClub', status: 403, htmlLength: html.length, blocked: true });
      throw new Error('Cloudflare detected or block occurred');
    }

    // PASSO 3 & 4 & 5 - Cheerio Parsing & Resilient Extraction
    const $ = cheerio.load(html);
    
    const pre = $('.cifra_cnt pre').first().length ? $('.cifra_cnt pre').first() :
                $('pre.js-tab-content').first().length ? $('pre.js-tab-content').first() :
                $('.tablatura').first().length ? $('.tablatura').first() :
                $('[class*=tablatura]').first().length ? $('[class*=tablatura]').first() :
                $('pre').first();
                
    if (!pre || pre.length === 0) {
       console.log({ source: 'CifraClub', status: 404, htmlLength: html.length, error: "No pre tags found" });
       return res.status(404).json({ error: "Could not find chords section" });
    }

    let key = 'C';
    const keyEl = $('#cifra_tom a').first();
    if (keyEl.length) {
      key = keyEl.text().trim();
    }

    // Convert CifraClub structure: <b>A</b> or <span data-chord="A">A</span>
    pre.find('b').each(function() {
      const text = $(this).text().trim();
      $(this).replaceWith(`[${text}]`);
    });
    
    pre.find('span[data-chord]').each(function() {
      const chord = $(this).attr('data-chord');
      $(this).replaceWith(`[${chord}]`);
    });

    // Extract text ignoring other tags but keeping whitespace
    // We get HTML and strip tags manually to preserve \n
    let rawHtml = pre.html();
    rawHtml = rawHtml.replace(/<[^>]+>/g, '');
    rawHtml = rawHtml.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
    
    let rawText = rawHtml.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    
    if (rawText.length < 50) {
      return res.status(404).json({ error: "Extracted text is too short" });
    }
    
    const result = {
      text: rawText,
      key,
      hasCifra: /\[[A-G]/.test(rawText)
    };

    console.log({ source: 'CifraClub', status: 200, htmlLength: html.length, success: true });

    // PASSO 8 - Save to cache
    await supabase.from('songs_cache').insert({
      source_url: url,
      content: result
    }).catch(err => console.error("Cache save error:", err));

    res.status(200).json(result);

  } catch (err) {
    console.error("Cifra API Error:", err.message);
    res.status(500).json({ error: "Erro ao buscar cifra" });
  }
}
