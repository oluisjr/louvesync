import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { setTimeout } from 'node:timers/promises';
const exec=promisify(execFile),env={...process.env};
for(const key of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH'])delete env[key];
const name='louvesync-notifications-'+randomUUID().slice(0,8);
const docker=(...args)=>exec('docker',['--host=unix:///var/run/docker.sock',...args],{env,maxBuffer:2*1024*1024});
try{
 await docker('run','--rm','-d','--network','none','--name',name,'-e','POSTGRES_HOST_AUTH_METHOD=trust','-e','POSTGRES_DB=louvesync_test','postgres:17-alpine');
 let ready=false;
 for(let attempt=0;attempt<30;attempt++){try{await docker('exec',name,'pg_isready','-h','127.0.0.1','-U','postgres','-d','louvesync_test');ready=true;break;}catch{await setTimeout(500);}}
 if(!ready)throw new Error('PostgreSQL de teste não iniciou.');
 await docker('exec',name,'mkdir','-p','/app');
 await docker('cp',resolve('supabase/migrations/20261113_notifications.sql'),name+':/app/migration.sql');
 await docker('cp',resolve('tests/sql/notifications.sql'),name+':/app/notifications.sql');
 const result=await docker('exec',name,'psql','-U','postgres','-d','louvesync_test','-v','ON_ERROR_STOP=1','-f','/app/notifications.sql');
 process.stdout.write(result.stdout);
}finally{await docker('rm','-f',name).catch(()=>{});}
