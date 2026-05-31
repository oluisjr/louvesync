import { createRoot } from 'react-dom/client'
import { Component } from 'react'
import './index.css'
import App from './App.jsx'

async function clearAllBrowserCache() {
  try {
    if ('caches' in window) {
      const names = await caches.keys();
      await Promise.all(names.map(name => caches.delete(name)));
    }
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map(registration => registration.unregister()));
    }
  } catch (error) {
    console.error('Failed to clear browser cache or service workers:', error);
  }
}

(async () => {
  await clearAllBrowserCache();
  createRoot(document.getElementById('root')).render(
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  );
})();

class RootErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) {
    console.error('🔴 ROOT Error Boundary caught:', error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{padding:24,background:'#0a0a0a',color:'#ff6b6b',fontFamily:'monospace',fontSize:13,minHeight:'100dvh',overflowY:'auto'}}>
          <div style={{fontSize:18,fontWeight:900,marginBottom:12,color:'#fff'}}>⚠️ Erro capturado</div>
          <div style={{background:'rgba(255,0,0,.12)',padding:12,borderRadius:8,marginBottom:12,whiteSpace:'pre-wrap',wordBreak:'break-word',border:'1px solid rgba(255,0,0,.3)'}}>
            {String(this.state.error?.message || this.state.error)}
          </div>
          <div style={{fontSize:11,opacity:.6,whiteSpace:'pre-wrap',wordBreak:'break-word',marginBottom:16}}>
            {this.state.error?.stack}
          </div>
          <button onClick={()=>this.setState({error:null})} style={{padding:'10px 20px',background:'#7B3FF2',color:'#fff',border:'none',borderRadius:8,cursor:'pointer',fontWeight:700,fontSize:14}}>
            Tentar novamente
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(
  <RootErrorBoundary>
    <App />
  </RootErrorBoundary>
);

// Register Service Worker (network-first strategy when online)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then(reg => {
        console.log('✓ Service Worker registered (network-first strategy)');
        // Check for updates every minute when online
        setInterval(() => {
          if (navigator.onLine) {
            reg.update().catch(console.error);
          }
        }, 60000);
      })
      .catch(err => console.log('SW registration failed:', err));
  });
}
