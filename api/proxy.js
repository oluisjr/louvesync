import axios from 'axios';
import { sourceUrl, validateRedirect } from '../server/source-url.js';
export default async function handler(req, res) {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'Missing url' });

  try {
    const scraperKey = process.env.SCRAPERAPI_KEY;
    let targetUrl = sourceUrl(url);
    if (scraperKey) {
       targetUrl = `https://api.scraperapi.com/?api_key=${scraperKey}&url=${encodeURIComponent(targetUrl)}`;
    }
    const response = await axios.get(targetUrl,{timeout:20000,maxContentLength:5000000,beforeRedirect:validateRedirect,headers:{'User-Agent':'Mozilla/5.0'}});
    const text = response.data;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).send(text);
  } catch (error) {
    res.status(error.message.includes('URL')?400:502).json({ error: 'Não foi possível buscar o conteúdo desta URL.' });
  }
}

