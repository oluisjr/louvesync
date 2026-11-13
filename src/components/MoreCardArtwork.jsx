import { useId } from 'react';

export default function MoreCardArtwork({ destination }) {
  const gradient = useId();
  if (!['repertorio', 'patrimonio', 'ensaio', 'ia', 'membros', 'admin'].includes(destination)) return null;

  return <svg className="app-more-artwork" viewBox="0 0 120 84" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <defs><linearGradient id={gradient} x1="35" y1="8" x2="104" y2="80" gradientUnits="userSpaceOnUse"><stop stopColor="var(--more-art-highlight)"/><stop offset="1" stopColor="var(--more-art-color)"/></linearGradient></defs>
    <path d="M12 75c29-28 57 10 108-20M32 84c27-19 55-5 88-24" stroke="var(--more-art-color)" opacity=".3"/>
    <g fill={`url(#${gradient})`}>
      {destination === 'repertorio' && <g transform="rotate(-10 80 45)"><rect x="49" y="9" width="57" height="65" rx="9"/><path d="M59 24h35M59 31h35M59 38h35M59 45h35" opacity=".4"/><path d="M76 57V29l16-3v26" fill="none" strokeWidth="3"/><ellipse cx="70" cy="58" rx="6" ry="4"/><ellipse cx="86" cy="53" rx="6" ry="4"/></g>}
      {destination === 'patrimonio' && <><rect x="38" y="33" width="65" height="41" rx="7"/><path d="M61 33v-7h20v7M38 47h65M51 43v9m38-9v9"/><rect x="79" y="9" width="30" height="33" rx="5"/><circle cx="94" cy="28" r="7"/><circle cx="94" cy="16" r="2"/></>}
      {destination === 'ensaio' && <g transform="rotate(22 79 40)"><rect x="66" y="6" width="25" height="42" rx="12.5"/><path d="M58 32v5a21 21 0 0 0 42 0v-5M79 58v18m-13 0h26M72 17h13M72 23h13M72 29h13" fill="none"/><path d="M48 14c-7 9-7 18 0 27m63-27c7 9 7 18 0 27" fill="none" opacity=".5"/></g>}
      {destination === 'ia' && <><path d="M41 18a9 9 0 0 1 9-9h51a9 9 0 0 1 9 9v34a9 9 0 0 1-9 9H73L55 75V61h-5a9 9 0 0 1-9-9Z"/><path d="m79 21 4 11 11 4-11 4-4 11-4-11-11-4 11-4ZM48 7l2-6 2 6 6 2-6 2-2 6-2-6-6-2Z"/></>}
      {destination === 'membros' && <><circle cx="77" cy="28" r="13"/><circle cx="48" cy="34" r="10"/><circle cx="105" cy="34" r="10"/><path d="M55 76V62a22 22 0 0 1 44 0v14ZM27 70V60a17 17 0 0 1 24-15m52 0a17 17 0 0 1 24 15v10"/></>}
      {destination === 'admin' && <><rect x="40" y="9" width="66" height="64" rx="12"/><path d="M54 25h38M54 41h38M54 57h38"/><circle cx="65" cy="25" r="5"/><circle cx="82" cy="41" r="5"/><circle cx="68" cy="57" r="5"/><path d="m96 51 16 6v12c0 8-10 14-16 17-6-3-16-9-16-17V57Z"/><path d="m89 67 5 5 9-10" fill="none"/></>}
    </g>
  </svg>;
}
