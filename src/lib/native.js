import { Capacitor, registerPlugin } from '@capacitor/core';
const printer = registerPlugin('LouvePrint');
const microphone = registerPlugin('MicrophoneAccess');
export async function printCifra() {
  if (!Capacitor.isNativePlatform()) { window.print(); return; }
  const content = document.getElementById('print-cifra');
  if (!content) throw new Error('Abra uma cifra para imprimir.');
  await printer.printDocument({ html: `<html><head><meta charset="utf-8"><style>body{padding:24px;font-family:sans-serif}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:14px;line-height:1.7}</style></head><body>${content.innerHTML}</body></html>` });
}
export async function requestMicrophone() {
  if (Capacitor.isNativePlatform()) {
    const result = await microphone.request();
    if (!result.granted) throw new Error('Permita o microfone nas configurações do Android para gravar.');
  }
}
