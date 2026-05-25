import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function test() {
  const member = {
    id: "00000000-0000-0000-0000-000000000000",
    name: 'Test',
    pin: '0000',
    instrument: '',
    is_admin: false,
    status: 'ativo',
    permissions: ['home','repertorio','escala','devocional','treinamento','membros'],
    unavailableDays: [],
    color: '#4F46E5',
    avatar: 'NM'
  };

  const { data, error } = await supabase.from('members').upsert([member]).select();
  console.log("ERROR:", error);
  console.log("DATA:", data);
}

test();
