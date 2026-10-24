import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
const localApi = () => ({
  name: 'local-api',
  configureServer(server) {
    const env = loadEnv(server.config.mode, process.cwd(), '');
    for (const name of ['VITE_SUPABASE_URL','VITE_SUPABASE_ANON_KEY','SUPABASE_SERVICE_KEY','SCRAPERAPI_KEY','GROQ_API_KEY','VITE_GROQ_API_KEY']) if (env[name] && !process.env[name]) process.env[name] = env[name];
    server.middlewares.use(async (req,res,next) => {
      const url = new URL(req.url,'http://localhost');
      const name = url.pathname.match(/^\/api\/(proxy|cifra|maestro|setlist|version)$/)?.[1];
      if (!name) return next();
      try {
        req.query = Object.fromEntries(url.searchParams);
        if (req.method === 'POST') {
          let body = '';
          for await (const chunk of req) { body += chunk; if(body.length>70000){res.statusCode=413;return res.end('Request too large');} }
          req.body = JSON.parse(body || '{}');
        }
        res.status = code => {res.statusCode=code;return res;};
        res.json = data => {res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(data));};
        res.send = data => res.end(data);
        const {default:handler}=await import(`./api/${name}.js`);
        await handler(req,res);
      } catch {res.statusCode=500;res.end(JSON.stringify({error:'Falha na API local.'}));}
    });
  },
});
export default defineConfig({plugins:[react(),localApi()],build:{chunkSizeWarningLimit:1500}});
