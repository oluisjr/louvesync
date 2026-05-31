const CACHE_NAME = 'louve-v' + Date.now();
const OFFLINE_FALLBACK = '/index.html';

const NETWORK_FIRST_PATHS = [
  '/',
  '/index.html',
  '/api/version',
  '/assets/'
];

const ASSETS_TO_PRECACHE = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/logo_solo.png'
];

// Instalação: pre-cache apenas essencial
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS_TO_PRECACHE).catch(err => {
        console.error('Precache failed:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Ativação: limpar caches antigos
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(names => {
      return Promise.all(
        names.map(name => {
          if (name !== CACHE_NAME) {
            console.log('Deleting old cache:', name);
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Estratégia: Network-First (online) → Cache (offline)
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip API calls que não sejam /api/version
  if (url.pathname.startsWith('/api/') && !url.pathname.startsWith('/api/version')) {
    return;
  }

  // Network-first para app core
  const isNetworkFirst = NETWORK_FIRST_PATHS.some(path => 
    url.pathname === path || url.pathname.startsWith(path)
  );

  if (isNetworkFirst) {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then(response => {
          // Store em cache se sucesso
          if (response && response.status === 200 && response.type === 'basic') {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(request, responseToCache);
            });
          }
          return response;
        })
        .catch(() => {
          // Fallback para cache ou offline page
          return caches.match(request).then(cachedResponse => {
            return cachedResponse || caches.match(OFFLINE_FALLBACK);
          });
        })
    );
  } else {
    // Cache-first para assets estáticos (CSS, JS, fonts)
    event.respondWith(
      caches.match(request)
        .then(response => {
          if (response) {
            // Revalidar em background
            fetch(request, { cache: 'no-store' })
              .then(newResponse => {
                if (newResponse && newResponse.status === 200) {
                  caches.open(CACHE_NAME).then(cache => {
                    cache.put(request, newResponse);
                  });
                }
              })
              .catch(() => {});
            return response;
          }
          return fetch(request, { cache: 'no-store' })
            .then(response => {
              if (response && response.status === 200 && response.type === 'basic') {
                const responseToCache = response.clone();
                caches.open(CACHE_NAME).then(cache => {
                  cache.put(request, responseToCache);
                });
              }
              return response;
            })
            .catch(() => caches.match(OFFLINE_FALLBACK));
        })
    );
  }
});

// Mensagens do cliente
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.keys().then(names => {
      Promise.all(names.map(name => caches.delete(name)));
    });
  }
});
