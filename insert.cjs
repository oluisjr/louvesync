const fs = require('fs');

async function testInsert() {
  const env = fs.readFileSync('.env', 'utf-8');
  let url = '', key = '';
  env.split('\n').forEach(line => {
    if(line.startsWith('VITE_SUPABASE_URL=')) url = line.split('=')[1].trim();
    if(line.startsWith('VITE_SUPABASE_ANON_KEY=')) key = line.split('=')[1].trim();
  });
  
  const member = {
    id: "00000000-0000-0000-0000-000000000000",
    name: 'Test',
    pin: '0000',
    instrument: '',
    is_admin: false,
    status: 'ativo',
    
    
    color: '#4F46E5',
    avatar: 'NM'
  };

  const res = await fetch(`${url}/rest/v1/members`, {
    method: 'POST',
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(member)
  });
  const data = await res.json();
  console.log("INSERT RESULT:", data);
}
testInsert();
