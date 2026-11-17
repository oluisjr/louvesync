let opened;
function database() {
  if(!opened)opened=new Promise((resolve,reject)=>{
    const request=indexedDB.open('louvesync-offline-media',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('blobs');
    request.onerror=()=>{opened=null;reject(new Error('Não foi possível abrir o armazenamento de áudio neste aparelho.'));};
    request.onsuccess=()=>resolve(request.result);
  });
  return opened;
}
async function transaction(mode,action){
  const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction('blobs',mode),request=action(tx.objectStore('blobs'));tx.oncomplete=()=>resolve(request?.result);tx.onerror=tx.onabort=()=>reject(new Error('Não foi possível salvar o áudio no aparelho. Verifique o espaço disponível.'));});
}
export const saveOfflineBlob=(id,blob)=>transaction('readwrite',store=>store.put(blob,id));
export const readOfflineBlob=id=>transaction('readonly',store=>store.get(id));
export const removeOfflineBlob=id=>transaction('readwrite',store=>store.delete(id));
