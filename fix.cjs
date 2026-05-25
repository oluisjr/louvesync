const fs = require('fs');
let code = fs.readFileSync('src/App.jsx', 'utf8');

// 1. Add ErrorBoundary at the top
if (!code.includes('class ErrorBoundary')) {
  code = code.replace(
    "import { searchSongCandidates, findSongData } from './lib/scraper';",
    `import { searchSongCandidates, findSongData } from './lib/scraper';

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, errorInfo) { console.error('ErrorBoundary caught an error:', error, errorInfo); }
  render() {
    if (this.state.hasError) {
      return <div style={{padding:20, color:'#DC2626', background:'#FEE2E2', borderRadius:8, margin:20, fontFamily:'sans-serif'}}>
        <h3 style={{marginTop:0}}>Ocorreu um erro ao renderizar esta tela.</h3>
        <p style={{fontSize:14, whiteSpace:'pre-wrap'}}>{this.state.error?.toString()}</p>
        <button onClick={() => window.location.reload()} style={{padding:'8px 16px', background:'#DC2626', color:'#fff', border:'none', borderRadius:4, cursor:'pointer'}}>Recarregar App</button>
      </div>;
    }
    return this.props.children;
  }
}`
  );
  code = code.replace(
    "import React, { useState, useEffect, useMemo, memo, useRef, useCallback } from 'react';",
    "import React, { useState, useEffect, useMemo, memo, useRef, useCallback, Component } from 'react';"
  );
}

// 2. Remove 4h logic
const sessionLogicRegex = /\/\* ── Session Expiry \(4h\) ── \*\/[\s\S]*?\}, \[profile\]\);/m;
code = code.replace(sessionLogicRegex, '');

// 3. Remove localStorage cache for songs/events
const fetchSongsRegex = /const fetchSongs = async \(\) => \{[\s\S]*?catch\{[\s\S]*?MOCK_SONGS\);\s*\}\s*\};/m;
const fetchEventsRegex = /const fetchEvents = async \(\) => \{[\s\S]*?catch\{[\s\S]*?MOCK_EVENTS\);\s*\}\s*\};/m;

code = code.replace(fetchSongsRegex, `const fetchSongs = async () => {
      try {
        const {data, error} = await supabase.from('songs').select('*');
        if(error) throw error;
        setSongs(data || []);
      }catch{
        setSongs(MOCK_SONGS);
      }
    };`);

code = code.replace(fetchEventsRegex, `const fetchEvents = async () => {
      try {
        const {data, error} = await supabase.from('events').select(\`
          *,
          event_songs (*),
          event_members (*)
        \`);
        if(error) throw error;
        const evs = (data||[]).map(normalizeEvent);
        setEvents(evs);
      }catch{
        setEvents(MOCK_EVENTS);
      }
    };`);

// 4. Wrap with ErrorBoundary
code = code.replace(
  "return <div style={{background:dark?'#0F172A':'#F8FAFC'",
  "return <ErrorBoundary><div style={{background:dark?'#0F172A':'#F8FAFC'"
);
code = code.replace(
  "    </div>;\n}",
  "    </div></ErrorBoundary>;\n}"
);

fs.writeFileSync('src/App.jsx', code);
console.log('Fixed App.jsx successfully!');
