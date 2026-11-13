import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import webPush from 'web-push';
const output=resolve(process.argv[2]||'/tmp/louvesync-push.env');
const keys=webPush.generateVAPIDKeys();
writeFileSync(output,`VAPID_PUBLIC_KEY=${keys.publicKey}\nVAPID_PRIVATE_KEY=${keys.privateKey}\nVAPID_SUBJECT=https://louvesync.vercel.app\nCRON_SECRET=${randomBytes(32).toString('hex')}\n`,{mode:0o600,flag:'wx'});
process.stdout.write('Variáveis criadas no arquivo privado: '+output+'\n');
