import { useEffect, useState } from 'react';
import { readCache, writeCache } from '../lib/domain.js';
import { bibleLibraryKey, normalizeBibleLibrary, updateBibleLibrary } from '../lib/bible-library.js';

export function useBibleLibrary(profileId) {
  const key=bibleLibraryKey(profileId);
  const [library,setLibrary]=useState(()=>normalizeBibleLibrary(readCache(key,null)));
  const [error,setError]=useState('');
  useEffect(()=>{
    const update=event=>{if(event.key===key || event.key===null)setLibrary(normalizeBibleLibrary(readCache(key,null)));};
    window.addEventListener('storage',update);
    return ()=>window.removeEventListener('storage',update);
  },[key]);
  const update=(verse,patch)=>{
    const next=updateBibleLibrary(readCache(key,library),verse,patch);
    if (!writeCache(key,next)) {setError('Não foi possível guardar a alteração neste aparelho. Libere espaço e tente novamente.');return false;}
    setLibrary(next);setError('');return true;
  };
  return {items:library.items,error,update};
}
