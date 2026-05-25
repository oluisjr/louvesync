const fs = require('fs');

async function check() {
  const env = fs.readFileSync('.env', 'utf-8');
  let url = '', key = '';
  env.split('\n').forEach(line => {
    if(line.startsWith('VITE_SUPABASE_URL=')) url = line.split('=')[1].trim();
    if(line.startsWith('VITE_SUPABASE_ANON_KEY=')) key = line.split('=')[1].trim();
  });
  
  const res = await fetch(`${url}/rest/v1/members?select=*&limit=1`, {
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`
    }
  });
  const data = await res.json();
  console.log(data);
}
check();
