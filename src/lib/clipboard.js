// Some installed browsers/WebViews do not expose Clipboard API, even on HTTPS.
// Try the platform API first, then a selection-based copy during the click.
export async function copyTextToClipboard(text) {
  try {
    if (typeof navigator.clipboard?.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* Fall through when the browser denies clipboard permission. */ }
  const previous = document.activeElement;
  const selection = document.createElement('textarea');
  selection.value = text;
  selection.setAttribute('readonly', '');
  selection.setAttribute('aria-label', 'Texto para copiar');
  selection.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none;font-size:16px;';
  document.body.appendChild(selection);
  try {
    selection.focus({ preventScroll: true });
    selection.select();
    selection.setSelectionRange(0, selection.value.length);
    return typeof document.execCommand === 'function' && document.execCommand('copy');
  } catch { return false; }
  finally {
    selection.remove();
    if (previous?.isConnected) previous.focus({ preventScroll: true });
  }
}
