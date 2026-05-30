import fs from 'fs';
import path from 'path';
import pdf from 'pdf-parse';

const publicDir = path.resolve(process.cwd(), 'public');
const files = fs.readdirSync(publicDir).filter(f => f.toLowerCase().endsWith('.pdf'));
if (files.length === 0) {
  console.error('No PDF files found in public/');
  process.exit(1);
}
const file = files[0];
const filePath = path.join(publicDir, file);
console.log('Using PDF:', filePath);

const buffer = fs.readFileSync(filePath);

(async function(){
  try{
    const data = await pdf(buffer);
    const text = String(data.text || '');
    console.log('=== RAW PDF TEXT (first 3000 chars) ===');
    console.log(text.slice(0, 3000));
    console.log('\n=== LINES (first 50 non-empty) ===');
    const lines = text.split('\n').filter(l => l.trim());
    lines.slice(0, 50).forEach((l, i) => console.log(`${i+1}: ${l}`));
  }catch(e){
    console.error('Failed:', e);
    process.exit(1);
  }
})();
