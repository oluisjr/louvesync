import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import * as cheerio from 'cheerio'

// ─── Plugin local: Proxy + Cifra handler (dev only) ──────────────────────────
const localScraperPlugin = () => ({
  name: 'local-scraper-proxy',
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      const envObj = loadEnv('', process.cwd(), '');
      const scraperKey = envObj.SCRAPERAPI_KEY; // corrigido: igual ao .env

      // ── /api/proxy — proxy genérico de CORS ─────────────────────────────────
      if (req.url?.startsWith('/api/proxy?url=')) {
        const targetUrl = new URL(req.url, 'http://localhost').searchParams.get('url');
        if (!targetUrl) { res.statusCode = 400; return res.end('Missing url'); }

        try {
          let fetchTarget = targetUrl;
          if (scraperKey) {
            fetchTarget = `http://api.scraperapi.com/?api_key=${scraperKey}&render=true&url=${encodeURIComponent(targetUrl)}`;
          }
          const fetchRes = await fetch(fetchTarget, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
            }
          });
          const text = await fetchRes.text();
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.end(text);
        } catch (e) {
          res.statusCode = 500;
          res.end(e.toString());
        }
        return;
      }

      // ── /api/cifra — extrai letra+acordes de URL do CifraClub ───────────────
      if (req.url?.startsWith('/api/cifra')) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Access-Control-Allow-Origin', '*');

        const targetUrl = new URL(req.url, 'http://localhost').searchParams.get('url');
        if (!targetUrl) {
          res.statusCode = 400;
          return res.end(JSON.stringify({ error: 'Missing url' }));
        }

        try {
          let fetchTarget = targetUrl;
          if (scraperKey) {
            // render=true necessário para o JS do CifraClub executar e popular os acordes
            fetchTarget = `http://api.scraperapi.com/?api_key=${scraperKey}&url=${encodeURIComponent(targetUrl)}&render=true&country_code=br`;
          }

          const fetchRes = await fetch(fetchTarget, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept-Language': 'pt-BR,pt;q=0.9',
            },
            signal: AbortSignal.timeout(30000),
          });

          const html = await fetchRes.text();

          if (
            html.includes('cf-browser-verification') ||
            html.includes('Just a moment') ||
            html.includes('Enable JavaScript and cookies')
          ) {
            res.statusCode = 403;
            return res.end(JSON.stringify({ error: 'Blocked by Cloudflare' }));
          }

          const $ = cheerio.load(html);

          // Seletores em ordem de prioridade
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

          if (!pre.length) {
            res.statusCode = 404;
            return res.end(JSON.stringify({ error: 'Chords section not found' }));
          }

          // Extrair tom
          let key = 'C';
          const keySelectors = ['#cifra_tom a', '.tom a', '[data-key]', '.js-cifra-tom'];
          for (const sel of keySelectors) {
            const el = $(sel).first();
            if (el.length) { key = el.text().trim() || el.attr('data-key') || 'C'; break; }
          }

          // Converter acordes para formato [Acorde]
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
            res.statusCode = 404;
            return res.end(JSON.stringify({ error: 'Content too short — page may not have rendered' }));
          }

          const result = { text: rawText, key, hasCifra: /\[[A-G]/.test(rawText) };
          res.statusCode = 200;
          res.end(JSON.stringify(result));

        } catch (e) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: e.message }));
        }
        return;
      }

      next();
    });
  }
});


export default defineConfig({
  plugins: [
    react(),
    localScraperPlugin(),

  ],
  build: {
    chunkSizeWarningLimit: 1500
  }
})
